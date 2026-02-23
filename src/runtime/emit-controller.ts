import type { HudState, HudTransition } from "./reducer.js"
import { safeDisplayValue } from "./formatting.js"

export interface ShowToastPayload {
  title: string
  message: string
  variant: "info" | "error" | "neutral"
}

export interface ShowToastClient {
  tui: {
    showToast: (payload: ShowToastPayload) => void | Promise<void>
  }
}

export interface EmitControllerConfig {
  cooldownMs: number
  maxEmitsPerWindow: number
  windowMs: number
}

export interface EmitControllerState {
  lastEmittedAt: number | null
  lastEmittedKey: string | null
  windowStartedAt: number
  emittedInWindow: number
}

const DEFAULT_CONFIG: EmitControllerConfig = {
  cooldownMs: 1000,
  maxEmitsPerWindow: 3,
  windowMs: 1000
}

export function createInitialEmitControllerState(nowMs = 0): EmitControllerState {
  return {
    lastEmittedAt: null,
    lastEmittedKey: null,
    windowStartedAt: nowMs,
    emittedInWindow: 0
  }
}

function isMeaningfulTransition(
  previousTransition: HudTransition | null,
  nextTransition: HudTransition | null
): nextTransition is HudTransition {
  if (!nextTransition) {
    return false
  }

  if (!previousTransition) {
    return true
  }

  return (
    previousTransition.type !== nextTransition.type ||
    previousTransition.label !== nextTransition.label ||
    previousTransition.status !== nextTransition.status ||
    previousTransition.durationMs !== nextTransition.durationMs
  )
}

function buildTransitionKey(transition: HudTransition): string {
  return `${transition.type}|${safeDisplayValue(transition.label, 80)}|${transition.status}|${transition.durationMs ?? "na"}`
}

function formatToastPayload(transition: HudTransition): ShowToastPayload {
  const safeLabel = safeDisplayValue(transition.label, 80)
  const maxMessageLength = 140

  switch (transition.status) {
    case "running":
      return {
        title: "HUD",
        message: safeDisplayValue(`${safeLabel} started`, maxMessageLength),
        variant: "info"
      }
    case "error":
      return {
        title: "HUD",
        message: safeDisplayValue(
          transition.durationMs === null
            ? `${safeLabel} failed`
            : `${safeLabel} failed in ${transition.durationMs}ms`,
          maxMessageLength
        ),
        variant: "error"
      }
    case "done":
      return {
        title: "HUD",
        message: safeDisplayValue(
          transition.durationMs === null
            ? `${safeLabel} completed`
            : `${safeLabel} completed in ${transition.durationMs}ms`,
          maxMessageLength
        ),
        variant: "neutral"
      }
    case "idle":
      return {
        title: "HUD",
        message: safeDisplayValue(`${safeLabel} updated`, maxMessageLength),
        variant: "neutral"
      }
  }
}

function normalizeWindow(
  state: EmitControllerState,
  config: EmitControllerConfig,
  nowMs: number
): EmitControllerState {
  if (nowMs - state.windowStartedAt < config.windowMs) {
    return state
  }

  return {
    ...state,
    windowStartedAt: nowMs,
    emittedInWindow: 0
  }
}

export async function emitToastOnStateTransition(params: {
  previousState: HudState | null
  nextState: HudState
  controllerState: EmitControllerState
  nowMs: number
  client: ShowToastClient
  config?: Partial<EmitControllerConfig>
}): Promise<{ controllerState: EmitControllerState; emitted: boolean; reason?: string }> {
  const config: EmitControllerConfig = {
    ...DEFAULT_CONFIG,
    ...params.config
  }

  const previousTransition = params.previousState?.lastTransition ?? null
  const nextTransition = params.nextState.lastTransition
  if (!isMeaningfulTransition(previousTransition, nextTransition)) {
    return {
      controllerState: params.controllerState,
      emitted: false,
      reason: "not_meaningful_transition"
    }
  }

  const key = buildTransitionKey(nextTransition)
  let normalizedState = normalizeWindow(params.controllerState, config, params.nowMs)

  if (normalizedState.lastEmittedKey === key) {
    return {
      controllerState: normalizedState,
      emitted: false,
      reason: "duplicate_transition"
    }
  }

  if (
    normalizedState.lastEmittedAt !== null &&
    params.nowMs - normalizedState.lastEmittedAt < config.cooldownMs
  ) {
    return {
      controllerState: normalizedState,
      emitted: false,
      reason: "cooldown"
    }
  }

  if (normalizedState.emittedInWindow >= config.maxEmitsPerWindow) {
    return {
      controllerState: normalizedState,
      emitted: false,
      reason: "rate_limited"
    }
  }

  await params.client.tui.showToast(formatToastPayload(nextTransition))

  normalizedState = {
    ...normalizedState,
    lastEmittedAt: params.nowMs,
    lastEmittedKey: key,
    emittedInWindow: normalizedState.emittedInWindow + 1
  }

  return {
    controllerState: normalizedState,
    emitted: true
  }
}
