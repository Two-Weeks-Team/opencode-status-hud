import type { HudProfile } from "../config/index.js"
import type { HudState, HudTransition } from "./reducer.js"
import { safeDisplayValue, truncateDisplayText } from "./formatting.js"

export interface AppendPromptPayload {
  content: string
}

export interface AppendPromptClient {
  tui: {
    appendPrompt: (payload: AppendPromptPayload) => void | Promise<void>
  }
}

export interface PromptFallbackConfig {
  profile: HudProfile
  cooldownMs: number
  maxEmitsPerWindow: number
  windowMs: number
  maxPromptLength: number
}

export interface PromptFallbackState {
  lastEmittedAt: number | null
  lastEmittedKey: string | null
  windowStartedAt: number
  emittedInWindow: number
}

const DEFAULT_CONFIG: PromptFallbackConfig = {
  profile: "minimal",
  cooldownMs: 2000,
  maxEmitsPerWindow: 2,
  windowMs: 1000,
  maxPromptLength: 120
}

export function createInitialPromptFallbackState(nowMs = 0): PromptFallbackState {
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

function supportsStatus(profile: HudProfile, status: HudTransition["status"]): boolean {
  if (profile === "verbose") {
    return true
  }

  if (profile === "balanced") {
    return status === "running" || status === "done" || status === "error"
  }

  return status === "done" || status === "error"
}

function buildTransitionKey(transition: HudTransition): string {
  return `${transition.type}|${safeDisplayValue(transition.label, 80)}|${transition.status}|${transition.durationMs ?? "na"}`
}

function formatPromptContent(transition: HudTransition, maxPromptLength: number): string {
  const safeLabel = safeDisplayValue(transition.label, 80)
  const duration = transition.durationMs === null ? "" : ` duration=${transition.durationMs}ms`
  const base = `[HUD] ${safeLabel} status=${transition.status}${duration}`
  return truncateDisplayText(base, maxPromptLength)
}

function normalizeWindow(
  state: PromptFallbackState,
  config: PromptFallbackConfig,
  nowMs: number
): PromptFallbackState {
  if (nowMs - state.windowStartedAt < config.windowMs) {
    return state
  }

  return {
    ...state,
    windowStartedAt: nowMs,
    emittedInWindow: 0
  }
}

export async function emitPromptOnStateTransition(params: {
  previousState: HudState | null
  nextState: HudState
  fallbackState: PromptFallbackState
  nowMs: number
  client: AppendPromptClient
  config?: Partial<PromptFallbackConfig>
}): Promise<{ fallbackState: PromptFallbackState; emitted: boolean; reason?: string }> {
  const config: PromptFallbackConfig = {
    ...DEFAULT_CONFIG,
    ...params.config
  }

  const previousTransition = params.previousState?.lastTransition ?? null
  const nextTransition = params.nextState.lastTransition
  if (!isMeaningfulTransition(previousTransition, nextTransition)) {
    return {
      fallbackState: params.fallbackState,
      emitted: false,
      reason: "not_meaningful_transition"
    }
  }

  if (!supportsStatus(config.profile, nextTransition.status)) {
    return {
      fallbackState: params.fallbackState,
      emitted: false,
      reason: "profile_filtered"
    }
  }

  const key = buildTransitionKey(nextTransition)
  let normalizedState = normalizeWindow(params.fallbackState, config, params.nowMs)

  if (normalizedState.lastEmittedKey === key) {
    return {
      fallbackState: normalizedState,
      emitted: false,
      reason: "duplicate_transition"
    }
  }

  if (
    normalizedState.lastEmittedAt !== null &&
    params.nowMs - normalizedState.lastEmittedAt < config.cooldownMs
  ) {
    return {
      fallbackState: normalizedState,
      emitted: false,
      reason: "cooldown"
    }
  }

  if (normalizedState.emittedInWindow >= config.maxEmitsPerWindow) {
    return {
      fallbackState: normalizedState,
      emitted: false,
      reason: "rate_limited"
    }
  }

  await params.client.tui.appendPrompt({
    content: formatPromptContent(nextTransition, config.maxPromptLength)
  })

  normalizedState = {
    ...normalizedState,
    lastEmittedAt: params.nowMs,
    lastEmittedKey: key,
    emittedInWindow: normalizedState.emittedInWindow + 1
  }

  return {
    fallbackState: normalizedState,
    emitted: true
  }
}
