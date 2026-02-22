import { describe, expect, it } from "vitest"

import { createInitialHudState, reduceHudState } from "../src/runtime/reducer.js"

describe("reduceHudState", () => {
  it("transitions to running on tool.execute.before", () => {
    const next = reduceHudState(createInitialHudState(), {
      type: "tool.execute.before",
      toolName: "bash",
      ts: 1000
    })

    expect(next.activeTool).toBe("bash")
    expect(next.lastStatus).toBe("running")
    expect(next.lastTransition?.type).toBe("tool.execute.before")
    expect(next.history).toHaveLength(1)
    expect(next.transitions).toBe(1)
  })

  it("stores last result and duration on tool.execute.after", () => {
    const state = reduceHudState(createInitialHudState(), {
      type: "tool.execute.before",
      toolName: "bash",
      ts: 1000
    })

    const next = reduceHudState(state, {
      type: "tool.execute.after",
      toolName: "bash",
      ok: true,
      ts: 2400
    })

    expect(next.activeTool).toBeNull()
    expect(next.lastStatus).toBe("done")
    expect(next.lastResult).toBe(true)
    expect(next.lastDurationMs).toBe(1400)
    expect(next.lastTransition?.durationMs).toBe(1400)
    expect(next.history).toHaveLength(2)
    expect(next.transitions).toBe(2)
  })

  it("keeps transition history bounded by maxHistoryEntries", () => {
    let state = createInitialHudState({ maxHistoryEntries: 5 })

    for (let i = 0; i < 20; i += 1) {
      state = reduceHudState(state, {
        type: "tool.execute.before",
        toolName: `tool-${i}`,
        ts: i
      })
    }

    expect(state.history).toHaveLength(5)
    expect(state.history[0]?.label).toBe("tool-15")
    expect(state.history[4]?.label).toBe("tool-19")
  })

  it("stays within cap during long-session simulation", () => {
    const maxHistoryEntries = 200
    let state = createInitialHudState({ maxHistoryEntries })

    for (let i = 0; i < 5000; i += 1) {
      const startedAt = i * 10
      const finishedAt = startedAt + 3

      state = reduceHudState(state, {
        type: "tool.execute.before",
        toolName: "bash",
        ts: startedAt
      })

      state = reduceHudState(state, {
        type: "tool.execute.after",
        toolName: "bash",
        ok: true,
        ts: finishedAt
      })
    }

    expect(state.history.length).toBe(maxHistoryEntries)
    expect(state.transitions).toBe(10000)
  })
})
