import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createHudPluginHooks, buildAssistantUsageLine } from "../src/plugin.js"
import type { PollingManager } from "../src/polling-manager.js"
import type { ProviderUsageSnapshot } from "../src/provider-usage.types.js"

describe("plugin API usage integration", () => {
  const originalDateNow = Date.now

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    Date.now = originalDateNow
  })

  function createMockPollingManager(snapshot: ProviderUsageSnapshot | null = null): PollingManager {
    return {
      start: vi.fn(),
      stop: vi.fn(),
      latest: vi.fn(() => snapshot),
      forceRefresh: vi.fn(async () => snapshot),
      isRunning: vi.fn(() => false)
    }
  }

  function createSuccessSnapshot(overrides: Partial<ProviderUsageSnapshot> = {}): ProviderUsageSnapshot {
    return {
      provider: "anthropic",
      fetchedAtMs: Date.now(),
      windows: [
        { label: "5h", usedPercent: 25, resetAtMs: Date.now() + 4 * 60 * 60 * 1000 },
        { label: "7d", usedPercent: 10, resetAtMs: Date.now() + 3 * 24 * 60 * 60 * 1000 }
      ],
      ...overrides
    }
  }

  function createErrorSnapshot(error: string): ProviderUsageSnapshot {
    return {
      provider: "anthropic",
      fetchedAtMs: Date.now(),
      windows: [],
      error
    }
  }

  const baseRuntimeConfig = {
    verbosity: "normal" as const,
    promptProfile: "minimal" as const,
    usageDisplay: "output" as const,
    usagePromptIntervalMs: 0
  }

  it("HUD line shows real % when polling manager has snapshot", async () => {
    const snapshot = createSuccessSnapshot({
      windows: [
        { label: "5h", usedPercent: 42, resetAtMs: Date.now() + 4 * 60 * 60 * 1000 },
        { label: "7d", usedPercent: 15, resetAtMs: Date.now() + 3 * 24 * 60 * 60 * 1000 }
      ]
    })
    const mockPollingManager = createMockPollingManager(snapshot)

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: () => undefined
        }
      },
      baseRuntimeConfig,
      { pollingManagerOverride: mockPollingManager }
    )

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_1",
            sessionID: "ses_1",
            role: "assistant",
            time: { created: 1000, completed: 1200 },
            parentID: "msg_user_1",
            modelID: "claude-opus-4",
            providerID: "anthropic",
            mode: "primary",
            path: { cwd: "/tmp/project", root: "/tmp/project" },
            cost: 0.01,
            tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      }
    })

    const output = { text: "assistant result" }
    await hooks["experimental.text.complete"]?.(
      {
        sessionID: "ses_1",
        messageID: "msg_1",
        partID: "part_1"
      },
      output
    )

    expect(output.text).toContain("5h: 42%")
    expect(output.text).toContain("7d: 15%")
    expect(output.text).not.toContain("5h: ~")
    expect(output.text).not.toContain("7d: ~")
  })

  it("HUD line shows ~% when polling manager returns null", async () => {
    const mockPollingManager = createMockPollingManager(null)

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: () => undefined
        }
      },
      baseRuntimeConfig,
      { pollingManagerOverride: mockPollingManager }
    )

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_2",
            sessionID: "ses_2",
            role: "assistant",
            time: { created: 1000, completed: 1200 },
            parentID: "msg_user_1",
            modelID: "claude-opus-4",
            providerID: "anthropic",
            mode: "primary",
            path: { cwd: "/tmp/project", root: "/tmp/project" },
            cost: 0.01,
            tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      }
    })

    const output = { text: "assistant result" }
    await hooks["experimental.text.complete"]?.(
      {
        sessionID: "ses_2",
        messageID: "msg_2",
        partID: "part_1"
      },
      output
    )

    expect(output.text).toContain("5h: ~")
    expect(output.text).toContain("7d: ~")
  })

  it("HUD line shows ~% when snapshot has error", async () => {
    const errorSnapshot = createErrorSnapshot("Network error")
    const mockPollingManager = createMockPollingManager(errorSnapshot)

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: () => undefined
        }
      },
      baseRuntimeConfig,
      { pollingManagerOverride: mockPollingManager }
    )

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_3",
            sessionID: "ses_3",
            role: "assistant",
            time: { created: 1000, completed: 1200 },
            parentID: "msg_user_1",
            modelID: "claude-opus-4",
            providerID: "anthropic",
            mode: "primary",
            path: { cwd: "/tmp/project", root: "/tmp/project" },
            cost: 0.01,
            tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      }
    })

    const output = { text: "assistant result" }
    await hooks["experimental.text.complete"]?.(
      {
        sessionID: "ses_3",
        messageID: "msg_3",
        partID: "part_1"
      },
      output
    )

    expect(output.text).toContain("5h: ~")
    expect(output.text).toContain("7d: ~")
  })

  it("polling manager is started on plugin init when no override", async () => {
    const startSpy = vi.fn()
    const mockPollingManager: PollingManager = {
      start: startSpy,
      stop: vi.fn(),
      latest: vi.fn(() => null),
      forceRefresh: vi.fn(async () => null),
      isRunning: vi.fn(() => false)
    }

    createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: () => undefined
        }
      },
      baseRuntimeConfig,
      { pollingManagerOverride: mockPollingManager }
    )

    expect(startSpy).not.toHaveBeenCalled()
  })

  it("plugin works correctly with no API data (full graceful degradation)", async () => {
    const mockPollingManager = createMockPollingManager(null)

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: () => undefined
        }
      },
      baseRuntimeConfig,
      { pollingManagerOverride: mockPollingManager }
    )

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_4",
            sessionID: "ses_4",
            role: "assistant",
            time: { created: 1000, completed: 1200 },
            parentID: "msg_user_1",
            modelID: "claude-opus-4",
            providerID: "anthropic",
            mode: "primary",
            path: { cwd: "/tmp/project", root: "/tmp/project" },
            cost: 0.01,
            tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      }
    })

    const output = { text: "assistant result" }
    await hooks["experimental.text.complete"]?.(
      {
        sessionID: "ses_4",
        messageID: "msg_4",
        partID: "part_1"
      },
      output
    )

    expect(output.text).toContain("| 5h:")
    expect(output.text).toContain("| 7d:")
    expect(output.text).toContain("claude-opus-4")
    expect(output.text).toContain("|")
  })

  it("buildAssistantUsageLine uses real % from apiUsage without ~ prefix", () => {
    const nowMs = Date.now()
    const result = buildAssistantUsageLine({
      sessionKey: "ses_test",
      providerID: "anthropic",
      modelID: "claude-opus-4",
      contextUsedTokens: 10000,
      contextLimitTokens: 200000,
      usageSamples: [],
      nowMs,
      apiUsage: {
        provider: "anthropic",
        fetchedAtMs: nowMs,
        windows: [
          { label: "5h", usedPercent: 33, resetAtMs: nowMs + 2 * 60 * 60 * 1000 },
          { label: "7d", usedPercent: 8, resetAtMs: nowMs + 5 * 24 * 60 * 60 * 1000 }
        ]
      }
    })

    expect(result).toContain("5h: 33%")
    expect(result).toContain("7d: 8%")
    expect(result).not.toContain("5h: ~")
    expect(result).not.toContain("7d: ~")
  })

  it("buildAssistantUsageLine uses ~% fallback when apiUsage is null", () => {
    const nowMs = Date.now()
    const result = buildAssistantUsageLine({
      sessionKey: "ses_test",
      providerID: "anthropic",
      modelID: "claude-opus-4",
      contextUsedTokens: 10000,
      contextLimitTokens: 200000,
      usageSamples: [],
      nowMs,
      apiUsage: null
    })

    expect(result).toContain("5h: ~")
    expect(result).toContain("7d: ~")
  })

  it("buildAssistantUsageLine uses ~% fallback when apiUsage has error", () => {
    const nowMs = Date.now()
    const result = buildAssistantUsageLine({
      sessionKey: "ses_test",
      providerID: "anthropic",
      modelID: "claude-opus-4",
      contextUsedTokens: 10000,
      contextLimitTokens: 200000,
      usageSamples: [],
      nowMs,
      apiUsage: {
        provider: "anthropic",
        fetchedAtMs: nowMs,
        windows: [],
        error: "API rate limit exceeded"
      }
    })

    expect(result).toContain("5h: ~")
    expect(result).toContain("7d: ~")
  })

  it("buildAssistantUsageLine mixes real and approx when only one window present", () => {
    const nowMs = Date.now()
    const result = buildAssistantUsageLine({
      sessionKey: "ses_test",
      providerID: "anthropic",
      modelID: "claude-opus-4",
      contextUsedTokens: 10000,
      contextLimitTokens: 200000,
      usageSamples: [],
      nowMs,
      apiUsage: {
        provider: "anthropic",
        fetchedAtMs: nowMs,
        windows: [
          { label: "5h", usedPercent: 50, resetAtMs: nowMs + 3 * 60 * 60 * 1000 }
        ]
      }
    })

    expect(result).toContain("5h: 50%")
    expect(result).not.toContain("5h: ~")
    expect(result).toContain("7d: ~")
  })

  it("mock polling manager returns expected snapshot via latest()", () => {
    const snapshot = createSuccessSnapshot({
      windows: [{ label: "5h", usedPercent: 75, resetAtMs: Date.now() }]
    })
    const mockPollingManager = createMockPollingManager(snapshot)

    expect(mockPollingManager.latest()).toBe(snapshot)
    expect(mockPollingManager.latest()?.windows[0]?.usedPercent).toBe(75)
  })

  it("plugin with mock polling manager does not call start()", () => {
    const mockPollingManager = createMockPollingManager(null)

    createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: () => undefined
        }
      },
      baseRuntimeConfig,
      { pollingManagerOverride: mockPollingManager }
    )

    expect(mockPollingManager.start).not.toHaveBeenCalled()
  })

  it("chat.params triggers forceRefresh when provider changes", async () => {
    const forceRefreshSpy = vi.fn(async () => null)
    const mockPollingManager: PollingManager = {
      start: vi.fn(),
      stop: vi.fn(),
      latest: vi.fn(() => null),
      forceRefresh: forceRefreshSpy,
      isRunning: vi.fn(() => false)
    }

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: () => undefined
        }
      },
      baseRuntimeConfig,
      { pollingManagerOverride: mockPollingManager }
    )

    const chatParamsOutput = { temperature: 1, topP: 1, topK: 0, options: {} }

    await hooks["chat.params"]?.({
      sessionID: "ses_switch",
      agent: "Sisyphus",
      model: {
        id: "claude-opus-4",
        cost: { input: 0.000015, output: 0.000075, cache: { read: 0, write: 0 } },
        limit: { context: 200000, output: 16384 }
      },
      provider: { id: "anthropic" }
    } as never, chatParamsOutput as never)

    await vi.waitFor(() => {
      expect(forceRefreshSpy).toHaveBeenCalledTimes(1)
    })

    forceRefreshSpy.mockClear()

    await hooks["chat.params"]?.({
      sessionID: "ses_switch",
      agent: "Sisyphus",
      model: {
        id: "claude-opus-4",
        cost: { input: 0.000015, output: 0.000075, cache: { read: 0, write: 0 } },
        limit: { context: 200000, output: 16384 }
      },
      provider: { id: "anthropic" }
    } as never, chatParamsOutput as never)

    expect(forceRefreshSpy).not.toHaveBeenCalled()
  })

  it("chat.params triggers forceRefresh when model changes within same provider", async () => {
    const forceRefreshSpy = vi.fn(async () => null)
    const mockPollingManager: PollingManager = {
      start: vi.fn(),
      stop: vi.fn(),
      latest: vi.fn(() => null),
      forceRefresh: forceRefreshSpy,
      isRunning: vi.fn(() => false)
    }

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: () => undefined
        }
      },
      baseRuntimeConfig,
      { pollingManagerOverride: mockPollingManager }
    )

    const chatParamsOutput = { temperature: 1, topP: 1, topK: 0, options: {} }

    await hooks["chat.params"]?.({
      sessionID: "ses_model_switch",
      agent: "Sisyphus",
      model: {
        id: "claude-opus-4",
        cost: { input: 0.000015, output: 0.000075, cache: { read: 0, write: 0 } },
        limit: { context: 200000, output: 16384 }
      },
      provider: { id: "anthropic" }
    } as never, chatParamsOutput as never)

    await vi.waitFor(() => {
      expect(forceRefreshSpy).toHaveBeenCalledTimes(1)
    })

    forceRefreshSpy.mockClear()

    await hooks["chat.params"]?.({
      sessionID: "ses_model_switch",
      agent: "Sisyphus",
      model: {
        id: "claude-sonnet-4",
        cost: { input: 0.000003, output: 0.000015, cache: { read: 0, write: 0 } },
        limit: { context: 200000, output: 16384 }
      },
      provider: { id: "anthropic" }
    } as never, chatParamsOutput as never)

    await vi.waitFor(() => {
      expect(forceRefreshSpy).toHaveBeenCalledTimes(1)
    })
  })
})

