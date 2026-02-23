import type { Hooks, Plugin } from "@opencode-ai/plugin"

import {
  createInitialCoexistenceState,
  type CoexistenceRuntimeState,
  dispatchHudTransition
} from "./runtime/coexistence.js"
import { parseIncomingEvent } from "./runtime/intake.js"
import { createInitialHudState, reduceHudState, type HudReducerEvent, type HudState } from "./runtime/reducer.js"

type HudPluginHooks = Pick<Hooks, "event" | "tool.execute.before" | "tool.execute.after">

interface HudPluginTuiClient {
  showToast: (parameters?: {
    directory?: string
    title?: string
    message?: string
    variant?: "info" | "success" | "warning" | "error"
    duration?: number
  }) => unknown
  appendPrompt: (parameters?: {
    directory?: string
    text?: string
  }) => unknown
}

export interface HudPluginContext {
  directory: string
  tuiClient: HudPluginTuiClient
}

interface SessionRuntime {
  hudState: HudState
  coexistenceState: CoexistenceRuntimeState
}

const SESSION_FALLBACK_KEY = "__global__"

function toSessionKey(sessionID: string | null | undefined): string {
  return sessionID ?? SESSION_FALLBACK_KEY
}

function inferToolResult(output: { output: string; metadata: unknown }): boolean | null {
  if (typeof output.metadata === "object" && output.metadata !== null) {
    const maybeOk = (output.metadata as Record<string, unknown>).ok
    if (typeof maybeOk === "boolean") {
      return maybeOk
    }
  }

  const lower = output.output.toLowerCase()
  if (lower.includes("error:") || lower.includes("failed") || lower.includes("exception")) {
    return false
  }

  if (output.output.trim().length === 0) {
    return null
  }

  return true
}

export function createHudPluginHooks(ctx: HudPluginContext): HudPluginHooks {
  const sessionRuntimes = new Map<string, SessionRuntime>()

  const getOrCreateSessionRuntime = (sessionKey: string, nowMs: number): SessionRuntime => {
    const existing = sessionRuntimes.get(sessionKey)
    if (existing) {
      return existing
    }

    const created: SessionRuntime = {
      hudState: createInitialHudState(),
      coexistenceState: createInitialCoexistenceState(nowMs)
    }
    sessionRuntimes.set(sessionKey, created)
    return created
  }

  const dispatchReducerEvent = async (sessionKey: string, event: HudReducerEvent, nowMs: number): Promise<void> => {
    const runtime = getOrCreateSessionRuntime(sessionKey, nowMs)
    const previousState = runtime.hudState
    const nextState = reduceHudState(previousState, event)

    const transition = await dispatchHudTransition({
      previousState,
      nextState,
      coexistenceState: runtime.coexistenceState,
      nowMs,
      toastClient: {
        tui: {
          showToast: async (payload) => {
            await ctx.tuiClient.showToast({
              directory: ctx.directory,
              title: payload.title,
              message: payload.message,
              variant: payload.variant === "neutral" ? "info" : payload.variant
            })
          }
        }
      },
      promptClient: {
        tui: {
          appendPrompt: async (payload) => {
            await ctx.tuiClient.appendPrompt({
              directory: ctx.directory,
              text: payload.content
            })
          }
        }
      },
      config: {
        channelMode: "toast-only",
        verbosity: "low",
        promptProfile: "minimal"
      }
    })

    sessionRuntimes.set(sessionKey, {
      hudState: nextState,
      coexistenceState: transition.coexistenceState
    })
  }

  return {
    event: async (input) => {
      const parsed = parseIncomingEvent(input.event)
      if (parsed.kind !== "accepted") {
        return
      }

      if (parsed.event.type !== "event") {
        return
      }

      const nowMs = parsed.event.ts ?? Date.now()
      await dispatchReducerEvent(
        toSessionKey(parsed.event.sessionId),
        {
          type: "event",
          name: parsed.event.name,
          ts: parsed.event.ts
        },
        nowMs
      )
    },

    "tool.execute.before": async (input) => {
      const nowMs = Date.now()
      await dispatchReducerEvent(
        toSessionKey(input.sessionID),
        {
          type: "tool.execute.before",
          toolName: input.tool,
          ts: nowMs
        },
        nowMs
      )
    },

    "tool.execute.after": async (input, output) => {
      const nowMs = Date.now()
      await dispatchReducerEvent(
        toSessionKey(input.sessionID),
        {
          type: "tool.execute.after",
          toolName: input.tool,
          ok: inferToolResult({ output: output.output, metadata: output.metadata }),
          ts: nowMs
        },
        nowMs
      )
    }
  }
}

export const OpenCodeStatusHudPlugin: Plugin = async (ctx) => {
  return createHudPluginHooks({
    directory: ctx.directory,
    tuiClient: {
      showToast: (parameters) => {
        const body: {
          title?: string
          message: string
          variant: "info" | "success" | "warning" | "error"
          duration?: number
        } = {
          message: parameters?.message ?? "",
          variant: parameters?.variant ?? "info"
        }
        if (parameters?.title !== undefined) {
          body.title = parameters.title
        }
        if (parameters?.duration !== undefined) {
          body.duration = parameters.duration
        }

        const query: { directory?: string } = {}
        if (parameters?.directory !== undefined) {
          query.directory = parameters.directory
        }

        return ctx.client.tui.showToast({ body, query })
      },
      appendPrompt: (parameters) => {
        const body: { text: string } = {
          text: parameters?.text ?? ""
        }

        const query: { directory?: string } = {}
        if (parameters?.directory !== undefined) {
          query.directory = parameters.directory
        }

        return ctx.client.tui.appendPrompt({ body, query })
      }
    }
  })
}

export default OpenCodeStatusHudPlugin
