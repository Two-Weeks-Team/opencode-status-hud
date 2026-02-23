import { afterEach, describe, expect, it } from "vitest"

import defaultPluginExport, { OpenCodeStatusHudPlugin } from "../src/index.js"
import { createHudPluginHooks } from "../src/plugin.js"

const originalDateNow = Date.now

afterEach(() => {
  Date.now = originalDateNow
})

describe("OpenCode plugin entrypoint", () => {
  it("keeps root default export as plugin function", () => {
    expect(defaultPluginExport).toBe(OpenCodeStatusHudPlugin)
  })

  it("emits HUD transitions from tool hooks without direct CLI execution", async () => {
    const toasts: Array<{
      title: string | undefined
      message: string | undefined
      variant: string | undefined
      directory: string | undefined
    }> = []

    let clock = 1000
    Date.now = () => {
      clock += 1500
      return clock
    }

    const hooks = createHudPluginHooks({
      directory: "/tmp/project",
      tuiClient: {
        showToast: (parameters) => {
          toasts.push({
            title: parameters?.title,
            message: parameters?.message,
            variant: parameters?.variant,
            directory: parameters?.directory
          })
        },
        appendPrompt: () => undefined
      }
    })

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

    expect(toasts.length).toBeGreaterThanOrEqual(2)
    expect(toasts[0]?.directory).toBe("/tmp/project")
  })

  it("ignores unrelated OpenCode events safely", async () => {
    const toasts: Array<{ message: string | undefined; variant: string | undefined }> = []

    const hooks = createHudPluginHooks({
      directory: "/tmp/project",
      tuiClient: {
        showToast: (parameters) => {
          toasts.push({
            message: parameters?.message,
            variant: parameters?.variant
          })
        },
        appendPrompt: () => undefined
      }
    })

    await hooks.event?.({
      event: {
        type: "server.connected",
        properties: {}
      }
    })

    expect(toasts.length).toBe(0)
  })
})
