import { describe, expect, it } from "vitest"
import { fetchClaudeUsage } from "../src/fetch-claude.js"
import type { ResolvedAuthToken } from "../src/provider-usage.types.js"

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

// Helper to create an OAuth token
function createOAuthToken(token = "test-oauth-token"): ResolvedAuthToken {
  return {
    token,
    source: "env-oauth",
    kind: "oauth"
  }
}

// Helper to create a session token
function createSessionToken(token = "test-session-token"): ResolvedAuthToken {
  return {
    token,
    source: "env-session",
    kind: "session"
  }
}

const OAUTH_URL = "https://api.anthropic.com/api/oauth/usage"
const WEB_ORGS_URL = "https://claude.ai/api/organizations"

describe("fetchClaudeUsage", () => {
  describe("OAuth path", () => {
    it("returns valid snapshot with windows on 200 with full response", async () => {
      const nowMs = 1700000000000
      const mockData = {
        five_hour: { utilization: 45, resets_at: "2024-01-01T12:00:00Z" },
        seven_day: { utilization: 30, resets_at: "2024-01-08T00:00:00Z" },
        seven_day_sonnet: { utilization: 25 },
        seven_day_opus: { utilization: 15 }
      }
      const mockFetch = createMockFetch(
        new Map([
          [OAUTH_URL, { status: 200, ok: true, statusText: "OK", json: mockData }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createOAuthToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.provider).toBe("anthropic")
      expect(result.fetchedAtMs).toBe(nowMs)
      expect(result.error).toBeUndefined()
      expect(result.windows).toHaveLength(4)
      expect(result.windows.map((w) => w.label)).toContain("5h")
      expect(result.windows.map((w) => w.label)).toContain("7d")
      expect(result.windows.map((w) => w.label)).toContain("7d-sonnet")
      expect(result.windows.map((w) => w.label)).toContain("7d-opus")
    })

    it("returns snapshot with empty windows on 200 with empty response", async () => {
      const nowMs = 1700000000000
      const mockFetch = createMockFetch(
        new Map([
          [OAUTH_URL, { status: 200, ok: true, statusText: "OK", json: {} }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createOAuthToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.provider).toBe("anthropic")
      expect(result.fetchedAtMs).toBe(nowMs)
      expect(result.windows).toEqual([])
      expect(result.error).toBeUndefined()
    })

    it("returns snapshot with extra_usage on 200 with extra_usage", async () => {
      const nowMs = 1700000000000
      const mockData = {
        five_hour: { utilization: 50 },
        extra_usage: {
          is_enabled: true,
          monthly_limit: 10000,
          used_credits: 5000,
          utilization: 50,
          currency: "usd"
        }
      }
      const mockFetch = createMockFetch(
        new Map([
          [OAUTH_URL, { status: 200, ok: true, statusText: "OK", json: mockData }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createOAuthToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.extraUsage).toBeDefined()
      expect(result.extraUsage?.enabled).toBe(true)
      expect(result.extraUsage?.monthlyLimitCents).toBe(10000)
      expect(result.extraUsage?.usedCents).toBe(5000)
      expect(result.extraUsage?.utilization).toBe(50)
      expect(result.extraUsage?.currency).toBe("usd")
    })

    it("rescales extra_usage values when monthly_limit >= 100000", async () => {
      const nowMs = 1700000000000
      const mockData = {
        five_hour: { utilization: 50 },
        extra_usage: {
          is_enabled: true,
          monthly_limit: 100000,
          used_credits: 50000,
          utilization: 50,
          currency: "usd"
        }
      }
      const mockFetch = createMockFetch(
        new Map([
          [OAUTH_URL, { status: 200, ok: true, statusText: "OK", json: mockData }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createOAuthToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.extraUsage).toBeDefined()
      expect(result.extraUsage?.monthlyLimitCents).toBe(1000)
      expect(result.extraUsage?.usedCents).toBe(500)
    })

    it("returns error snapshot on 401", async () => {
      const nowMs = 1700000000000
      const mockFetch = createMockFetch(
        new Map([
          [OAUTH_URL, { status: 401, ok: false, statusText: "Unauthorized", json: {} }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createOAuthToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBe("token_expired")
      expect(result.windows).toEqual([])
    })

    it("returns error snapshot on 403", async () => {
      const nowMs = 1700000000000
      const mockFetch = createMockFetch(
        new Map([
          [OAUTH_URL, { status: 403, ok: false, statusText: "Forbidden", json: {} }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createOAuthToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBe("scope_error")
      expect(result.windows).toEqual([])
    })

    it("returns error snapshot on 429", async () => {
      const nowMs = 1700000000000
      const mockFetch = createMockFetch(
        new Map([
          [OAUTH_URL, { status: 429, ok: false, statusText: "Too Many Requests", json: {} }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createOAuthToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBe("Too Many Requests")
      expect(result.windows).toEqual([])
    })

    it("returns error snapshot on network error (timeout)", async () => {
      const nowMs = 1700000000000
      const timeoutFetch: typeof fetch = async () => {
        return new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("timeout")), 10)
        })
      }

      const result = await fetchClaudeUsage({
        token: createOAuthToken(),
        fetchFn: timeoutFetch,
        timeoutMs: 5,
        nowMs
      })

      expect(result.error).toBe("timeout")
      expect(result.windows).toEqual([])
    }, 10000)

    it("returns error snapshot on invalid JSON response", async () => {
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

      const result = await fetchClaudeUsage({
        token: createOAuthToken(),
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
          [OAUTH_URL, { status: 200, ok: true, statusText: "OK", json: "not an object" }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createOAuthToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBe("invalid response")
      expect(result.windows).toEqual([])
    })
  })

  describe("Web API path", () => {
    it("fetches orgs first then usage for session token", async () => {
      const nowMs = 1700000000000
      const orgUuid = "test-org-uuid"
      const usageUrl = `https://claude.ai/api/organizations/${orgUuid}/usage`

      const mockData = {
        five_hour: { utilization: 60 }
      }

      const mockFetch = createMockFetch(
        new Map([
          [WEB_ORGS_URL, { status: 200, ok: true, statusText: "OK", json: [{ uuid: orgUuid }] }],
          [usageUrl, { status: 200, ok: true, statusText: "OK", json: mockData }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createSessionToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.provider).toBe("anthropic")
      expect(result.fetchedAtMs).toBe(nowMs)
      expect(result.windows).toHaveLength(1)
      expect(result.windows[0]?.label).toBe("5h")
      expect(result.windows[0]?.usedPercent).toBe(60)
      expect(result.error).toBeUndefined()
    })

    it("returns error snapshot when org fetch fails", async () => {
      const nowMs = 1700000000000
      const mockFetch = createMockFetch(
        new Map([
          [WEB_ORGS_URL, { status: 500, ok: false, statusText: "Internal Server Error", json: {} }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createSessionToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBe("Internal Server Error")
      expect(result.windows).toEqual([])
    })

    it("returns error snapshot when org list is empty", async () => {
      const nowMs = 1700000000000
      const mockFetch = createMockFetch(
        new Map([
          [WEB_ORGS_URL, { status: 200, ok: true, statusText: "OK", json: [] }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createSessionToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBe("invalid org list")
      expect(result.windows).toEqual([])
    })

    it("returns error snapshot when usage fetch fails", async () => {
      const nowMs = 1700000000000
      const orgUuid = "test-org-uuid"
      const usageUrl = `https://claude.ai/api/organizations/${orgUuid}/usage`

      const mockFetch = createMockFetch(
        new Map([
          [WEB_ORGS_URL, { status: 200, ok: true, statusText: "OK", json: [{ uuid: orgUuid }] }],
          [usageUrl, { status: 403, ok: false, statusText: "Forbidden", json: {} }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createSessionToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBe("Forbidden")
      expect(result.windows).toEqual([])
    })

    it("returns valid snapshot with windows on full web success path", async () => {
      const nowMs = 1700000000000
      const orgUuid = "test-org-uuid"
      const usageUrl = `https://claude.ai/api/organizations/${orgUuid}/usage`

      const mockData = {
        five_hour: { utilization: 45, resets_at: "2024-01-01T12:00:00Z" },
        seven_day: { utilization: 30 },
        seven_day_sonnet: { utilization: 25 },
        seven_day_opus: { utilization: 15 },
        extra_usage: {
          is_enabled: true,
          monthly_limit: 5000,
          used_credits: 2500,
          utilization: 50,
          currency: "usd"
        }
      }

      const mockFetch = createMockFetch(
        new Map([
          [WEB_ORGS_URL, { status: 200, ok: true, statusText: "OK", json: [{ uuid: orgUuid, name: "Test Org" }] }],
          [usageUrl, { status: 200, ok: true, statusText: "OK", json: mockData }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createSessionToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.provider).toBe("anthropic")
      expect(result.fetchedAtMs).toBe(nowMs)
      expect(result.error).toBeUndefined()
      expect(result.windows).toHaveLength(4)
      expect(result.extraUsage?.enabled).toBe(true)
      expect(result.extraUsage?.monthlyLimitCents).toBe(5000)
      expect(result.extraUsage?.usedCents).toBe(2500)
    })
  })

  describe("Edge cases", () => {
    it("returns error snapshot for non-object API response", async () => {
      const nowMs = 1700000000000
      const mockFetch = createMockFetch(
        new Map([
          [OAUTH_URL, { status: 200, ok: true, statusText: "OK", json: null }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createOAuthToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBe("invalid response")
      expect(result.windows).toEqual([])
    })

    it("returns error snapshot for org list with invalid uuid", async () => {
      const nowMs = 1700000000000
      const mockFetch = createMockFetch(
        new Map([
          [WEB_ORGS_URL, { status: 200, ok: true, statusText: "OK", json: [{ name: "Test" }] }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createSessionToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBe("invalid org list")
      expect(result.windows).toEqual([])
    })

    it("returns error snapshot for org list with non-object items", async () => {
      const nowMs = 1700000000000
      const mockFetch = createMockFetch(
        new Map([
          [WEB_ORGS_URL, { status: 200, ok: true, statusText: "OK", json: ["not an object"] }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createSessionToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.error).toBe("invalid org list")
      expect(result.windows).toEqual([])
    })

    it("handles extra_usage with missing is_enabled field", async () => {
      const nowMs = 1700000000000
      const mockData = {
        five_hour: { utilization: 50 },
        extra_usage: {
          monthly_limit: 5000,
          used_credits: 2500,
          utilization: 50
        }
      }
      const mockFetch = createMockFetch(
        new Map([
          [OAUTH_URL, { status: 200, ok: true, statusText: "OK", json: mockData }]
        ])
      )

      const result = await fetchClaudeUsage({
        token: createOAuthToken(),
        fetchFn: mockFetch,
        nowMs
      })

      expect(result.extraUsage).toBeUndefined()
    })
  })
})