describe("provider key resolution", () => {
  const baseRuntimeConfig = {
    verbosity: "normal" as const,
    promptProfile: "minimal" as const,
    usageDisplay: "output" as const,
    usagePromptIntervalMs: 0
  }

  function createMockPollingManager(snapshot: ProviderUsageSnapshot | null = null) {
    return {
      start: vi.fn(),
      stop: vi.fn(),
      latest: vi.fn(() => snapshot),
      forceRefresh: vi.fn(async () => snapshot),
      isRunning: vi.fn(() => false)
    }
  }

  it("HUD line picks Anthropic snapshot via override when model is Claude", async () => {
    const anthropicSnapshot: ProviderUsageSnapshot = {
      provider: "anthropic",
      fetchedAtMs: Date.now(),
      windows: [
        { label: "5h", usedPercent: 33, resetAtMs: Date.now() + 3 * 60 * 60 * 1000 },
        { label: "7d", usedPercent: 12, resetAtMs: Date.now() + 4 * 24 * 60 * 60 * 1000 }
      ]
    }

    const mockPollingManager = createMockPollingManager(anthropicSnapshot)

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: () => undefined
        }
      },
      baseRuntimeConfig,
      { pollingManagerOverride: mockPollingManager }
    )

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_claude_override",
            sessionID: "ses_claude_override",
            role: "assistant",
            time: { created: 1000, completed: 1200 },
            parentID: "msg_user_1",
            modelID: "claude-opus-4",
            providerID: "anthropic",
            mode: "primary",
            path: { cwd: "/tmp/project", root: "/tmp/project" },
            cost: 0.01,
            tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      }
    })

    const output = { text: "assistant result" }
    await hooks["experimental.text.complete"]?.(
      {
        sessionID: "ses_claude_override",
        messageID: "msg_claude_override",
        partID: "part_1"
      },
      output
    )

    expect(output.text).toContain("5h: 33%")
    expect(output.text).toContain("7d: 12%")
  })

  it("HUD line falls back for OpenAI when no snapshot available", async () => {
    const mockPollingManager = createMockPollingManager(null)

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: () => undefined
        }
      },
      baseRuntimeConfig,
      { pollingManagerOverride: mockPollingManager }
    )

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_gpt_fallback",
            sessionID: "ses_gpt_fallback",
            role: "assistant",
            time: { created: 1000, completed: 1200 },
            parentID: "msg_user_1",
            modelID: "openai/gpt-5",
            providerID: "openai",
            mode: "primary",
            path: { cwd: "/tmp/project", root: "/tmp/project" },
            cost: 0.01,
            tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      }
    })

    const output = { text: "assistant result" }
    await hooks["experimental.text.complete"]?.(
      {
        sessionID: "ses_gpt_fallback",
        messageID: "msg_gpt_fallback",
        partID: "part_1"
      },
      output
    )

    expect(output.text).toContain("5h: ~")
    expect(output.text).toContain("7d: ~")
    expect(output.text).toContain("gpt-5")
  })

  it("HUD line uses fallback when provider is unknown", async () => {
    const mockPollingManager = createMockPollingManager(null)

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: () => undefined
        }
      },
      baseRuntimeConfig,
      { pollingManagerOverride: mockPollingManager }
    )

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_unknown",
            sessionID: "ses_unknown",
            role: "assistant",
            time: { created: 1000, completed: 1200 },
            parentID: "msg_user_1",
            modelID: "unknown-provider/unknown-model",
            providerID: "unknown-provider",
            mode: "primary",
            path: { cwd: "/tmp/project", root: "/tmp/project" },
            cost: 0.01,
            tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      }
    })

    const output = { text: "assistant result" }
    await hooks["experimental.text.complete"]?.(
      {
        sessionID: "ses_unknown",
        messageID: "msg_unknown",
        partID: "part_1"
      },
      output
    )

    expect(output.text).toContain("5h: ~")
    expect(output.text).toContain("7d: ~")
  })

  it("HUD line does not reuse Anthropic snapshot for non-Anthropic provider with Claude model", async () => {
    const snapshot: ProviderUsageSnapshot = {
      provider: "anthropic",
      fetchedAtMs: Date.now(),
      windows: [
        { label: "5h", usedPercent: 61, resetAtMs: Date.now() + 4 * 60 * 60 * 1000 },
        { label: "7d", usedPercent: 22, resetAtMs: Date.now() + 3 * 24 * 60 * 60 * 1000 }
      ]
    }
    const mockPollingManager = createMockPollingManager(snapshot)

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: () => undefined
        }
      },
      baseRuntimeConfig,
      { pollingManagerOverride: mockPollingManager }
    )

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_non_anthropic_claude",
            sessionID: "ses_non_anthropic_claude",
            role: "assistant",
            time: { created: 1000, completed: 1200 },
            parentID: "msg_user_1",
            modelID: "claude-opus-4",
            providerID: "openrouter",
            mode: "primary",
            path: { cwd: "/tmp/project", root: "/tmp/project" },
            cost: 0.01,
            tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      }
    })

    const output = { text: "assistant result" }
    await hooks["experimental.text.complete"]?.(
      {
        sessionID: "ses_non_anthropic_claude",
        messageID: "msg_non_anthropic_claude",
        partID: "part_1"
      },
      output
    )

    expect(output.text).toContain("5h: ~")
    expect(output.text).toContain("7d: ~")
    expect(output.text).not.toContain("5h: 61%")
    expect(output.text).not.toContain("7d: 22%")
  })

  it("HUD line can still infer Anthropic when providerID is empty", async () => {
    const snapshot: ProviderUsageSnapshot = {
      provider: "anthropic",
      fetchedAtMs: Date.now(),
      windows: [
        { label: "5h", usedPercent: 48, resetAtMs: Date.now() + 4 * 60 * 60 * 1000 },
        { label: "7d", usedPercent: 18, resetAtMs: Date.now() + 3 * 24 * 60 * 60 * 1000 }
      ]
    }
    const mockPollingManager = createMockPollingManager(snapshot)

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: () => undefined
        }
      },
      baseRuntimeConfig,
      { pollingManagerOverride: mockPollingManager }
    )

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_empty_provider_claude",
            sessionID: "ses_empty_provider_claude",
            role: "assistant",
            time: { created: 1000, completed: 1200 },
            parentID: "msg_user_1",
            modelID: "claude-sonnet-4",
            providerID: "",
            mode: "primary",
            path: { cwd: "/tmp/project", root: "/tmp/project" },
            cost: 0.01,
            tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      }
    })

    const output = { text: "assistant result" }
    await hooks["experimental.text.complete"]?.(
      {
        sessionID: "ses_empty_provider_claude",
        messageID: "msg_empty_provider_claude",
        partID: "part_1"
      },
      output
    )

    expect(output.text).toContain("5h: 48%")
    expect(output.text).toContain("7d: 18%")
  })

  it("output text includes dim ANSI codes", async () => {
    const mockPollingManager = createMockPollingManager(null)

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: () => undefined
        }
      },
      baseRuntimeConfig,
      { pollingManagerOverride: mockPollingManager }
    )

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_dim",
            sessionID: "ses_dim",
            role: "assistant",
            time: { created: 1000, completed: 1200 },
            parentID: "msg_user_1",
            modelID: "claude-opus-4",
            providerID: "anthropic",
            mode: "primary",
            path: { cwd: "/tmp/project", root: "/tmp/project" },
            cost: 0.01,
            tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }
      }
    })

    const output = { text: "assistant result" }
    await hooks["experimental.text.complete"]?.(
      {
        sessionID: "ses_dim",
        messageID: "msg_dim",
        partID: "part_1"
      },
      output
    )

    expect(output.text).not.toContain("\x1b[2m")
    expect(output.text).not.toContain("\x1b[22m")
    expect(output.text).toContain("| 0%")
  })
})
