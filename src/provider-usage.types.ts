/**
 * Provider Usage Types and Utilities
 *
 * Types for Anthropic Usage API contract and internal snapshot model,
 * plus utility functions for parsing and normalization.
 */

/** Provider key union for multi-provider support */
export type ProviderKey = "anthropic" | "openai"

/** Matches the confirmed Anthropic OAuth Usage API response */
export interface AnthropicUsageApiResponse {
  five_hour?: { utilization?: number; resets_at?: string } | undefined
  seven_day?: { utilization?: number; resets_at?: string } | undefined
  seven_day_sonnet?: { utilization?: number } | undefined
  seven_day_opus?: { utilization?: number } | undefined
  extra_usage?: {
    is_enabled?: boolean
    monthly_limit?: number
    used_credits?: number
    utilization?: number
    currency?: string
  } | undefined
}

/** Internal normalized usage window */
export interface UsageWindow {
  label: string // "5h", "7d", "7d-sonnet", "7d-opus"
  usedPercent: number // 0-100, clamped
  resetAtMs?: number | undefined // epoch ms from resets_at ISO 8601
}

/** Snapshot of provider usage at a point in time */
export interface ProviderUsageSnapshot {
  provider: ProviderKey
  fetchedAtMs: number
  windows: UsageWindow[]
  extraUsage?: {
    enabled: boolean
    monthlyLimitCents: number
    usedCents: number
    utilization: number
    currency: string
  } | undefined
  error?: string | undefined
}

/** Where the auth token was found */
export type AuthTokenSource =
  | "keychain"
  | "credentials-file"
  | "env-oauth"
  | "env-session"
  | "env-cookie"
  | "session-key-file"

/** Resolved auth token with metadata */
export interface ResolvedAuthToken {
  token: string
  source: AuthTokenSource
  kind: "oauth" | "session"
}

/**
 * Clamp a percentage value to the range [0, 100].
 * NaN and Infinity are treated as 0.
 */
export function clampPercent(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(100, value))
}

/**
 * Parse an ISO 8601 timestamp string to epoch milliseconds.
 * Returns undefined for invalid input or undefined input.
 */
export function parseResetsAt(iso: string | undefined): number | undefined {
  if (iso === undefined) {
    return undefined
  }
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) {
    return undefined
  }
  return parsed
}

/**
 * Runtime type guard to check if a value matches AnthropicUsageApiResponse shape.
 * Checks that the value is a non-null object.
 */
export function isUsageApiResponse(value: unknown): value is AnthropicUsageApiResponse {
  return value !== null && typeof value === "object"
}

/**
 * Build an array of UsageWindow objects from an AnthropicUsageApiResponse.
 * Only includes windows that have a defined utilization value.
 * Applies clampPercent to utilization values and parseResetsAt to resets_at.
 */
export function buildUsageWindows(response: AnthropicUsageApiResponse): UsageWindow[] {
  const windows: UsageWindow[] = []

  // five_hour → label "5h"
  if (response.five_hour != null) {
    const { utilization, resets_at } = response.five_hour
    if (utilization !== undefined) {
      windows.push({
        label: "5h",
        usedPercent: clampPercent(utilization),
        resetAtMs: parseResetsAt(resets_at)
      })
    }
  }

  // seven_day → label "7d"
  if (response.seven_day != null) {
    const { utilization, resets_at } = response.seven_day
    if (utilization !== undefined) {
      windows.push({
        label: "7d",
        usedPercent: clampPercent(utilization),
        resetAtMs: parseResetsAt(resets_at)
      })
    }
  }

  // seven_day_sonnet → label "7d-sonnet"
  if (response.seven_day_sonnet != null) {
    const { utilization } = response.seven_day_sonnet
    if (utilization !== undefined) {
      windows.push({
        label: "7d-sonnet",
        usedPercent: clampPercent(utilization)
      })
    }
  }

  // seven_day_opus → label "7d-opus"
  if (response.seven_day_opus != null) {
    const { utilization } = response.seven_day_opus
    if (utilization !== undefined) {
      windows.push({
        label: "7d-opus",
        usedPercent: clampPercent(utilization)
      })
    }
  }

  return windows
}

// ============================================================================
// OpenAI Codex Types
// ============================================================================

/** Matches the OpenAI Codex usage API response (chatgpt.com/backend-api/wham/usage) */
export interface OpenAIUsageApiResponse {
  plan_type?: string | undefined
  rate_limit?: {
    primary_window?: OpenAIRateWindow | null | undefined
    secondary_window?: OpenAIRateWindow | null | undefined
  } | null | undefined
  credits?: {
    has_credits?: boolean | undefined
    unlimited?: boolean | undefined
    balance?: number | null | undefined
  } | null | undefined
}

export interface OpenAIRateWindow {
  used_percent: number          // 0-100
  reset_at: number              // Unix timestamp SECONDS
  limit_window_seconds: number  // e.g., 18000 (5h), 604800 (7d)
}

/** Where the OpenAI auth token was found */
export type OpenAIAuthTokenSource = "codex-auth-file" | "env-openai-key"

/** Resolved OpenAI auth token with metadata */
export interface ResolvedOpenAIAuthToken {
  accessToken: string
  accountId?: string | undefined
  refreshToken?: string | undefined
  source: OpenAIAuthTokenSource
  kind: "jwt" | "api-key"
}

/**
 * Runtime type guard to check if a value matches OpenAIUsageApiResponse shape.
 * Checks that the value is a non-null object.
 */
export function isOpenAIUsageApiResponse(value: unknown): value is OpenAIUsageApiResponse {
  return value !== null && typeof value === "object"
}

/**
 * Derive a human-readable window label from limit_window_seconds.
 * 18000 → "5h", 604800 → "7d", other → formatted duration
 */
export function deriveWindowLabel(limitWindowSeconds: number): string {
  const hours = Math.floor(limitWindowSeconds / 3600)
  const days = Math.floor(hours / 24)
  if (days >= 1 && limitWindowSeconds === days * 86400) return `${days}d`
  if (hours >= 1 && limitWindowSeconds === hours * 3600) return `${hours}h`
  const minutes = Math.floor(limitWindowSeconds / 60)
  return `${minutes}m`
}

/**
 * Build UsageWindow array from OpenAI Codex usage response.
 * Maps primary_window/secondary_window to labeled windows.
 */
export function buildOpenAIUsageWindows(response: OpenAIUsageApiResponse): UsageWindow[] {
  const windows: UsageWindow[] = []
  const rateLimit = response.rate_limit
  if (rateLimit == null) return windows

  if (rateLimit.primary_window != null) {
    const w = rateLimit.primary_window
    const win: UsageWindow = {
      label: deriveWindowLabel(w.limit_window_seconds),
      usedPercent: clampPercent(w.used_percent),
      resetAtMs: w.reset_at * 1000
    }
    windows.push(win)
  }

  if (rateLimit.secondary_window != null) {
    const w = rateLimit.secondary_window
    const win: UsageWindow = {
      label: deriveWindowLabel(w.limit_window_seconds),
      usedPercent: clampPercent(w.used_percent),
      resetAtMs: w.reset_at * 1000
    }
    windows.push(win)
  }

  return windows
}
