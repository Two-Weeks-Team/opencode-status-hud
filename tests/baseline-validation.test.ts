import { describe, expect, it } from "vitest"

import { createInitialEmitControllerState, emitToastOnStateTransition } from "../src/runtime/emit-controller.js"
import { parseIncomingEvent } from "../src/runtime/intake.js"
import { createInitialHudState, reduceHudState, type HudReducerEvent } from "../src/runtime/reducer.js"

function toReducerEvent(event: ReturnType<typeof parseIncomingEvent>): HudReducerEvent | null {
  if (event.kind !== "accepted") {
    return null
  }

  if (event.event.type === "tool.execute.before") {
    return {
      type: "tool.execute.before",
      toolName: event.event.toolName,
      ts: event.event.ts
    }
  }

  if (event.event.type === "tool.execute.after") {
    return {
      type: "tool.execute.after",
      toolName: event.event.toolName,
      ok: event.event.ok,
      ts: event.event.ts
    }
  }

  return {
    type: "event",
    name: event.event.name,
    ts: event.event.ts
  }
}

describe("baseline validation suite", () => {
  it("handles missing events safely without crashes", () => {
    const inputs: unknown[] = [{}, { type: "tool.execute.before" }, { type: "event" }, null]

    for (const input of inputs) {
      expect(() => parseIncomingEvent(input)).not.toThrow()
      expect(parseIncomingEvent(input).kind).toBe("ignored")
    }
  })

  it("accepts partial payloads with graceful degradation", () => {
    const parsed = parseIncomingEvent({
      type: "tool.execute.after",
      tool: { name: "bash" },
      session: { id: "ses_1" }
    })

    expect(parsed.kind).toBe("accepted")
    if (parsed.kind === "accepted" && parsed.event.type === "tool.execute.after") {
      expect(parsed.event.ok).toBeNull()
      expect(parsed.event.ts).toBeNull()
    }
  })

  it("keeps burst emission under configured cap", async () => {
    const payloads: string[] = []
    const client = {
      tui: {
        showToast: (payload: { title: string; message: string; variant: "info" | "error" | "neutral" }) => {
          payloads.push(`${payload.title}:${payload.message}`)
        }
      }
    }

    let state = createInitialHudState()
    let controllerState = createInitialEmitControllerState(0)

    for (let i = 0; i < 100; i += 1) {
      const parsed = parseIncomingEvent({
        type: "tool.execute.before",
        tool: { name: `tool-${i}` },
        ts: i
      })

      const reducerEvent = toReducerEvent(parsed)
      if (!reducerEvent) {
        continue
      }

      const nextState = reduceHudState(state, reducerEvent)
      const emitted = await emitToastOnStateTransition({
        previousState: state,
        nextState,
        controllerState,
        nowMs: 100,
        client,
        config: {
          cooldownMs: 0,
          maxEmitsPerWindow: 5,
          windowMs: 1000
        }
      })
      controllerState = emitted.controllerState
      state = nextState
    }

    expect(payloads.length).toBe(5)
  })

  it("runs smoke flow in plain runtime without oh-my-opencode dependency", async () => {
    const payloads: string[] = []
    const client = {
      tui: {
        showToast: (payload: { title: string; message: string; variant: "info" | "error" | "neutral" }) => {
          payloads.push(payload.message)
        }
      }
    }

    const rawInputs: unknown[] = [
      {
        type: "tool.execute.before",
        tool: { name: "bash" },
        session: { id: "ses_plain" },
        ts: 1000
      },
      {
        type: "tool.execute.after",
        tool: { name: "bash" },
        result: { ok: true },
        session: { id: "ses_plain" },
        ts: 1300
      }
    ]

    let state = createInitialHudState()
    let controllerState = createInitialEmitControllerState(0)

    for (const rawInput of rawInputs) {
      const parsed = parseIncomingEvent(rawInput)
      const reducerEvent = toReducerEvent(parsed)
      if (!reducerEvent) {
        continue
      }

      const nextState = reduceHudState(state, reducerEvent)
      const emitted = await emitToastOnStateTransition({
        previousState: state,
        nextState,
        controllerState,
        nowMs: nextState.lastTransition?.at ?? 0,
        client,
        config: {
          cooldownMs: 0,
          maxEmitsPerWindow: 10,
          windowMs: 1000
        }
      })

      controllerState = emitted.controllerState
      state = nextState
    }

    expect(state.lastStatus).toBe("done")
    expect(payloads.length).toBeGreaterThan(0)
  })
})
