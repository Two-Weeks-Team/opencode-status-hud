import { describe, expect, it } from "vitest"
import { fetchOpenAIUsage } from "../src/fetch-openai.js"
import type { ResolvedOpenAIAuthToken } from "../src/provider-usage.types.js"

const CHATGPT_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
const TOKEN_REFRESH_URL = "https://auth.openai.com/oauth/token"

// Mock fetch factory that returns responses based on URL
function createMockFetch(
  responses: Map<string, { status: number; ok: boolean; statusText: string; json: unknown }>
): typeof fetch {
  return async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString()
    const response = responses.get(url)
    if (response === undefined) {
      throw new Error(`Unmocked URL: ${url}`)
    }
    return {
      status: response.status,
      ok: response.ok,
      statusText: response.statusText,
      json: async () => response.json
    } as Response
  }
}

// Helper to create a JWT token with refresh token
function createJwtToken(withRefresh = true): ResolvedOpenAIAuthToken {
  return {
    accessToken: "ey-test-jwt-token",
    accountId: "test-account-id",
    refreshToken: withRefresh ? "test-refresh-token" : undefined,
    source: "codex-auth-file",
    kind: "jwt"
  }
}

// Helper to create an API key token
function createApiKeyToken(): ResolvedOpenAIAuthToken {
  return {
    accessToken: "sk-test-api-key",
    source: "codex-auth-file",
    kind: "api-key"
  }
}

