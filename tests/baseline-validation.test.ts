import { describe, expect, it } from "vitest"

import { createInitialCoexistenceState, dispatchHudTransition } from "../src/runtime/coexistence.js"
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

  it("keeps burst emission under configured cap via coexistence", async () => {
    const prompts: string[] = []
    const promptClient = {
      tui: {
        appendPrompt: (payload: { content: string }) => {
          prompts.push(payload.content)
        }
      }
    }

    let state = createInitialHudState()
    let coexState = createInitialCoexistenceState(0)

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
      const result = await dispatchHudTransition({
        previousState: state,
        nextState,
        coexistenceState: coexState,
        nowMs: 100,
        promptClient,
        config: {
          verbosity: "low",
          promptProfile: "minimal"
        }
      })
      coexState = result.coexistenceState
      state = nextState
    }

    expect(prompts.length).toBeLessThanOrEqual(5)
  })

  it("runs smoke flow in plain runtime without oh-my-opencode dependency", async () => {
    const prompts: string[] = []
    const promptClient = {
      tui: {
        appendPrompt: (payload: { content: string }) => {
          prompts.push(payload.content)
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
    let coexState = createInitialCoexistenceState(0)

    for (const rawInput of rawInputs) {
      const parsed = parseIncomingEvent(rawInput)
      const reducerEvent = toReducerEvent(parsed)
      if (!reducerEvent) {
        continue
      }

      const nextState = reduceHudState(state, reducerEvent)
      const result = await dispatchHudTransition({
        previousState: state,
        nextState,
        coexistenceState: coexState,
        nowMs: nextState.lastTransition?.at ?? 0,
        promptClient,
        config: {
          verbosity: "high",
          promptProfile: "minimal"
        }
      })

      coexState = result.coexistenceState
      state = nextState
    }

    expect(state.lastStatus).toBe("done")
    expect(prompts.length).toBeGreaterThan(0)
  })
})
