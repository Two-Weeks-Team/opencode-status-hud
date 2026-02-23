import { describe, expect, it } from "vitest"

import { buildAssistantUsageLine } from "../src/plugin.js"

describe("buildAssistantUsageLine API usage", () => {
  const baseInput = {
    sessionKey: "ses_test",
    providerID: "anthropic",
    modelID: "claude-opus-4",
    contextUsedTokens: 27000,
    contextLimitTokens: 200000,
    usageSamples: [],
    nowMs: 1000000000000
  }

  it("uses fallback with ~ prefix when apiUsage is null", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      apiUsage: null
    })
    expect(result).toContain("5h: ~")
    expect(result).toContain("7d: ~")
  })

  it("uses fallback with ~ prefix when apiUsage is undefined", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      apiUsage: undefined
    })
    expect(result).toContain("5h: ~")
    expect(result).toContain("7d: ~")
  })

  it("uses fallback when apiUsage has error", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      apiUsage: {
        provider: "anthropic",
        fetchedAtMs: baseInput.nowMs,
        windows: [],
        error: "Network error"
      }
    })
    expect(result).toContain("5h: ~")
    expect(result).toContain("7d: ~")
  })

  it("uses real 5h % and approx 7d when only 5h window present", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      apiUsage: {
        provider: "anthropic",
        fetchedAtMs: baseInput.nowMs,
        windows: [
          { label: "5h", usedPercent: 25, resetAtMs: baseInput.nowMs + 4 * 60 * 60 * 1000 }
        ]
      }
    })
    expect(result).toContain("5h: 25%")
    expect(result).not.toContain("5h: ~")
    expect(result).toContain("7d: ~")
  })

  it("uses approx 5h and real 7d % when only 7d window present", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      apiUsage: {
        provider: "anthropic",
        fetchedAtMs: baseInput.nowMs,
        windows: [
          { label: "7d", usedPercent: 10, resetAtMs: baseInput.nowMs + 3 * 24 * 60 * 60 * 1000 }
        ]
      }
    })
    expect(result).toContain("5h: ~")
    expect(result).toContain("7d: 10%")
    expect(result).not.toContain("7d: ~")
  })

  it("uses real percentages for both windows when both present", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      apiUsage: {
        provider: "anthropic",
        fetchedAtMs: baseInput.nowMs,
        windows: [
          { label: "5h", usedPercent: 30, resetAtMs: baseInput.nowMs + 4 * 60 * 60 * 1000 },
          { label: "7d", usedPercent: 15, resetAtMs: baseInput.nowMs + 3 * 24 * 60 * 60 * 1000 }
        ]
      }
    })
    expect(result).toContain("5h: 30%")
    expect(result).toContain("7d: 15%")
    expect(result).not.toContain("~")
  })

  it("formats 5h reset within 24h as duration", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      apiUsage: {
        provider: "anthropic",
        fetchedAtMs: baseInput.nowMs,
        windows: [
          { label: "5h", usedPercent: 50, resetAtMs: baseInput.nowMs + 4 * 60 * 60 * 1000 + 22 * 60 * 1000 }
        ]
      }
    })
    expect(result).toContain("5h: 50%")
    expect(result).toContain("4h 22m")
  })

  it("formats 5h reset >24h away as weekday", () => {
    const resetAt = new Date("2024-06-10T14:30:00Z").getTime()
    const nowMs = new Date("2024-06-08T10:00:00Z").getTime()
    const result = buildAssistantUsageLine({
      ...baseInput,
      nowMs,
      apiUsage: {
        provider: "anthropic",
        fetchedAtMs: nowMs,
        windows: [
          { label: "5h", usedPercent: 75, resetAtMs: resetAt }
        ]
      }
    })
    expect(result).toContain("5h: 75%")
    expect(result).toMatch(/Mon \d{2}:\d{2}/)
  })

  it("formats 7d reset always as weekday + time", () => {
    const resetAt = new Date("2024-06-15T09:45:00Z").getTime()
    const nowMs = new Date("2024-06-08T10:00:00Z").getTime()
    const result = buildAssistantUsageLine({
      ...baseInput,
      nowMs,
      apiUsage: {
        provider: "anthropic",
        fetchedAtMs: nowMs,
        windows: [
          { label: "7d", usedPercent: 20, resetAtMs: resetAt }
        ]
      }
    })
    expect(result).toContain("7d: 20%")
    expect(result).toMatch(/Sat \d{2}:\d{2}/)
  })

  it("shows ? for undefined resetAtMs", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      apiUsage: {
        provider: "anthropic",
        fetchedAtMs: baseInput.nowMs,
        windows: [
          { label: "5h", usedPercent: 40 },
          { label: "7d", usedPercent: 10 }
        ]
      }
    })
    expect(result).toContain("5h: 40% (?)")
    expect(result).toContain("7d: 10% (?)")
  })

  it("shows 'now' for reset in the past", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      apiUsage: {
        provider: "anthropic",
        fetchedAtMs: baseInput.nowMs,
        windows: [
          { label: "5h", usedPercent: 80, resetAtMs: baseInput.nowMs - 60 * 1000 }
        ]
      }
    })
    expect(result).toContain("5h: 80% (now)")
  })

  it("handles zero percent correctly", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      apiUsage: {
        provider: "anthropic",
        fetchedAtMs: baseInput.nowMs,
        windows: [
          { label: "5h", usedPercent: 0, resetAtMs: baseInput.nowMs + 60 * 60 * 1000 }
        ]
      }
    })
    expect(result).toContain("5h: 0%")
  })

  it("handles both windows with undefined resetAtMs", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      apiUsage: {
        provider: "anthropic",
        fetchedAtMs: baseInput.nowMs,
        windows: [
          { label: "5h", usedPercent: 12 },
          { label: "7d", usedPercent: 8 }
        ]
      }
    })
    expect(result).toContain("5h: 12% (?)")
    expect(result).toContain("7d: 8% (?)")
  })
})

