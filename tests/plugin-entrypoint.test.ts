import { afterEach, describe, expect, it } from "vitest"

import defaultPluginExport, { OpenCodeStatusHudPlugin } from "../src/index.js"
import { createHudPluginHooks } from "../src/plugin.js"

const originalDateNow = Date.now

const OUTPUT_RUNTIME_CONFIG = {
  verbosity: "high",
  promptProfile: "minimal",
  usageDisplay: "output",
  usagePromptIntervalMs: 10000
} as const

afterEach(() => {
  Date.now = originalDateNow
})

describe("OpenCode plugin entrypoint", () => {
  it("keeps root default export as plugin function", () => {
    expect(defaultPluginExport).toBe(OpenCodeStatusHudPlugin)
  })

  it("emits HUD transitions from tool hooks without direct CLI execution", async () => {
    const prompts: string[] = []

    let clock = 1000
    Date.now = () => {
      clock += 1500
      return clock
    }

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: (parameters) => {
            prompts.push(parameters?.text ?? "")
          }
        }
      },
      {
        ...OUTPUT_RUNTIME_CONFIG,
        usageDisplay: "prompt"
      }
    )

    await hooks["tool.execute.before"]?.(
      {
        tool: "bash",
        sessionID: "ses_1",
        callID: "call_1"
      },
      { args: { command: "pwd" } }
    )

    await hooks["tool.execute.after"]?.(
      {
        tool: "bash",
        sessionID: "ses_1",
        callID: "call_1",
        args: { command: "pwd" }
      },
      {
        title: "bash",
        output: "ok",
        metadata: { ok: true }
      }
    )

    expect(prompts.length).toBeGreaterThanOrEqual(1)
  })

  it("ignores unrelated OpenCode events safely", async () => {
    const prompts: string[] = []

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: (parameters) => {
            prompts.push(parameters?.text ?? "")
          }
        }
      },
      OUTPUT_RUNTIME_CONFIG
    )

    await hooks.event?.({
      event: {
        type: "server.connected",
        properties: {}
      }
    })

    expect(prompts.length).toBe(0)
  })

  it("uses output usage display by default without env overrides", async () => {
    const prompts: string[] = []
    let intervalCallCount = 0

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: (parameters) => {
            prompts.push(parameters?.text ?? "")
          }
        }
      },
      undefined,
      {
        setIntervalFn: () => {
          intervalCallCount += 1
          return { unref: () => undefined }
        }
      }
    )

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_assistant_default_output_1",
            sessionID: "ses_1",
            role: "assistant",
            time: {
              created: 1000,
              completed: 1200
            },
            parentID: "msg_user_1",
            modelID: "openai/gpt-5.3-codex",
            providerID: "openai",
            mode: "primary",
            path: {
              cwd: "/tmp/project",
              root: "/tmp/project"
            },
            cost: 0.0123,
            tokens: {
              input: 120,
              output: 42,
              reasoning: 0,
              cache: {
                read: 0,
                write: 0
              }
            }
          }
        }
      }
    })

    const output = { text: "assistant result" }
    await hooks["experimental.text.complete"]?.(
      {
        sessionID: "ses_1",
        messageID: "msg_assistant_default_output_1",
        partID: "part_1"
      },
      output
    )

    const secondOutput = { text: "assistant result second" }
    await hooks["experimental.text.complete"]?.(
      {
        sessionID: "ses_1",
        messageID: "msg_assistant_default_output_1",
        partID: "part_2"
      },
      secondOutput
    )

    expect(intervalCallCount).toBe(0)
    expect(prompts).toHaveLength(0)
    expect(output.text).toContain("assistant result")
    expect(output.text).toContain("gpt-5.3-codex")
    expect(output.text).toContain("| 5h:")
    expect(secondOutput.text).toBe("assistant result second")
  })

  it("appends assistant usage text when usage display is prompt", async () => {
    const prompts: string[] = []

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: (parameters) => {
            prompts.push(parameters?.text ?? "")
          }
        }
      },
      {
        verbosity: "high",
        promptProfile: "minimal",
        usageDisplay: "prompt",
        usagePromptIntervalMs: 10000
      }
    )

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_assistant_prompt_1",
            sessionID: "ses_1",
            role: "assistant",
            time: {
              created: 1000,
              completed: 1200
            },
            parentID: "msg_user_1",
            modelID: "openai/gpt-5.3-codex",
            providerID: "openai",
            mode: "primary",
            path: {
              cwd: "/tmp/project",
              root: "/tmp/project"
            },
            cost: 0.0123,
            tokens: {
              input: 120,
              output: 42,
              reasoning: 0,
              cache: {
                read: 0,
                write: 0
              }
            }
          }
        }
      }
    })

    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain("gpt-5.3-codex")
    expect(prompts[0]).toContain("| 7d:")
  })

  it("re-appends latest usage prompt every 10 seconds", async () => {
    const prompts: string[] = []
    const heartbeats: Array<() => void> = []

    const hooks = createHudPluginHooks(
      {
        directory: "/tmp/project",
        tuiClient: {
          appendPrompt: (parameters) => {
            prompts.push(parameters?.text ?? "")
          }
        }
      },
      {
        verbosity: "high",
        promptProfile: "minimal",
        usageDisplay: "prompt",
        usagePromptIntervalMs: 10000
      },
      {
        setIntervalFn: (callback, intervalMs) => {
          expect(intervalMs).toBe(10000)
          heartbeats.push(callback)
          return { unref: () => undefined }
        }
      }
    )

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_assistant_prompt_heartbeat_1",
            sessionID: "ses_heartbeat_1",
            role: "assistant",
            time: {
              created: 1000,
              completed: 1200
            },
            parentID: "msg_user_1",
            modelID: "openai/gpt-5.3-codex",
            providerID: "openai",
            mode: "primary",
            path: {
              cwd: "/tmp/project",
              root: "/tmp/project"
            },
            cost: 0.0123,
            tokens: {
              input: 120,
              output: 42,
              reasoning: 0,
              cache: {
                read: 0,
                write: 0
              }
            }
          }
        }
      }
    })

    expect(prompts).toHaveLength(1)
    expect(heartbeats).toHaveLength(1)

    heartbeats[0]!()

    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toBe(prompts[0])
  })
})
