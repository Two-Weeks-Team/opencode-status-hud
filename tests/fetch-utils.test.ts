import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

import {
  fetchJson,
  buildErrorSnapshot,
  DEFAULT_TIMEOUT_MS
} from "../src/fetch-utils.js"

function mockFetch(response: {
  status: number
  ok: boolean
  statusText: string
  json?: unknown
}): typeof fetch {
  return async () =>
    ({
      status: response.status,
      ok: response.ok,
      statusText: response.statusText,
      json: async () => response.json ?? {}
    }) as Response
}

describe("fetchJson", () => {

  it("returns ok: true with parsed JSON on successful fetch", async () => {
    const testData = { id: 1, name: "test" }
    const mock = mockFetch({
      status: 200,
      ok: true,
      statusText: "OK",
      json: testData
    })

    const result = await fetchJson("https://api.example.com/data", {}, undefined, mock)

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: testData
    })
  })

  it("returns ok: false with status 403 on HTTP 403 error", async () => {
    const mock = mockFetch({
      status: 403,
      ok: false,
      statusText: "Forbidden"
    })

    const result = await fetchJson("https://api.example.com/data", {}, undefined, mock)

    expect(result).toEqual({
      ok: false,
      status: 403,
      message: "Forbidden"
    })
  })

  it("returns ok: false with status 429 on HTTP 429 error", async () => {
    const mock = mockFetch({
      status: 429,
      ok: false,
      statusText: "Too Many Requests"
    })

    const result = await fetchJson("https://api.example.com/data", {}, undefined, mock)

    expect(result).toEqual({
      ok: false,
      status: 429,
      message: "Too Many Requests"
    })
  })

  it("returns ok: false with status 0 and message 'timeout' on timeout", async () => {
    const slowFetch: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("Aborted"))
        })
      })
    }

    const result = await fetchJson("https://api.example.com/data", {}, 50, slowFetch)

    expect(result).toEqual({
      ok: false,
      status: 0,
      message: "timeout"
    })
  }, 10000)

  it("returns ok: false with status 0 and error message on network error", async () => {
    const errorFetch: typeof fetch = async () => {
      throw new Error("Connection refused")
    }

    const result = await fetchJson("https://api.example.com/data", {}, undefined, errorFetch)

    expect(result).toEqual({
      ok: false,
      status: 0,
      message: "Connection refused"
    })
  })

  it("returns ok: false with status 0 and 'network error' message on non-Error throw", async () => {
    const errorFetch: typeof fetch = async () => {
      throw "string error"
    }

    const result = await fetchJson("https://api.example.com/data", {}, undefined, errorFetch)

    expect(result).toEqual({
      ok: false,
      status: 0,
      message: "network error"
    })
  })

  it("returns ok: false with 'invalid json' message on JSON parse error", async () => {
    const invalidJsonFetch: typeof fetch = async () =>
      ({
        status: 200,
        ok: true,
        statusText: "OK",
        json: async () => {
          throw new Error("Invalid JSON")
        }
      } as unknown as Response)

    const result = await fetchJson(
      "https://api.example.com/data",
      {},
      undefined,
      invalidJsonFetch
    )

    expect(result).toEqual({
      ok: false,
      status: 200,
      message: "invalid json"
    })
  })

  it("respects custom timeout when provided", async () => {
    const slowFetch: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("Aborted"))
        })
      })
    }

    const result = await fetchJson("https://api.example.com/data", {}, 100, slowFetch)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe("timeout")
    }
  }, 10000)

  it("uses default timeout of 5000ms when timeoutMs is undefined", async () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(5000)
  })

  it("cleans up timer after successful fetch", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout")
    const mock = mockFetch({
      status: 200,
      ok: true,
      statusText: "OK",
      json: { data: "test" }
    })

    await fetchJson("https://api.example.com/data", {}, undefined, mock)

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1)
  })

  it("cleans up timer after HTTP error", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout")
    const mock = mockFetch({
      status: 500,
      ok: false,
      statusText: "Internal Server Error"
    })

    await fetchJson("https://api.example.com/data", {}, undefined, mock)

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1)
  })

  it("cleans up timer after timeout", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout")
    const slowFetch: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("Aborted"))
        })
      })
    }

    await fetchJson("https://api.example.com/data", {}, 50, slowFetch)

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1)
  }, 10000)

  it("cleans up timer after network error", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout")
    const errorFetch: typeof fetch = async () => {
      throw new Error("Network error")
    }

    await fetchJson("https://api.example.com/data", {}, undefined, errorFetch)

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1)
  })

  it("passes init options to fetch", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      statusText: "OK",
      json: async () => ({ success: true })
    } as Response)

    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: "data" })
    }

    await fetchJson("https://api.example.com/data", init, undefined, fetchSpy)

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/data",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: "data" })
      })
    )
  })
})

