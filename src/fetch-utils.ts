import type { ProviderUsageSnapshot } from "./provider-usage.types.js"

export const DEFAULT_TIMEOUT_MS = 5000

type FetchJsonSuccess = { ok: true; status: number; data: unknown }
type FetchJsonFailure = { ok: false; status: number; message: string }
type FetchJsonResult = FetchJsonSuccess | FetchJsonFailure

/**
 * Fetch JSON with timeout support. Never throws — returns structured result.
 */
export async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs?: number | undefined,
  fetchFn?: typeof fetch | undefined
): Promise<FetchJsonResult> {
  const controller = new AbortController()
  const effectiveTimeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS

  const timer = setTimeout(() => {
    controller.abort()
  }, effectiveTimeoutMs)

  try {
    const fetcher = fetchFn ?? fetch
    const response = await fetcher(url, { ...init, signal: controller.signal })

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: response.statusText
      }
    }

    let parsedJson: unknown
    try {
      parsedJson = await response.json()
    } catch {
      return {
        ok: false,
        status: response.status,
        message: "invalid json"
      }
    }

    return {
      ok: true,
      status: response.status,
      data: parsedJson
    }
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        status: 0,
        message: "timeout"
      }
    }

    if (error instanceof Error) {
      return {
        ok: false,
        status: 0,
        message: error.message
      }
    }

    return {
      ok: false,
      status: 0,
      message: "network error"
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Build an error ProviderUsageSnapshot for cache storage.
 */
export function buildErrorSnapshot(options: {
  status: number
  message?: string | undefined
  fetchedAtMs: number
}): ProviderUsageSnapshot {
  return {
    provider: "anthropic",
    fetchedAtMs: options.fetchedAtMs,
    windows: [],
    error: options.message ?? `HTTP ${options.status}`
  }
}