describe("buildAssistantUsageLine model color indicators", () => {
  const baseInput = {
    sessionKey: "ses_test",
    providerID: "anthropic",
    modelID: "claude-opus-4",
    contextUsedTokens: 27000,
    contextLimitTokens: 200000,
    usageSamples: [],
    nowMs: 1000000000000
  }

  it("shows colored Opus model label", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      modelID: "claude-opus-4-5-20251101"
    })
    expect(result).toContain("\x1b[35mOpus\x1b[39m")
  })

  it("shows colored Sonnet model label", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      modelID: "claude-sonnet-4-5-20251101"
    })
    expect(result).toContain("\x1b[33mSonnet\x1b[39m")
  })

  it("shows colored Haiku model label", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      modelID: "claude-haiku-4-5-20251101"
    })
    expect(result).toContain("\x1b[32mHaiku\x1b[39m")
  })

  it("shows colored GPT-5 model label", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      modelID: "openai/gpt-5.3-codex"
    })
    expect(result).toContain("\x1b[33mGPT-5\x1b[39m")
  })

  it("shows colored GPT-4 model label", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      modelID: "openai/gpt-4-turbo"
    })
    expect(result).toContain("\x1b[33m")
  })

  it("shows colored Gemini model label", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      modelID: "google/gemini-1.5-pro"
    })
    expect(result).toContain("\x1b[36mGemini\x1b[39m")
  })

  it("shows colored DeepSeek model label", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      modelID: "deepseek/deepseek-chat"
    })
    expect(result).toContain("\x1b[34m")
  })

  it("shows colored unknown model label", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      modelID: "unknown-provider/unknown-model"
    })
    expect(result).toContain("\x1b[37m")
  })

  it("model label appears as first colored segment", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      modelID: "claude-opus-4"
    })
    expect(result).toContain("\x1b[35mOpus\x1b[39m")
  })

  it("includes colored progress bar with ANSI codes", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      modelID: "claude-opus-4",
      contextUsedTokens: 50000,
      contextLimitTokens: 100000
    })
    expect(result).toContain("\x1b[35m")
    expect(result).toContain("\x1b[39m")
  })
})

