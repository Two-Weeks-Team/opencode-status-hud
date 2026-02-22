import type { HudProfile } from "../config/index.js"
import {
  createInitialEmitControllerState,
  emitToastOnStateTransition,
  type EmitControllerState,
  type ShowToastClient
} from "./emit-controller.js"
import {
  createInitialPromptFallbackState,
  emitPromptOnStateTransition,
  type AppendPromptClient,
  type PromptFallbackState
} from "./prompt-fallback.js"
import type { HudState } from "./reducer.js"

export type HudChannelMode = "toast-only" | "prompt-only" | "both"
export type HudVerbosity = "low" | "normal" | "high"

export interface CoexistenceConfig {
  channelMode: HudChannelMode
  verbosity: HudVerbosity
  promptProfile: HudProfile
}

export interface CoexistenceRuntimeState {
  toastState: EmitControllerState
  promptState: PromptFallbackState
}

const DEFAULT_COEXISTENCE_CONFIG: CoexistenceConfig = {
  channelMode: "toast-only",
  verbosity: "low",
  promptProfile: "minimal"
}

export function createInitialCoexistenceState(nowMs = 0): CoexistenceRuntimeState {
  return {
    toastState: createInitialEmitControllerState(nowMs),
    promptState: createInitialPromptFallbackState(nowMs)
  }
}

function resolveToastTuning(verbosity: HudVerbosity) {
  switch (verbosity) {
    case "high":
      return { cooldownMs: 0, maxEmitsPerWindow: 5, windowMs: 1000 }
    case "normal":
      return { cooldownMs: 500, maxEmitsPerWindow: 3, windowMs: 1000 }
    case "low":
      return { cooldownMs: 1000, maxEmitsPerWindow: 2, windowMs: 1000 }
  }
}

function resolvePromptTuning(verbosity: HudVerbosity, promptProfile: HudProfile) {
  switch (verbosity) {
    case "high":
      return { profile: promptProfile, cooldownMs: 500, maxEmitsPerWindow: 4, windowMs: 1000 }
    case "normal":
      return { profile: promptProfile, cooldownMs: 1000, maxEmitsPerWindow: 3, windowMs: 1000 }
    case "low":
      return { profile: promptProfile, cooldownMs: 2000, maxEmitsPerWindow: 2, windowMs: 1000 }
  }
}

export async function dispatchHudTransition(params: {
  previousState: HudState | null
  nextState: HudState
  coexistenceState: CoexistenceRuntimeState
  nowMs: number
  toastClient?: ShowToastClient
  promptClient?: AppendPromptClient
  config?: Partial<CoexistenceConfig>
}): Promise<{
  coexistenceState: CoexistenceRuntimeState
  emitted: { toast: boolean; prompt: boolean }
}> {
  const config: CoexistenceConfig = {
    ...DEFAULT_COEXISTENCE_CONFIG,
    ...params.config
  }

  let nextRuntimeState = params.coexistenceState
  let toastEmitted = false
  let promptEmitted = false

  const allowToast = config.channelMode === "toast-only" || config.channelMode === "both"
  const allowPrompt = config.channelMode === "prompt-only" || config.channelMode === "both"

  if (allowToast && params.toastClient) {
    const toastResult = await emitToastOnStateTransition({
      previousState: params.previousState,
      nextState: params.nextState,
      controllerState: nextRuntimeState.toastState,
      nowMs: params.nowMs,
      client: params.toastClient,
      config: resolveToastTuning(config.verbosity)
    })

    nextRuntimeState = {
      ...nextRuntimeState,
      toastState: toastResult.controllerState
    }
    toastEmitted = toastResult.emitted
  }

  if (allowPrompt && params.promptClient) {
    const promptResult = await emitPromptOnStateTransition({
      previousState: params.previousState,
      nextState: params.nextState,
      fallbackState: nextRuntimeState.promptState,
      nowMs: params.nowMs,
      client: params.promptClient,
      config: resolvePromptTuning(config.verbosity, config.promptProfile)
    })

    nextRuntimeState = {
      ...nextRuntimeState,
      promptState: promptResult.fallbackState
    }
    promptEmitted = promptResult.emitted
  }

  return {
    coexistenceState: nextRuntimeState,
    emitted: {
      toast: toastEmitted,
      prompt: promptEmitted
    }
  }
}
