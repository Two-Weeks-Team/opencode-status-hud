import { describe, expect, it } from "vitest"

import { createInitialEmitControllerState, emitToastOnStateTransition } from "../src/runtime/emit-controller.js"
import { createInitialHudState, reduceHudState } from "../src/runtime/reducer.js"

function createToastCollector() {
  const payloads: { title: string; message: string; variant: string }[] = []

  return {
    payloads,
    client: {
      tui: {
        showToast: (payload: { title: string; message: string; variant: "info" | "error" | "neutral" }) => {
          payloads.push(payload)
        }
      }
    }
  }
}

describe("emitToastOnStateTransition", () => {
  it("emits only on meaningful transition changes", async () => {
    const { client, payloads } = createToastCollector()
    let state = createInitialHudState()
    state = reduceHudState(state, {
      type: "tool.execute.before",
      toolName: "bash",
      ts: 1000
    })

    const first = await emitToastOnStateTransition({
      previousState: null,
      nextState: state,
      controllerState: createInitialEmitControllerState(),
      nowMs: 1000,
      client
    })

    const second = await emitToastOnStateTransition({
      previousState: state,
      nextState: state,
      controllerState: first.controllerState,
      nowMs: 2000,
      client
    })

    expect(first.emitted).toBe(true)
    expect(second.emitted).toBe(false)
    expect(second.reason).toBe("not_meaningful_transition")
    expect(payloads).toHaveLength(1)
  })

  it("dedupes repeated transitions with same key", async () => {
    const { client, payloads } = createToastCollector()
    let state = createInitialHudState()
    state = reduceHudState(state, {
      type: "tool.execute.before",
      toolName: "bash",
      ts: 1000
    })

    const first = await emitToastOnStateTransition({
      previousState: null,
      nextState: state,
      controllerState: createInitialEmitControllerState(),
      nowMs: 1000,
      client
    })

    const second = await emitToastOnStateTransition({
      previousState: null,
      nextState: state,
      controllerState: first.controllerState,
      nowMs: 2500,
      client
    })

    expect(first.emitted).toBe(true)
    expect(second.emitted).toBe(false)
    expect(second.reason).toBe("duplicate_transition")
    expect(payloads).toHaveLength(1)
  })

  it("enforces window rate cap during burst simulation", async () => {
    const { client, payloads } = createToastCollector()
    let state = createInitialHudState()
    let previousState = null
    let controllerState = createInitialEmitControllerState(0)
    let emittedCount = 0

    for (let i = 0; i < 50; i += 1) {
      state = reduceHudState(state, {
        type: "tool.execute.before",
        toolName: `tool-${i}`,
        ts: i
      })

      const result = await emitToastOnStateTransition({
        previousState,
        nextState: state,
        controllerState,
        nowMs: 100,
        client,
        config: {
          cooldownMs: 0,
          maxEmitsPerWindow: 3,
          windowMs: 1000
        }
      })

      if (result.emitted) {
        emittedCount += 1
      }

      controllerState = result.controllerState
      previousState = state
    }

    expect(emittedCount).toBe(3)
    expect(payloads).toHaveLength(3)
  })

  it("suppresses burst messages under cooldown", async () => {
    const { client, payloads } = createToastCollector()
    let state = createInitialHudState()
    let controllerState = createInitialEmitControllerState(0)

    const before = reduceHudState(state, {
      type: "tool.execute.before",
      toolName: "bash",
      ts: 1000
    })
    const r1 = await emitToastOnStateTransition({
      previousState: state,
      nextState: before,
      controllerState,
      nowMs: 1000,
      client,
      config: {
        cooldownMs: 1000,
        maxEmitsPerWindow: 10,
        windowMs: 10000
      }
    })
    controllerState = r1.controllerState

    const after = reduceHudState(before, {
      type: "tool.execute.after",
      toolName: "bash",
      ok: true,
      ts: 1100
    })
    const r2 = await emitToastOnStateTransition({
      previousState: before,
      nextState: after,
      controllerState,
      nowMs: 1200,
      client,
      config: {
        cooldownMs: 1000,
        maxEmitsPerWindow: 10,
        windowMs: 10000
      }
    })
    controllerState = r2.controllerState

    const nextBefore = reduceHudState(after, {
      type: "tool.execute.before",
      toolName: "node",
      ts: 2300
    })
    const r3 = await emitToastOnStateTransition({
      previousState: after,
      nextState: nextBefore,
      controllerState,
      nowMs: 2300,
      client,
      config: {
        cooldownMs: 1000,
        maxEmitsPerWindow: 10,
        windowMs: 10000
      }
    })

    expect(r1.emitted).toBe(true)
    expect(r2.emitted).toBe(false)
    expect(r2.reason).toBe("cooldown")
    expect(r3.emitted).toBe(true)
    expect(payloads).toHaveLength(2)
  })
})
