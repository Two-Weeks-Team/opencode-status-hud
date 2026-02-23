import { describe, expect, it } from "vitest"

import {
  clampPercent,
  parseResetsAt,
  isUsageApiResponse,
  buildUsageWindows,
  type AnthropicUsageApiResponse
} from "../src/provider-usage.types.js"

describe("clampPercent", () => {
  it("returns 0 for NaN", () => {
    expect(clampPercent(Number.NaN)).toBe(0)
  })

  it("returns 0 for Infinity", () => {
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it("returns 0 for negative Infinity", () => {
    expect(clampPercent(Number.NEGATIVE_INFINITY)).toBe(0)
  })

  it("clamps -5 to 0", () => {
    expect(clampPercent(-5)).toBe(0)
  })

  it("clamps 150 to 100", () => {
    expect(clampPercent(150)).toBe(100)
  })

  it("returns 50 for 50", () => {
    expect(clampPercent(50)).toBe(50)
  })

  it("returns 0 for 0", () => {
    expect(clampPercent(0)).toBe(0)
  })

  it("returns 100 for 100", () => {
    expect(clampPercent(100)).toBe(100)
  })
})

describe("parseResetsAt", () => {
  it("returns correct epoch ms for valid ISO 8601 string", () => {
    const iso = "2024-06-15T10:30:00.000Z"
    const expected = Date.parse(iso)
    expect(parseResetsAt(iso)).toBe(expected)
  })

  it("returns undefined for invalid string", () => {
    expect(parseResetsAt("not-a-date")).toBeUndefined()
  })

  it("returns undefined for undefined input", () => {
    expect(parseResetsAt(undefined)).toBeUndefined()
  })

  it("returns undefined for empty string", () => {
    expect(parseResetsAt("")).toBeUndefined()
  })
})

describe("isUsageApiResponse", () => {
  it("returns true for valid object", () => {
    expect(isUsageApiResponse({})).toBe(true)
    expect(isUsageApiResponse({ five_hour: { utilization: 50 } })).toBe(true)
  })

  it("returns false for null", () => {
    expect(isUsageApiResponse(null)).toBe(false)
  })

  it("returns false for string", () => {
    expect(isUsageApiResponse("not an object")).toBe(false)
  })

  it("returns false for number", () => {
    expect(isUsageApiResponse(42)).toBe(false)
  })

  it("returns false for boolean", () => {
    expect(isUsageApiResponse(true)).toBe(false)
  })

  it("returns false for undefined", () => {
    expect(isUsageApiResponse(undefined)).toBe(false)
  })

  it("returns true for empty object", () => {
    expect(isUsageApiResponse({})).toBe(true)
  })

  it("returns false for array", () => {
    expect(isUsageApiResponse([])).toBe(true)
  })
})

describe("buildUsageWindows", () => {
  it("returns all windows for full response with all fields", () => {
    const response: AnthropicUsageApiResponse = {
      five_hour: { utilization: 25, resets_at: "2024-06-15T10:30:00.000Z" },
      seven_day: { utilization: 75, resets_at: "2024-06-22T00:00:00.000Z" },
      seven_day_sonnet: { utilization: 60 },
      seven_day_opus: { utilization: 40 }
    }

    const windows = buildUsageWindows(response)

    expect(windows).toHaveLength(4)
    expect(windows[0]).toEqual({
      label: "5h",
      usedPercent: 25,
      resetAtMs: Date.parse("2024-06-15T10:30:00.000Z")
    })
    expect(windows[1]).toEqual({
      label: "7d",
      usedPercent: 75,
      resetAtMs: Date.parse("2024-06-22T00:00:00.000Z")
    })
    expect(windows[2]).toEqual({
      label: "7d-sonnet",
      usedPercent: 60,
      resetAtMs: undefined
    })
    expect(windows[3]).toEqual({
      label: "7d-opus",
      usedPercent: 40,
      resetAtMs: undefined
    })
  })

  it("returns only five_hour window for partial response", () => {
    const response: AnthropicUsageApiResponse = {
      five_hour: { utilization: 30 }
    }

    const windows = buildUsageWindows(response)

    expect(windows).toHaveLength(1)
    expect(windows[0]).toEqual({
      label: "5h",
      usedPercent: 30,
      resetAtMs: undefined
    })
  })

  it("returns empty array for empty response", () => {
    const response: AnthropicUsageApiResponse = {}

    const windows = buildUsageWindows(response)

    expect(windows).toHaveLength(0)
  })

  it("skips windows with undefined utilization", () => {
    const response: AnthropicUsageApiResponse = {
      five_hour: { resets_at: "2024-06-15T10:30:00.000Z" },
      seven_day: { utilization: 50 },
      seven_day_sonnet: {}
    }

    const windows = buildUsageWindows(response)

    expect(windows).toHaveLength(1)
    expect(windows[0]?.label).toBe("7d")
  })

  it("clamps utilization values", () => {
    const response: AnthropicUsageApiResponse = {
      five_hour: { utilization: 150 },
      seven_day: { utilization: -10 }
    }

    const windows = buildUsageWindows(response)

    expect(windows).toHaveLength(2)
    expect(windows[0]?.usedPercent).toBe(100)
    expect(windows[1]?.usedPercent).toBe(0)
  })

  it("handles response with extra_usage field", () => {
    const response: AnthropicUsageApiResponse = {
      five_hour: { utilization: 50 },
      extra_usage: {
        is_enabled: true,
        monthly_limit: 10000,
        used_credits: 5000,
        utilization: 50,
        currency: "USD"
      }
    }

    const windows = buildUsageWindows(response)

    expect(windows).toHaveLength(1)
    expect(windows[0]?.label).toBe("5h")
  })

  it("handles undefined fields gracefully", () => {
    const response: AnthropicUsageApiResponse = {
      five_hour: undefined,
      seven_day: { utilization: 25 }
    }

    const windows = buildUsageWindows(response)

    expect(windows).toHaveLength(1)
    expect(windows[0]?.label).toBe("7d")
  })
})