describe("buildErrorSnapshot", () => {
  it("produces valid snapshot with error field when message provided", () => {
    const now = Date.now()
    const snapshot = buildErrorSnapshot({
      status: 403,
      message: "API key invalid",
      fetchedAtMs: now
    })

    expect(snapshot).toEqual({
      provider: "anthropic",
      fetchedAtMs: now,
      windows: [],
      error: "API key invalid"
    })
  })

  it("produces snapshot with default error message when message not provided", () => {
    const now = Date.now()
    const snapshot = buildErrorSnapshot({
      status: 500,
      fetchedAtMs: now
    })

    expect(snapshot).toEqual({
      provider: "anthropic",
      fetchedAtMs: now,
      windows: [],
      error: "HTTP 500"
    })
  })

  it("produces snapshot with HTTP 0 error message for status 0", () => {
    const now = Date.now()
    const snapshot = buildErrorSnapshot({
      status: 0,
      fetchedAtMs: now
    })

    expect(snapshot).toEqual({
      provider: "anthropic",
      fetchedAtMs: now,
      windows: [],
      error: "HTTP 0"
    })
  })

  it("uses provided empty message string over default", () => {
    const now = Date.now()
    const snapshot = buildErrorSnapshot({
      status: 500,
      message: "",
      fetchedAtMs: now
    })

    expect(snapshot.error).toBe("")
  })

  it("preserves all required ProviderUsageSnapshot fields", () => {
    const now = Date.now()
    const snapshot = buildErrorSnapshot({
      status: 429,
      message: "Rate limit exceeded",
      fetchedAtMs: now
    })

    expect(snapshot.provider).toBe("anthropic")
    expect(snapshot.fetchedAtMs).toBe(now)
    expect(snapshot.windows).toEqual([])
    expect(snapshot.error).toBe("Rate limit exceeded")
    expect(snapshot.extraUsage).toBeUndefined()
  })

  it("buildErrorSnapshot with explicit provider 'openai' sets provider to openai", () => {
    const now = Date.now()
    const snapshot = buildErrorSnapshot({
      provider: "openai",
      status: 403,
      message: "API key invalid",
      fetchedAtMs: now
    })

    expect(snapshot.provider).toBe("openai")
    expect(snapshot.fetchedAtMs).toBe(now)
    expect(snapshot.windows).toEqual([])
    expect(snapshot.error).toBe("API key invalid")
  })

  it("buildErrorSnapshot without provider defaults to anthropic (backward compat)", () => {
    const now = Date.now()
    const snapshot = buildErrorSnapshot({
      status: 500,
      message: "Server error",
      fetchedAtMs: now
    })

    expect(snapshot.provider).toBe("anthropic")
    expect(snapshot.fetchedAtMs).toBe(now)
    expect(snapshot.windows).toEqual([])
    expect(snapshot.error).toBe("Server error")
  })

  it("buildErrorSnapshot with explicit provider 'anthropic' sets provider to anthropic", () => {
    const now = Date.now()
    const snapshot = buildErrorSnapshot({
      provider: "anthropic",
      status: 429,
      fetchedAtMs: now
    })

    expect(snapshot.provider).toBe("anthropic")
  })
})
