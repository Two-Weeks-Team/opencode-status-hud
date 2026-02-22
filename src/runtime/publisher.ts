import type { HudState, HudStatus } from "./reducer.js"

export interface HudPublisherSnapshotV1 {
  version: 1
  sessionId: string | null
  status: HudStatus
  toolName: string | null
  updatedAt: string | null
  message: string | null
}

export interface HudPublisherClient {
  publish: (snapshot: HudPublisherSnapshotV1) => void | Promise<void>
}

export interface HudPublisherConfig {
  enabled: boolean
  cooldownMs: number
  maxPublishesPerWindow: number
  windowMs: number
}

export interface HudPublisherState {
  lastPublishedAt: number | null
  lastPublishedKey: string | null
  windowStartedAt: number
  publishedInWindow: number
}

const DEFAULT_PUBLISHER_CONFIG: HudPublisherConfig = {
  enabled: false,
  cooldownMs: 1000,
  maxPublishesPerWindow: 2,
  windowMs: 1000
}

export function createInitialPublisherState(nowMs = 0): HudPublisherState {
  return {
    lastPublishedAt: null,
    lastPublishedKey: null,
    windowStartedAt: nowMs,
    publishedInWindow: 0
  }
}

function buildSnapshot(state: HudState): HudPublisherSnapshotV1 {
  const updatedAt = state.lastTransition?.at ?? null
  const isoUpdatedAt = updatedAt === null ? null : new Date(updatedAt).toISOString()

  return {
    version: 1,
    sessionId: null,
    status: state.lastStatus,
    toolName: state.activeTool,
    updatedAt: isoUpdatedAt,
    message: state.lastTransition ? `${state.lastTransition.label}:${state.lastTransition.status}` : null
  }
}

function isMeaningful(previousState: HudState | null, nextState: HudState): boolean {
  if (!previousState) {
    return nextState.lastTransition !== null
  }

  const previous = previousState.lastTransition
  const next = nextState.lastTransition
  if (!previous || !next) {
    return previous !== next
  }

  return (
    previous.type !== next.type ||
    previous.label !== next.label ||
    previous.status !== next.status ||
    previous.durationMs !== next.durationMs
  )
}

function normalizeWindow(state: HudPublisherState, config: HudPublisherConfig, nowMs: number): HudPublisherState {
  if (nowMs - state.windowStartedAt < config.windowMs) {
    return state
  }

  return {
    ...state,
    windowStartedAt: nowMs,
    publishedInWindow: 0
  }
}

function buildSnapshotKey(snapshot: HudPublisherSnapshotV1): string {
  return `${snapshot.status}|${snapshot.toolName ?? "na"}|${snapshot.message ?? "na"}|${snapshot.updatedAt ?? "na"}`
}

export async function dispatchOptionalPublisher(params: {
  previousState: HudState | null
  nextState: HudState
  publisherState: HudPublisherState
  nowMs: number
  publisherClient?: HudPublisherClient | undefined
  config?: Partial<HudPublisherConfig> | undefined
}): Promise<{ publisherState: HudPublisherState; emitted: boolean; reason?: string }> {
  const config: HudPublisherConfig = {
    ...DEFAULT_PUBLISHER_CONFIG,
    ...params.config
  }

  let normalized = normalizeWindow(params.publisherState, config, params.nowMs)

  if (!config.enabled) {
    return {
      publisherState: normalized,
      emitted: false,
      reason: "publisher_disabled"
    }
  }

  if (!params.publisherClient) {
    return {
      publisherState: normalized,
      emitted: false,
      reason: "publisher_client_missing"
    }
  }

  if (!isMeaningful(params.previousState, params.nextState)) {
    return {
      publisherState: normalized,
      emitted: false,
      reason: "not_meaningful_transition"
    }
  }

  if (
    normalized.lastPublishedAt !== null &&
    params.nowMs - normalized.lastPublishedAt < config.cooldownMs
  ) {
    return {
      publisherState: normalized,
      emitted: false,
      reason: "cooldown"
    }
  }

  if (normalized.publishedInWindow >= config.maxPublishesPerWindow) {
    return {
      publisherState: normalized,
      emitted: false,
      reason: "rate_limited"
    }
  }

  const snapshot = buildSnapshot(params.nextState)
  const snapshotKey = buildSnapshotKey(snapshot)
  if (normalized.lastPublishedKey === snapshotKey) {
    return {
      publisherState: normalized,
      emitted: false,
      reason: "duplicate"
    }
  }

  try {
    await params.publisherClient.publish(snapshot)
  } catch {
    return {
      publisherState: normalized,
      emitted: false,
      reason: "publish_failed"
    }
  }

  normalized = {
    ...normalized,
    lastPublishedAt: params.nowMs,
    lastPublishedKey: snapshotKey,
    publishedInWindow: normalized.publishedInWindow + 1
  }

  return {
    publisherState: normalized,
    emitted: true
  }
}
