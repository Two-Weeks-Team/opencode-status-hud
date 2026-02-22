import { describe, expect, it } from "vitest"

import { createInitialCoexistenceState, dispatchHudTransition } from "../src/runtime/coexistence.js"
import { createInitialHudState, reduceHudState } from "../src/runtime/reducer.js"

function createClients() {
  const toast: string[] = []
  const prompt: string[] = []

  return {
    toast,
    prompt,
    toastClient: {
      tui: {
        showToast: (payload: { title: string; message: string; variant: "info" | "error" | "neutral" }) => {
          toast.push(`${payload.title}:${payload.message}`)
        }
      }
    },
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
  it("applies configurable channel mode controls", async () => {
    const clients = createClients()
    const base = createInitialHudState()
    const next = reduceHudState(base, {
      type: "tool.execute.after",
      toolName: "bash",
      ok: true,
      ts: 1000
    })

    const toastOnly = await dispatchHudTransition({
      previousState: base,
      nextState: next,
      coexistenceState: createInitialCoexistenceState(0),
      nowMs: 1000,
      toastClient: clients.toastClient,
      promptClient: clients.promptClient,
      config: {
        channelMode: "toast-only",
        verbosity: "low",
        promptProfile: "minimal"
      }
    })

    const promptOnly = await dispatchHudTransition({
      previousState: base,
      nextState: next,
      coexistenceState: createInitialCoexistenceState(0),
      nowMs: 1000,
      toastClient: clients.toastClient,
      promptClient: clients.promptClient,
      config: {
        channelMode: "prompt-only",
        verbosity: "low",
        promptProfile: "minimal"
      }
    })

    expect(toastOnly.emitted.toast).toBe(true)
    expect(toastOnly.emitted.prompt).toBe(false)
    expect(promptOnly.emitted.toast).toBe(false)
    expect(promptOnly.emitted.prompt).toBe(true)
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
            toastClient: a.toastClient,
            promptClient: a.promptClient,
            config: {
              channelMode: "both",
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
            toastClient: b.toastClient,
            promptClient: b.promptClient,
            config: {
              channelMode: "both",
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
            toastClient: b.toastClient,
            promptClient: b.promptClient,
            config: {
              channelMode: "both",
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
            toastClient: a.toastClient,
            promptClient: a.promptClient,
            config: {
              channelMode: "both",
              verbosity: "normal",
              promptProfile: "balanced"
            }
          })
          aRuntime = ra.coexistenceState
        }
      }

      return {
        aToast: a.toast.length,
        aPrompt: a.prompt.length,
        bToast: b.toast.length,
        bPrompt: b.prompt.length
      }
    }

    const normalOrder = await run(false)
    const reverseOrder = await run(true)

    expect(normalOrder).toEqual(reverseOrder)
  })
})
