/**
 * Claude Usage Fetcher
 *
 * Fetches usage data from Anthropic's Usage API with OAuth and Web API fallback.
 */

import type { ResolvedAuthToken, ProviderUsageSnapshot, AnthropicUsageApiResponse } from "./provider-usage.types.js"
import { buildUsageWindows, isUsageApiResponse, clampPercent } from "./provider-usage.types.js"
import { fetchJson, buildErrorSnapshot } from "./fetch-utils.js"

const OAUTH_USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
const WEB_ORGS_URL = "https://claude.ai/api/organizations"
const ANTHROPIC_BETA_HEADER = "oauth-2025-04-20"

export interface FetchClaudeUsageOptions {
  token: ResolvedAuthToken
  timeoutMs?: number | undefined
  fetchFn?: typeof fetch | undefined
  nowMs?: number | undefined
}

/**
 * Rescale extra_usage values for non-enterprise plans.
 * Non-enterprise plans may report 100x inflated values.
 */
function rescaleExtraUsage(response: AnthropicUsageApiResponse): ProviderUsageSnapshot["extraUsage"] | undefined {
  const extra = response.extra_usage
  if (extra === undefined || extra.is_enabled !== true) {
    return undefined
  }

  let monthlyLimitCents = extra.monthly_limit ?? 0
  let usedCents = extra.used_credits ?? 0

  // Non-enterprise plans may report 100x inflated values
  if (monthlyLimitCents >= 100_000) {
    monthlyLimitCents = Math.round(monthlyLimitCents / 100)
    usedCents = Math.round(usedCents / 100)
  }

  return {
    enabled: true,
    monthlyLimitCents,
    usedCents,
    utilization: clampPercent(extra.utilization ?? 0),
    currency: extra.currency ?? "usd"
  }
}

/**
 * Build a success snapshot from API response data.
 */
function buildSuccessSnapshot(
  data: AnthropicUsageApiResponse,
  fetchedAtMs: number
): ProviderUsageSnapshot {
  const windows = buildUsageWindows(data)
  const extraUsage = rescaleExtraUsage(data)

  return {
    provider: "anthropic",
    fetchedAtMs,
    windows,
    extraUsage
  }
}

/**
 * Fetch usage via OAuth API.
 */
async function fetchOAuthUsage(
  token: ResolvedAuthToken,
  timeoutMs: number | undefined,
  fetchFn: typeof fetch | undefined,
  fetchedAtMs: number
): Promise<ProviderUsageSnapshot> {
  const result = await fetchJson(
    OAUTH_USAGE_URL,
    {
      headers: {
        Authorization: `Bearer ${token.token}`,
        "anthropic-beta": ANTHROPIC_BETA_HEADER,
        Accept: "application/json"
      }
    },
    timeoutMs,
    fetchFn
  )

  if (!result.ok) {
    if (result.status === 401) {
      return buildErrorSnapshot({ status: 401, message: "token_expired", fetchedAtMs })
    }
    if (result.status === 403) {
      return buildErrorSnapshot({ status: 403, message: "scope_error", fetchedAtMs })
    }
    return buildErrorSnapshot({ status: result.status, message: result.message, fetchedAtMs })
  }

  if (!isUsageApiResponse(result.data)) {
    return buildErrorSnapshot({ status: result.status, message: "invalid response", fetchedAtMs })
  }

  return buildSuccessSnapshot(result.data, fetchedAtMs)
}

/**
 * Validate that org list response is an array with at least one org having a uuid.
 */
function isValidOrgList(data: unknown): data is Array<{ uuid: string }> {
  if (!Array.isArray(data) || data.length === 0) {
    return false
  }
  const firstOrg = data[0]
  if (firstOrg === undefined || firstOrg === null || typeof firstOrg !== "object") {
    return false
  }
  const org = firstOrg as Record<string, unknown>
  return typeof org.uuid === "string"
}

/**
 * Extract organization UUID from org list response.
 */
function extractOrgUuid(data: unknown): string | undefined {
  if (!isValidOrgList(data)) {
    return undefined
  }
  const firstOrg = data[0]
  if (firstOrg === undefined) {
    return undefined
  }
  return firstOrg.uuid
}

/**
 * Fetch usage via Web API (session token).
 */
async function fetchWebUsage(
  token: ResolvedAuthToken,
  timeoutMs: number | undefined,
  fetchFn: typeof fetch | undefined,
  fetchedAtMs: number
): Promise<ProviderUsageSnapshot> {
  // Step 1: Fetch org list
  const orgsResult = await fetchJson(
    WEB_ORGS_URL,
    {
      headers: {
        Cookie: `sessionKey=${token.token}`,
        Accept: "application/json"
      }
    },
    timeoutMs,
    fetchFn
  )

  if (!orgsResult.ok) {
    return buildErrorSnapshot({ status: orgsResult.status, message: orgsResult.message, fetchedAtMs })
  }

  // Step 2: Extract UUID from org list
  const orgUuid = extractOrgUuid(orgsResult.data)
  if (orgUuid === undefined) {
    return buildErrorSnapshot({ status: orgsResult.status, message: "invalid org list", fetchedAtMs })
  }

  // Step 3: Fetch usage for the organization
  const usageUrl = `https://claude.ai/api/organizations/${orgUuid}/usage`
  const usageResult = await fetchJson(
    usageUrl,
    {
      headers: {
        Cookie: `sessionKey=${token.token}`,
        Accept: "application/json"
      }
    },
    timeoutMs,
    fetchFn
  )

  if (!usageResult.ok) {
    return buildErrorSnapshot({ status: usageResult.status, message: usageResult.message, fetchedAtMs })
  }

  if (!isUsageApiResponse(usageResult.data)) {
    return buildErrorSnapshot({ status: usageResult.status, message: "invalid response", fetchedAtMs })
  }

  return buildSuccessSnapshot(usageResult.data, fetchedAtMs)
}

/**
 * Fetch Claude usage data using OAuth or Web API based on token kind.
 */
export async function fetchClaudeUsage(options: FetchClaudeUsageOptions): Promise<ProviderUsageSnapshot> {
  const fetchedAtMs = options.nowMs ?? Date.now()
  const { token, timeoutMs, fetchFn } = options

  if (token.kind === "oauth") {
    return fetchOAuthUsage(token, timeoutMs, fetchFn, fetchedAtMs)
  }

  if (token.kind === "session") {
    return fetchWebUsage(token, timeoutMs, fetchFn, fetchedAtMs)
  }

  // Exhaustive check - should not happen with proper types
  return buildErrorSnapshot({ status: 400, message: "unknown token kind", fetchedAtMs })
}
