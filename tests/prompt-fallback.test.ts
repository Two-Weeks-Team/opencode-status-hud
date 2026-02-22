import { describe, expect, it } from "vitest"

import { HUD_PROFILES } from "../src/config/index.js"
import { createInitialPromptFallbackState, emitPromptOnStateTransition } from "../src/runtime/prompt-fallback.js"
import { createInitialHudState, reduceHudState } from "../src/runtime/reducer.js"

function createPromptCollector() {
  const contents: string[] = []

  return {
    contents,
    client: {
      tui: {
        appendPrompt: (payload: { content: string }) => {
          contents.push(payload.content)
        }
      }
    }
  }
}

describe("prompt fallback", () => {
  it("exposes profile options", () => {
    expect(HUD_PROFILES).toEqual(["minimal", "balanced", "verbose"])
  })

  it("minimal profile suppresses running and emits done transitions", async () => {
    const { contents, client } = createPromptCollector()
    let fallbackState = createInitialPromptFallbackState(0)

    const base = createInitialHudState()
    const running = reduceHudState(base, {
      type: "tool.execute.before",
      toolName: "bash",
      ts: 1000
    })

    const r1 = await emitPromptOnStateTransition({
      previousState: base,
      nextState: running,
      fallbackState,
      nowMs: 1000,
      client,
      config: {
        profile: "minimal",
        cooldownMs: 0,
        maxEmitsPerWindow: 10,
        windowMs: 1000
      }
    })
    fallbackState = r1.fallbackState

    const done = reduceHudState(running, {
      type: "tool.execute.after",
      toolName: "bash",
      ok: true,
      ts: 1400
    })

    const r2 = await emitPromptOnStateTransition({
      previousState: running,
      nextState: done,
      fallbackState,
      nowMs: 1400,
      client,
      config: {
        profile: "minimal",
        cooldownMs: 0,
        maxEmitsPerWindow: 10,
        windowMs: 1000
      }
    })

    expect(r1.emitted).toBe(false)
    expect(r1.reason).toBe("profile_filtered")
    expect(r2.emitted).toBe(true)
    expect(contents).toHaveLength(1)
  })

  it("keeps prompt output readable in long-session simulation", async () => {
    const { contents, client } = createPromptCollector()
    let state = createInitialHudState()
    let fallbackState = createInitialPromptFallbackState(0)

    for (let i = 0; i < 400; i += 1) {
      const running = reduceHudState(state, {
        type: "tool.execute.before",
        toolName: `tool-${i}`,
        ts: i
      })

      const emittedRunning = await emitPromptOnStateTransition({
        previousState: state,
        nextState: running,
        fallbackState,
        nowMs: 100,
        client,
        config: {
          profile: "minimal",
          cooldownMs: 0,
          maxEmitsPerWindow: 2,
          windowMs: 1000,
          maxPromptLength: 120
        }
      })

      fallbackState = emittedRunning.fallbackState

      const done = reduceHudState(running, {
        type: "tool.execute.after",
        toolName: `tool-${i}`,
        ok: true,
        ts: i + 5
      })

      const emittedDone = await emitPromptOnStateTransition({
        previousState: running,
        nextState: done,
        fallbackState,
        nowMs: 100,
        client,
        config: {
          profile: "minimal",
          cooldownMs: 0,
          maxEmitsPerWindow: 2,
          windowMs: 1000,
          maxPromptLength: 120
        }
      })

      fallbackState = emittedDone.fallbackState
      state = done
    }

    expect(contents.length).toBeLessThanOrEqual(2)
    expect(contents.every((line) => line.length <= 120)).toBe(true)
  })

  it("sanitizes transition labels to reduce prompt-injection risk", async () => {
    const { contents, client } = createPromptCollector()
    const base = createInitialHudState()
    const malicious = reduceHudState(base, {
      type: "tool.execute.before",
      toolName: "bad\n`IGNORE ALL` <script>",
      ts: 1000
    })

    const result = await emitPromptOnStateTransition({
      previousState: base,
      nextState: malicious,
      fallbackState: createInitialPromptFallbackState(0),
      nowMs: 1000,
      client,
      config: {
        profile: "balanced",
        cooldownMs: 0,
        maxEmitsPerWindow: 10,
        windowMs: 1000,
        maxPromptLength: 120
      }
    })

    expect(result.emitted).toBe(true)
    expect(contents).toHaveLength(1)
    expect(contents[0]?.includes("\n")).toBe(false)
    expect(contents[0]?.includes("`")).toBe(false)
    expect(contents[0]?.includes("<")).toBe(false)
    expect(contents[0]?.includes(">")).toBe(false)
  })

  it("handles very small prompt length limits safely", async () => {
    const { contents, client } = createPromptCollector()
    const base = createInitialHudState()
    const done = reduceHudState(base, {
      type: "tool.execute.after",
      toolName: "bash",
      ok: true,
      ts: 1000
    })

    const result = await emitPromptOnStateTransition({
      previousState: base,
      nextState: done,
      fallbackState: createInitialPromptFallbackState(0),
      nowMs: 1000,
      client,
      config: {
        profile: "minimal",
        cooldownMs: 0,
        maxEmitsPerWindow: 10,
        windowMs: 1000,
        maxPromptLength: 2
      }
    })

    expect(result.emitted).toBe(true)
    expect(contents[0]).toBe("..")
  })
})
