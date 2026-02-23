/**
 * OpenAI Codex Usage Fetcher
 *
 * Fetches usage data from OpenAI's Codex usage API with automatic token refresh.
 */

import type {
  ResolvedOpenAIAuthToken,
  ProviderUsageSnapshot,
  OpenAIUsageApiResponse
} from "./provider-usage.types.js"
import { isOpenAIUsageApiResponse, buildOpenAIUsageWindows } from "./provider-usage.types.js"
import { fetchJson, buildErrorSnapshot } from "./fetch-utils.js"

const CHATGPT_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
const TOKEN_REFRESH_URL = "https://auth.openai.com/oauth/token"
const REFRESH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"

export interface FetchOpenAIUsageOptions {
  token: ResolvedOpenAIAuthToken
  timeoutMs?: number | undefined
  fetchFn?: typeof fetch | undefined
  nowMs?: number | undefined
}

/**
 * Refresh the access token using the refresh token.
 * Returns new access token or null on failure.
 */
async function refreshAccessToken(
  refreshToken: string,
  timeoutMs: number | undefined,
  fetchFn: typeof fetch | undefined
): Promise<string | null> {
  const result = await fetchJson(
    TOKEN_REFRESH_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: REFRESH_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "openid profile email"
      })
    },
    timeoutMs,
    fetchFn
  )

  if (!result.ok) {
    return null
  }

  if (typeof result.data !== "object" || result.data === null) {
    return null
  }

  const data = result.data as Record<string, unknown>
  const accessToken = data.access_token
  if (typeof accessToken === "string" && accessToken.length > 0) {
    return accessToken
  }

  return null
}

/**
 * Build a success snapshot from API response data.
 */
function buildSuccessSnapshot(
  data: OpenAIUsageApiResponse,
  fetchedAtMs: number
): ProviderUsageSnapshot {
  const windows = buildOpenAIUsageWindows(data)

  return {
    provider: "openai",
    fetchedAtMs,
    windows
  }
}

/**
 * Fetch usage data with automatic retry on token expiration.
 * Will attempt token refresh once if 401 and refreshToken available.
 */
async function fetchUsageWithRetry(
  token: ResolvedOpenAIAuthToken,
  timeoutMs: number | undefined,
  fetchFn: typeof fetch | undefined,
  fetchedAtMs: number,
  isRetry: boolean
): Promise<ProviderUsageSnapshot> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.accessToken}`,
    Accept: "application/json",
    "User-Agent": "opencode-status-hud"
  }

  if (token.accountId !== undefined) {
    headers["ChatGPT-Account-Id"] = token.accountId
  }

  const result = await fetchJson(
    CHATGPT_USAGE_URL,
    { headers },
    timeoutMs,
    fetchFn
  )

  if (!result.ok) {
    // Handle 401 with token refresh
    if (result.status === 401 && token.kind === "jwt" && !isRetry && token.refreshToken !== undefined) {
      const newAccessToken = await refreshAccessToken(token.refreshToken, timeoutMs, fetchFn)
      if (newAccessToken !== null) {
        // Retry with new token
        const newToken: ResolvedOpenAIAuthToken = {
          ...token,
          accessToken: newAccessToken
        }
        return fetchUsageWithRetry(newToken, timeoutMs, fetchFn, fetchedAtMs, true)
      }
    }

    return buildErrorSnapshot({
      provider: "openai",
      status: result.status,
      message: result.message,
      fetchedAtMs
    })
  }

  if (!isOpenAIUsageApiResponse(result.data)) {
    return buildErrorSnapshot({
      provider: "openai",
      status: result.status,
      message: "invalid response",
      fetchedAtMs
    })
  }

  return buildSuccessSnapshot(result.data, fetchedAtMs)
}

/**
 * Fetch OpenAI Codex usage data.
 */
export async function fetchOpenAIUsage(
  options: FetchOpenAIUsageOptions
): Promise<ProviderUsageSnapshot> {
  const fetchedAtMs = options.nowMs ?? Date.now()
  const { token, timeoutMs, fetchFn } = options

  return fetchUsageWithRetry(token, timeoutMs, fetchFn, fetchedAtMs, false)
}
