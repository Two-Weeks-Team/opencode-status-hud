import { describe, expect, it } from "vitest"

import { createInitialHudState, reduceHudState } from "../src/runtime/reducer.js"

describe("reduceHudState", () => {
  it("transitions to running on tool.execute.before", () => {
    const next = reduceHudState(createInitialHudState(), {
      type: "tool.execute.before",
      toolName: "bash"
    })

    expect(next.activeTool).toBe("bash")
    expect(next.lastStatus).toBe("running")
    expect(next.transitions).toBe(1)
  })

  it("transitions to done on successful tool.execute.after", () => {
    const state = reduceHudState(createInitialHudState(), {
      type: "tool.execute.before",
      toolName: "bash"
    })

    const next = reduceHudState(state, {
      type: "tool.execute.after",
      toolName: "bash",
      ok: true
    })

    expect(next.activeTool).toBeNull()
    expect(next.lastStatus).toBe("done")
    expect(next.transitions).toBe(2)
  })
})
