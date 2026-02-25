import { describe, expect, it } from "vitest"

import { createInitialCoexistenceState, dispatchHudTransition } from "../src/runtime/coexistence.js"
import { createInitialHudState, reduceHudState } from "../src/runtime/reducer.js"

describe("optional publisher", () => {
  it("keeps baseline unchanged when publisher is disabled", async () => {
    const snapshots: unknown[] = []
    const base = createInitialHudState()
    const next = reduceHudState(base, {
      type: "tool.execute.before",
      toolName: "bash",
      ts: 1000
    })

    const result = await dispatchHudTransition({
      previousState: base,
      nextState: next,
      coexistenceState: createInitialCoexistenceState(0),
      nowMs: 1000,
      publisherClient: {
        publish: (snapshot) => {
          snapshots.push(snapshot)
        }
      },
      publisherConfig: {
        enabled: false
      }
    })

    expect(result.emitted.publisher).toBe(false)
    expect(snapshots.length).toBe(0)
  })

  it("publishes snapshot when feature flag is enabled", async () => {
    const snapshots: Array<{ status: string; toolName: string | null; version: number }> = []
    const base = createInitialHudState()
    const next = reduceHudState(base, {
      type: "tool.execute.before",
      toolName: "bash",
      ts: 1000
    })

    const result = await dispatchHudTransition({
      previousState: base,
      nextState: next,
      coexistenceState: createInitialCoexistenceState(0),
      nowMs: 1000,
      publisherClient: {
        publish: (snapshot) => {
          snapshots.push({
            status: snapshot.status,
            toolName: snapshot.toolName,
            version: snapshot.version
          })
        }
      },
      publisherConfig: {
        enabled: true,
        cooldownMs: 0,
        maxPublishesPerWindow: 3,
        windowMs: 1000
      }
    })

    expect(result.emitted.publisher).toBe(true)
    expect(snapshots).toEqual([
      {
        status: "running",
        toolName: "bash",
        version: 1
      }
    ])
  })

  it("does not disrupt baseline when publisher sink fails", async () => {
    const prompt: string[] = []
    const base = createInitialHudState()
    const next = reduceHudState(base, {
      type: "tool.execute.after",
      toolName: "bash",
      ok: true,
      ts: 1100
    })

    const result = await dispatchHudTransition({
      previousState: base,
      nextState: next,
      coexistenceState: createInitialCoexistenceState(0),
      nowMs: 1100,
      promptClient: {
        tui: {
          appendPrompt: (payload) => {
            prompt.push(payload.content)
          }
        }
      },
      publisherClient: {
        publish: async () => {
          throw new Error("sink down")
        }
      },
      publisherConfig: {
        enabled: true,
        cooldownMs: 0,
        maxPublishesPerWindow: 3,
        windowMs: 1000
      },
      config: {
        verbosity: "normal",
        promptProfile: "minimal"
      }
    })

    expect(result.emitted.publisher).toBe(false)
    expect(result.emitted.prompt).toBe(true)
    expect(prompt.length).toBe(1)
  })
})
