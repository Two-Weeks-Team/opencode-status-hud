import { describe, expect, it } from "vitest"

import { createInitialCoexistenceState, dispatchHudTransition } from "../src/runtime/coexistence.js"
import { createInitialHudState, reduceHudState } from "../src/runtime/reducer.js"

function createClients() {
  const prompt: string[] = []

  return {
    prompt,
    promptClient: {
      tui: {
        appendPrompt: (payload: { content: string }) => {
          prompt.push(payload.content)
        }
      }
    }
  }
}

describe("coexistence hardening", () => {
  it("applies configurable verbosity controls", async () => {
    const clients = createClients()
    const base = createInitialHudState()
    const next = reduceHudState(base, {
      type: "tool.execute.after",
      toolName: "bash",
      ok: true,
      ts: 1000
    })

    const result = await dispatchHudTransition({
      previousState: base,
      nextState: next,
      coexistenceState: createInitialCoexistenceState(0),
      nowMs: 1000,
      promptClient: clients.promptClient,
      config: {
        verbosity: "low",
        promptProfile: "minimal"
      }
    })

    expect(result.emitted.prompt).toBe(true)
  })

  it("remains stable under loader-order variance simulation", async () => {
    const run = async (reverseOrder: boolean) => {
      const a = createClients()
      const b = createClients()

      let hudState = createInitialHudState()
      let aRuntime = createInitialCoexistenceState(0)
      let bRuntime = createInitialCoexistenceState(0)

      for (let i = 0; i < 20; i += 1) {
        const previous = hudState
        hudState = reduceHudState(hudState, {
          type: "tool.execute.before",
          toolName: "bash",
          ts: i * 10
        })

        const first = reverseOrder ? "b" : "a"

        if (first === "a") {
          const ra = await dispatchHudTransition({
            previousState: previous,
            nextState: hudState,
            coexistenceState: aRuntime,
            nowMs: i,
            promptClient: a.promptClient,
            config: {
              verbosity: "normal",
              promptProfile: "balanced"
            }
          })
          aRuntime = ra.coexistenceState

          const rb = await dispatchHudTransition({
            previousState: previous,
            nextState: hudState,
            coexistenceState: bRuntime,
            nowMs: i,
            promptClient: b.promptClient,
            config: {
              verbosity: "normal",
              promptProfile: "balanced"
            }
          })
          bRuntime = rb.coexistenceState
        } else {
          const rb = await dispatchHudTransition({
            previousState: previous,
            nextState: hudState,
            coexistenceState: bRuntime,
            nowMs: i,
            promptClient: b.promptClient,
            config: {
              verbosity: "normal",
              promptProfile: "balanced"
            }
          })
          bRuntime = rb.coexistenceState

          const ra = await dispatchHudTransition({
            previousState: previous,
            nextState: hudState,
            coexistenceState: aRuntime,
            nowMs: i,
            promptClient: a.promptClient,
            config: {
              verbosity: "normal",
              promptProfile: "balanced"
            }
          })
          aRuntime = ra.coexistenceState
        }
      }

      return {
        aPrompt: a.prompt.length,
        bPrompt: b.prompt.length
      }
    }

    const normalOrder = await run(false)
    const reverseOrder = await run(true)

    expect(normalOrder).toEqual(reverseOrder)
  })
})
