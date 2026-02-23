import { describe, expect, it } from "vitest"

import {
  calculateTokenCost,
  resolveMessageCost,
  type CostRates,
  type TokenBreakdown
} from "../src/cost-calculator.js"

// Claude Sonnet pricing: $3/MTok input, $15/MTok output
const SONNET_RATES: CostRates = {
  input: 0.000003, // $3 per million tokens
  output: 0.000015, // $15 per million tokens
  cacheRead: 0.00000375, // $3.75 per million tokens
  cacheWrite: 0.00003 // $30 per million tokens
}

const SONNET_RATES_WITH_OVER200K: CostRates = {
  input: 0.000003,
  output: 0.000015,
  cacheRead: 0.00000375,
  cacheWrite: 0.00003,
  over200k: {
    input: 0.000006, // $6 per million tokens
    output: 0.00003, // $30 per million tokens
    cacheRead: 0.0000075, // $7.50 per million tokens
    cacheWrite: 0.00006 // $60 per million tokens
  }
}

describe("calculateTokenCost", () => {
  it("returns 0 for zero tokens and zero rates", () => {
    const tokens: TokenBreakdown = {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 }
    }
    const rates: CostRates = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0
    }

    const cost = calculateTokenCost(tokens, rates)

    expect(cost).toBe(0)
  })

  it("calculates input + output cost correctly", () => {
    const tokens: TokenBreakdown = {
      input: 1000,
      output: 500,
      reasoning: 0,
      cache: { read: 0, write: 0 }
    }

    const cost = calculateTokenCost(tokens, SONNET_RATES)

    // 1000 * $0.000003 + 500 * $0.000015 = $0.003 + $0.0075 = $0.0105
    expect(cost).toBeCloseTo(0.0105, 6)
  })

  it("includes cache read/write in total", () => {
    const tokens: TokenBreakdown = {
      input: 1000,
      output: 500,
      reasoning: 0,
      cache: { read: 200, write: 100 }
    }

    const cost = calculateTokenCost(tokens, SONNET_RATES)

    // input: 1000 * 0.000003 = 0.003
    // output: 500 * 0.000015 = 0.0075
    // cache read: 200 * 0.00000375 = 0.00075
    // cache write: 100 * 0.00003 = 0.003
    // total = 0.01425
    expect(cost).toBeCloseTo(0.01425, 6)
  })

  it("includes reasoning tokens at output rate", () => {
    const tokens: TokenBreakdown = {
      input: 1000,
      output: 500,
      reasoning: 300,
      cache: { read: 0, write: 0 }
    }

    const cost = calculateTokenCost(tokens, SONNET_RATES)

    // input: 1000 * 0.000003 = 0.003
    // output: 500 * 0.000015 = 0.0075
    // reasoning: 300 * 0.000015 (output rate) = 0.0045
    // total = 0.015
    expect(cost).toBeCloseTo(0.015, 6)
  })

  it("uses over200k rates when context > 200K", () => {
    const tokens: TokenBreakdown = {
      input: 10000,
      output: 5000,
      reasoning: 1000,
      cache: { read: 500, write: 200 }
    }

    const cost = calculateTokenCost(tokens, SONNET_RATES_WITH_OVER200K, 250_000)

    // Using over200k rates:
    // input: 10000 * 0.000006 = 0.06
    // output: 5000 * 0.00003 = 0.15
    // reasoning: 1000 * 0.00003 (output rate) = 0.03
    // cache read: 500 * 0.0000075 = 0.00375
    // cache write: 200 * 0.00006 = 0.012
    // total = 0.25575
    expect(cost).toBeCloseTo(0.25575, 6)
  })

  it("falls back to base rates when over200k missing", () => {
    const tokens: TokenBreakdown = {
      input: 10000,
      output: 5000,
      reasoning: 1000,
      cache: { read: 500, write: 200 }
    }

    // Using base rates (no over200k field)
    const cost = calculateTokenCost(tokens, SONNET_RATES, 250_000)

    // input: 10000 * 0.000003 = 0.03
    // output: 5000 * 0.000015 = 0.075
    // reasoning: 1000 * 0.000015 = 0.015
    // cache read: 500 * 0.00000375 = 0.001875
    // cache write: 200 * 0.00003 = 0.006
    // total = 0.127875
    expect(cost).toBeCloseTo(0.127875, 6)
  })
})

describe("resolveMessageCost", () => {
  it("prefers messageCost when > 0", () => {
    const tokens: TokenBreakdown = {
      input: 1000,
      output: 500,
      reasoning: 0,
      cache: { read: 0, write: 0 }
    }

    const cost = resolveMessageCost(0.05, tokens, SONNET_RATES)

    expect(cost).toBe(0.05)
  })

  it("calculates when messageCost is 0", () => {
    const tokens: TokenBreakdown = {
      input: 1000,
      output: 500,
      reasoning: 0,
      cache: { read: 0, write: 0 }
    }

    const cost = resolveMessageCost(0, tokens, SONNET_RATES)

    // Should calculate: 1000 * 0.000003 + 500 * 0.000015 = 0.0105
    expect(cost).toBeCloseTo(0.0105, 6)
  })

  it("returns 0 when messageCost is 0 and rates is null", () => {
    const tokens: TokenBreakdown = {
      input: 1000,
      output: 500,
      reasoning: 0,
      cache: { read: 0, write: 0 }
    }

    const cost = resolveMessageCost(0, tokens, null)

    expect(cost).toBe(0)
  })

  it("handles negative messageCost by calculating from tokens", () => {
    const tokens: TokenBreakdown = {
      input: 1000,
      output: 500,
      reasoning: 0,
      cache: { read: 0, write: 0 }
    }

    const cost = resolveMessageCost(-0.01, tokens, SONNET_RATES)

    // Negative messageCost should not be used, calculate from tokens instead
    expect(cost).toBeCloseTo(0.0105, 6)
  })

  it("sanitizes negative token counts to 0", () => {
    const tokens: TokenBreakdown = {
      input: -1000,
      output: 500,
      reasoning: -100,
      cache: { read: -50, write: -20 }
    }

    const cost = calculateTokenCost(tokens, SONNET_RATES)

    // All negative values should be treated as 0
    // Only output: 500 * 0.000015 = 0.0075
    expect(cost).toBeCloseTo(0.0075, 6)
  })

  it("sanitizes non-finite values to 0", () => {
    const tokens: TokenBreakdown = {
      input: Infinity,
      output: 500,
      reasoning: NaN,
      cache: { read: 100, write: Number.NaN }
    }

    const cost = calculateTokenCost(tokens, SONNET_RATES)

    // Infinity and NaN should be treated as 0
    // output: 500 * 0.000015 = 0.0075
    // cache read: 100 * 0.00000375 = 0.000375
    expect(cost).toBeCloseTo(0.007875, 6)
  })
})
