import type { HudProfile } from "../config/index.js"
import {
  createInitialPromptFallbackState,
  emitPromptOnStateTransition,
  type AppendPromptClient,
  type PromptFallbackState
} from "./prompt-fallback.js"
import {
  createInitialPublisherState,
  dispatchOptionalPublisher,
  type HudPublisherClient,
  type HudPublisherConfig,
  type HudPublisherState
} from "./publisher.js"
import type { HudState } from "./reducer.js"

export type HudVerbosity = "low" | "normal" | "high"

export interface CoexistenceConfig {
  verbosity: HudVerbosity
  promptProfile: HudProfile
}

export interface CoexistenceRuntimeState {
  promptState: PromptFallbackState
  publisherState: HudPublisherState
}

const DEFAULT_COEXISTENCE_CONFIG: CoexistenceConfig = {
  verbosity: "low",
  promptProfile: "minimal"
}

const PROMPT_TUNING_BY_VERBOSITY: Record<
  HudVerbosity,
  { cooldownMs: number; maxEmitsPerWindow: number; windowMs: number }
> = {
  low: { cooldownMs: 2000, maxEmitsPerWindow: 2, windowMs: 1000 },
  normal: { cooldownMs: 1000, maxEmitsPerWindow: 3, windowMs: 1000 },
  high: { cooldownMs: 500, maxEmitsPerWindow: 4, windowMs: 1000 }
}

export function createInitialCoexistenceState(nowMs = 0): CoexistenceRuntimeState {
  return {
    promptState: createInitialPromptFallbackState(nowMs),
    publisherState: createInitialPublisherState(nowMs)
  }
}

function resolvePromptTuning(verbosity: HudVerbosity, promptProfile: HudProfile) {
  const base = PROMPT_TUNING_BY_VERBOSITY[verbosity] ?? PROMPT_TUNING_BY_VERBOSITY.low
  return {
    profile: promptProfile,
    ...base
  }
}

export async function dispatchHudTransition(params: {
  previousState: HudState | null
  nextState: HudState
  coexistenceState: CoexistenceRuntimeState
  nowMs: number
  promptClient?: AppendPromptClient
  publisherClient?: HudPublisherClient
  publisherConfig?: Partial<HudPublisherConfig>
  config?: Partial<CoexistenceConfig>
}): Promise<{
  coexistenceState: CoexistenceRuntimeState
  emitted: { prompt: boolean; publisher: boolean }
}> {
  const config: CoexistenceConfig = {
    ...DEFAULT_COEXISTENCE_CONFIG,
    ...params.config
  }

  let nextRuntimeState = params.coexistenceState
  let promptEmitted = false
  let publisherEmitted = false

  if (params.promptClient) {
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

  const publisherParams: Parameters<typeof dispatchOptionalPublisher>[0] = {
    previousState: params.previousState,
    nextState: params.nextState,
    publisherState: nextRuntimeState.publisherState,
    nowMs: params.nowMs,
    publisherClient: params.publisherClient,
    config: params.publisherConfig
  }

  const publisherResult = await dispatchOptionalPublisher(publisherParams)
  nextRuntimeState = {
    ...nextRuntimeState,
    publisherState: publisherResult.publisherState
  }
  publisherEmitted = publisherResult.emitted

  return {
    coexistenceState: nextRuntimeState,
    emitted: {
      prompt: promptEmitted,
      publisher: publisherEmitted
    }
  }
}