describe("buildAssistantUsageLine agent theming", () => {
  const baseInput = {
    sessionKey: "ses_test",
    providerID: "anthropic",
    modelID: "claude-opus-4",
    contextUsedTokens: 27000,
    contextLimitTokens: 200000,
    usageSamples: [],
    nowMs: 1000000000000
  }

  it("shows colored Sisyphus name when agentName provided", () => {
    const result = buildAssistantUsageLine({ ...baseInput, agentName: "Sisyphus" })
    expect(result).toContain("\x1b[36mSisyphus\x1b[39m")
    expect(result).toContain("Opus")
  })

  it("shows colored Hephaestus name", () => {
    const result = buildAssistantUsageLine({ ...baseInput, agentName: "Hephaestus" })
    expect(result).toContain("\x1b[33mHephaestus\x1b[39m")
  })

  it("shows colored Prometheus name", () => {
    const result = buildAssistantUsageLine({ ...baseInput, agentName: "Prometheus" })
    expect(result).toContain("\x1b[31mPrometheus\x1b[39m")
  })

  it("shows colored Atlas name", () => {
    const result = buildAssistantUsageLine({ ...baseInput, agentName: "Atlas" })
    expect(result).toContain("\x1b[32mAtlas\x1b[39m")
  })

  it("shows colored Build name for vanilla opencode", () => {
    const result = buildAssistantUsageLine({ ...baseInput, agentName: "Build" })
    expect(result).toContain("\x1b[34mBuild\x1b[39m")
  })

  it("shows colored Plan name for vanilla opencode", () => {
    const result = buildAssistantUsageLine({ ...baseInput, agentName: "Plan" })
    expect(result).toContain("\x1b[33mPlan\x1b[39m")
  })

  it("extracts short name from suffixed display name", () => {
    const result = buildAssistantUsageLine({ ...baseInput, agentName: "Sisyphus (Ultraworker)" })
    expect(result).toContain("\x1b[36mSisyphus\x1b[39m")
    expect(result).not.toContain("(Ultraworker)")
  })

  it("extracts short name from Hephaestus display name", () => {
    const result = buildAssistantUsageLine({ ...baseInput, agentName: "Hephaestus (Deep Agent)" })
    expect(result).toContain("\x1b[33mHephaestus\x1b[39m")
    expect(result).not.toContain("(Deep Agent)")
  })

  it("extracts short name from Prometheus display name", () => {
    const result = buildAssistantUsageLine({ ...baseInput, agentName: "Prometheus (Plan Builder)" })
    expect(result).toContain("\x1b[31mPrometheus\x1b[39m")
  })

  it("extracts short name from Atlas display name", () => {
    const result = buildAssistantUsageLine({ ...baseInput, agentName: "Atlas (Plan Executor)" })
    expect(result).toContain("\x1b[32mAtlas\x1b[39m")
  })

  it("keeps Sisyphus-Junior as full name", () => {
    const result = buildAssistantUsageLine({ ...baseInput, agentName: "Sisyphus-Junior" })
    expect(result).toContain("\x1b[36mSisyphus-Junior\x1b[39m")
  })

  it("falls back to colored model label for unknown agent", () => {
    const result = buildAssistantUsageLine({ ...baseInput, agentName: "UnknownAgent" })
    expect(result).toContain("\x1b[35mOpus\x1b[39m")
  })

  it("shows colored model label when no agentName provided", () => {
    const result = buildAssistantUsageLine({ ...baseInput })
    expect(result).toContain("\x1b[35mOpus\x1b[39m")
  })
})

describe("buildAssistantUsageLine OpenAI provider snapshot", () => {
  const baseInput = {
    sessionKey: "ses_test",
    providerID: "openai",
    modelID: "gpt-5",
    contextUsedTokens: 27000,
    contextLimitTokens: 200000,
    usageSamples: [],
    nowMs: 1000000000000
  }

  it("uses real 5h and 7d percentages from OpenAI snapshot", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      apiUsage: {
        provider: "openai",
        fetchedAtMs: baseInput.nowMs,
        windows: [
          { label: "5h", usedPercent: 45, resetAtMs: baseInput.nowMs + 3 * 60 * 60 * 1000 },
          { label: "7d", usedPercent: 20, resetAtMs: baseInput.nowMs + 4 * 24 * 60 * 60 * 1000 }
        ]
      }
    })
    expect(result).toContain("5h: 45%")
    expect(result).toContain("7d: 20%")
    expect(result).not.toContain("5h: ~")
    expect(result).not.toContain("7d: ~")
  })

  it("shows GPT-5 model label for OpenAI model", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      apiUsage: {
        provider: "openai",
        fetchedAtMs: baseInput.nowMs,
        windows: [
          { label: "5h", usedPercent: 30, resetAtMs: baseInput.nowMs + 3 * 60 * 60 * 1000 }
        ]
      }
    })
    expect(result).toContain("\x1b[33mGPT-5\x1b[39m")
  })

  it("uses fallback when OpenAI snapshot has error", () => {
    const result = buildAssistantUsageLine({
      ...baseInput,
      apiUsage: {
        provider: "openai",
        fetchedAtMs: baseInput.nowMs,
        windows: [],
        error: "Network error"
      }
    })
    expect(result).toContain("5h: ~")
    expect(result).toContain("7d: ~")
  })
})

describe("appendUsageLineToOutputText dim text wrapper", () => {
  it("adds dim ANSI codes to usage line", () => {
    const dimOn = "\x1b[2m"
    const dimOff = "\x1b[22m"
    expect(dimOn).toBe("\x1b[2m")
    expect(dimOff).toBe("\x1b[22m")
  })
})