describe("fetchOpenAIUsage", () => {
  describe("Success path", () => {
    it("returns valid snapshot with both windows on 200", async () => {
      const nowMs = 1700000000000
      const resetAtSec = 1708700000
      const mockData = {
        plan_type: "pro",
        rate_limit: {
          primary_window: { used_percent: 22, reset_at: resetAtSec, limit_window_seconds: 18000 },
          secondary_window: { used_percent: 5, reset_at: resetAtSec + 500000, limit_window_seconds: 604800 }
        },
        credits: { has_credits: true, unlimited: false, balance: 150 }
      }
      const mockFetch = createMockFetch(
        new Map([
          [CHATGPT_USAGE_URL, { status: 200, ok: true, statusText: "OK", json: mockData }]
        ])
      )

      const result = await fetchOpenAIUsage({
        token: createJwtToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.provider).toBe("openai")
      expect(result.fetchedAtMs).toBe(nowMs)
      expect(result.error).toBeUndefined()
      expect(result.windows).toHaveLength(2)
    })

    it("returns snapshot with only primary window", async () => {
      const nowMs = 1700000000000
      const resetAtSec = 1708700000
      const mockData = {
        rate_limit: {
          primary_window: { used_percent: 30, reset_at: resetAtSec, limit_window_seconds: 18000 }
        }
      }
      const mockFetch = createMockFetch(
        new Map([
          [CHATGPT_USAGE_URL, { status: 200, ok: true, statusText: "OK", json: mockData }]
        ])
      )

      const result = await fetchOpenAIUsage({
        token: createJwtToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.windows).toHaveLength(1)
      expect(result.windows[0]?.label).toBe("5h")
    })

    it("returns snapshot with empty rate_limit", async () => {
      const nowMs = 1700000000000
      const mockData = {}
      const mockFetch = createMockFetch(
        new Map([
          [CHATGPT_USAGE_URL, { status: 200, ok: true, statusText: "OK", json: mockData }]
        ])
      )

      const result = await fetchOpenAIUsage({
        token: createJwtToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.windows).toEqual([])
    })

    it("maps used_percent and reset_at correctly (seconds to ms)", async () => {
      const nowMs = 1700000000000
      const resetAtSec = 1708700000
      const mockData = {
        rate_limit: {
          primary_window: { used_percent: 45, reset_at: resetAtSec, limit_window_seconds: 18000 }
        }
      }
      const mockFetch = createMockFetch(
        new Map([
          [CHATGPT_USAGE_URL, { status: 200, ok: true, statusText: "OK", json: mockData }]
        ])
      )

      const result = await fetchOpenAIUsage({
        token: createJwtToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.windows[0]?.usedPercent).toBe(45)
      expect(result.windows[0]?.resetAtMs).toBe(resetAtSec * 1000)
    })

    it("derives correct window labels (18000 to 5h, 604800 to 7d)", async () => {
      const nowMs = 1700000000000
      const resetAtSec = 1708700000
      const mockData = {
        rate_limit: {
          primary_window: { used_percent: 22, reset_at: resetAtSec, limit_window_seconds: 18000 },
          secondary_window: { used_percent: 5, reset_at: resetAtSec, limit_window_seconds: 604800 }
        }
      }
      const mockFetch = createMockFetch(
        new Map([
          [CHATGPT_USAGE_URL, { status: 200, ok: true, statusText: "OK", json: mockData }]
        ])
      )

      const result = await fetchOpenAIUsage({
        token: createJwtToken(),
        fetchFn: mockFetch,
        nowMs
      })

      const labels = result.windows.map((w) => w.label)
      expect(labels).toContain("5h")
      expect(labels).toContain("7d")
    })
  })

  describe("Error handling", () => {
    it("returns error snapshot on 401 without refresh token", async () => {
      const nowMs = 1700000000000
      const mockFetch = createMockFetch(
        new Map([
          [CHATGPT_USAGE_URL, { status: 401, ok: false, statusText: "Unauthorized", json: {} }]
        ])
      )

      const result = await fetchOpenAIUsage({
        token: createApiKeyToken(), // API key has no refresh token
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.provider).toBe("openai")
      expect(result.error).toBe("Unauthorized")
      expect(result.windows).toEqual([])
    })

    it("returns error snapshot on 403", async () => {
      const nowMs = 1700000000000
      const mockFetch = createMockFetch(
        new Map([
          [CHATGPT_USAGE_URL, { status: 403, ok: false, statusText: "Forbidden", json: {} }]
        ])
      )

      const result = await fetchOpenAIUsage({
        token: createJwtToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBe("Forbidden")
      expect(result.windows).toEqual([])
    })

    it("returns error snapshot on 429", async () => {
      const nowMs = 1700000000000
      const mockFetch = createMockFetch(
        new Map([
          [CHATGPT_USAGE_URL, { status: 429, ok: false, statusText: "Too Many Requests", json: {} }]
        ])
      )

      const result = await fetchOpenAIUsage({
        token: createJwtToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBe("Too Many Requests")
      expect(result.windows).toEqual([])
    })

    it("returns error snapshot on network error", async () => {
      const nowMs = 1700000000000
      const networkErrorFetch: typeof fetch = async () => {
        throw new Error("Connection refused")
      }

      const result = await fetchOpenAIUsage({
        token: createJwtToken(),
        fetchFn: networkErrorFetch,
        nowMs
      })

      expect(result.error).toBe("Connection refused")
      expect(result.windows).toEqual([])
    })

    it("returns error snapshot on invalid JSON", async () => {
      const nowMs = 1700000000000
      const invalidJsonFetch: typeof fetch = async () =>
        ({
          status: 200,
          ok: true,
          statusText: "OK",
          json: async (): Promise<never> => {
            throw new Error("Invalid JSON")
          }
        } as unknown as Response)

      const result = await fetchOpenAIUsage({
        token: createJwtToken(),
        fetchFn: invalidJsonFetch,
        nowMs
      })

      expect(result.error).toBe("invalid json")
      expect(result.windows).toEqual([])
    })

    it("returns error snapshot on non-object response", async () => {
      const nowMs = 1700000000000
      const mockFetch = createMockFetch(
        new Map([
          [CHATGPT_USAGE_URL, { status: 200, ok: true, statusText: "OK", json: "not an object" }]
        ])
      )

      const result = await fetchOpenAIUsage({
        token: createJwtToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBe("invalid response")
      expect(result.windows).toEqual([])
    })
  })

  describe("Token refresh", () => {
    it("refreshes token on 401 when refreshToken present and retries", async () => {
      const nowMs = 1700000000000
      const resetAtSec = 1708700000
      const mockData = {
        rate_limit: {
          primary_window: { used_percent: 25, reset_at: resetAtSec, limit_window_seconds: 18000 }
        }
      }

      // First call returns 401, second call succeeds
      let callCount = 0
      const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString()
        callCount++

        if (url === TOKEN_REFRESH_URL) {
          return {
            status: 200,
            ok: true,
            statusText: "OK",
            json: async () => ({ access_token: "new-jwt-token" })
          } as Response
        }

        if (url === CHATGPT_USAGE_URL) {
          if (callCount === 1) {
            return {
              status: 401,
              ok: false,
              statusText: "Unauthorized",
              json: async () => ({})
            } as Response
          }
          return {
            status: 200,
            ok: true,
            statusText: "OK",
            json: async () => mockData
          } as Response
        }

        throw new Error(`Unmocked URL: ${url}`)
      }

      const result = await fetchOpenAIUsage({
        token: createJwtToken(true),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBeUndefined()
      expect(result.windows).toHaveLength(1)
    })

    it("returns error when refresh also fails", async () => {
      const nowMs = 1700000000000

      const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString()

        if (url === TOKEN_REFRESH_URL) {
          return {
            status: 400,
            ok: false,
            statusText: "Bad Request",
            json: async () => ({})
          } as Response
        }

        if (url === CHATGPT_USAGE_URL) {
          return {
            status: 401,
            ok: false,
            statusText: "Unauthorized",
            json: async () => ({})
          } as Response
        }

        throw new Error(`Unmocked URL: ${url}`)
      }

      const result = await fetchOpenAIUsage({
        token: createJwtToken(true),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBe("Unauthorized")
    })

    it("does not attempt refresh for api-key kind", async () => {
      const nowMs = 1700000000000

      const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString()

        // Should NOT call refresh URL for api-key
        if (url === TOKEN_REFRESH_URL) {
          throw new Error("Should not call refresh for api-key")
        }

        if (url === CHATGPT_USAGE_URL) {
          return {
            status: 401,
            ok: false,
            statusText: "Unauthorized",
            json: async () => ({})
          } as Response
        }

        throw new Error(`Unmocked URL: ${url}`)
      }

      const result = await fetchOpenAIUsage({
        token: createApiKeyToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBe("Unauthorized")
    })
  })

  describe("Edge cases", () => {
    it("handles null rate_limit fields", async () => {
      const nowMs = 1700000000000
      const mockData = {
        rate_limit: null
      }
      const mockFetch = createMockFetch(
        new Map([
          [CHATGPT_USAGE_URL, { status: 200, ok: true, statusText: "OK", json: mockData }]
        ])
      )

      const result = await fetchOpenAIUsage({
        token: createJwtToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.windows).toEqual([])
    })

    it("handles null credits fields", async () => {
      const nowMs = 1700000000000
      const resetAtSec = 1708700000
      const mockData = {
        rate_limit: {
          primary_window: { used_percent: 30, reset_at: resetAtSec, limit_window_seconds: 18000 }
        },
        credits: null
      }
      const mockFetch = createMockFetch(
        new Map([
          [CHATGPT_USAGE_URL, { status: 200, ok: true, statusText: "OK", json: mockData }]
        ])
      )

      const result = await fetchOpenAIUsage({
        token: createJwtToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.windows).toHaveLength(1)
    })

    it("handles plan_type field", async () => {
      const nowMs = 1700000000000
      const resetAtSec = 1708700000
      const mockData = {
        plan_type: "enterprise",
        rate_limit: {
          primary_window: { used_percent: 50, reset_at: resetAtSec, limit_window_seconds: 18000 }
        }
      }
      const mockFetch = createMockFetch(
        new Map([
          [CHATGPT_USAGE_URL, { status: 200, ok: true, statusText: "OK", json: mockData }]
        ])
      )

      const result = await fetchOpenAIUsage({
        token: createJwtToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.windows).toHaveLength(1)
      expect(result.error).toBeUndefined()
    })

    it("omits accountId header when not present", async () => {
      const nowMs = 1700000000000
      const resetAtSec = 1708700000
      const mockData = {
        rate_limit: {
          primary_window: { used_percent: 30, reset_at: resetAtSec, limit_window_seconds: 18000 }
        }
      }

      let capturedHeaders: Record<string, string> = {}
      const mockFetch: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>
        return {
          status: 200,
          ok: true,
          statusText: "OK",
          json: async () => mockData
        } as Response
      }

      const token: ResolvedOpenAIAuthToken = {
        accessToken: "ey-jwt-token",
        source: "codex-auth-file",
        kind: "jwt"
      }

      await fetchOpenAIUsage({
        token,
        fetchFn: mockFetch,
        nowMs
      })

      expect(capturedHeaders["Authorization"]).toBe("Bearer ey-jwt-token")
      expect(capturedHeaders["ChatGPT-Account-Id"]).toBeUndefined()
    })

    it("includes accountId header when present", async () => {
      const nowMs = 1700000000000
      const resetAtSec = 1708700000
      const mockData = {
        rate_limit: {
          primary_window: { used_percent: 30, reset_at: resetAtSec, limit_window_seconds: 18000 }
        }
      }

      let capturedHeaders: Record<string, string> = {}
      const mockFetch: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>
        return {
          status: 200,
          ok: true,
          statusText: "OK",
          json: async () => mockData
        } as Response
      }

      const token: ResolvedOpenAIAuthToken = {
        accessToken: "ey-jwt-token",
        accountId: "test-account-123",
        source: "codex-auth-file",
        kind: "jwt"
      }

      await fetchOpenAIUsage({
        token,
        fetchFn: mockFetch,
        nowMs
      })

      expect(capturedHeaders["Authorization"]).toBe("Bearer ey-jwt-token")
      expect(capturedHeaders["ChatGPT-Account-Id"]).toBe("test-account-123")
    })
  })
})