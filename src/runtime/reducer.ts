export type HudStatus = "idle" | "running" | "done" | "error"

export interface HudTransition {
  type: "tool.execute.before" | "tool.execute.after" | "event"
  label: string
  status: HudStatus
  at: number | null
  durationMs: number | null
}

export interface HudState {
  activeTool: string | null
  lastStatus: HudStatus
  lastResult: boolean | null
  lastDurationMs: number | null
  lastTransition: HudTransition | null
  transitions: number
  history: HudTransition[]
  maxHistoryEntries: number
  currentToolStartedAt: number | null
}

export type HudReducerEvent =
  | { type: "tool.execute.before"; toolName: string; ts: number | null }
  | { type: "tool.execute.after"; toolName: string; ok: boolean | null; ts: number | null }
  | { type: "event"; name: string; ts: number | null }

const DEFAULT_MAX_HISTORY_ENTRIES = 200

function appendTransition(
  history: HudTransition[],
  transition: HudTransition,
  maxHistoryEntries: number
): HudTransition[] {
  const next = [...history, transition]
  if (next.length <= maxHistoryEntries) {
    return next
  }

  return next.slice(next.length - maxHistoryEntries)
}

export function createInitialHudState(options?: { maxHistoryEntries?: number }): HudState {
  const maxHistoryEntries = options?.maxHistoryEntries ?? DEFAULT_MAX_HISTORY_ENTRIES

  return {
    activeTool: null,
    lastStatus: "idle",
    lastResult: null,
    lastDurationMs: null,
    lastTransition: null,
    transitions: 0,
    history: [],
    maxHistoryEntries,
    currentToolStartedAt: null
  }
}

function computeDuration(startedAt: number | null, endedAt: number | null): number | null {
  if (startedAt === null || endedAt === null || endedAt < startedAt) {
    return null
  }

  return endedAt - startedAt
}

export function reduceHudState(state: HudState, event: HudReducerEvent): HudState {
  switch (event.type) {
    case "tool.execute.before": {
      const transition: HudTransition = {
        type: event.type,
        label: event.toolName,
        status: "running",
        at: event.ts,
        durationMs: null
      }

      return {
        ...state,
        activeTool: event.toolName,
        lastStatus: "running",
        lastTransition: transition,
        transitions: state.transitions + 1,
        history: appendTransition(state.history, transition, state.maxHistoryEntries),
        currentToolStartedAt: event.ts
      }
    }

    case "tool.execute.after": {
      const durationMs = computeDuration(state.currentToolStartedAt, event.ts)
      const nextStatus: HudStatus = event.ok === false ? "error" : "done"
      const transition: HudTransition = {
        type: event.type,
        label: event.toolName,
        status: nextStatus,
        at: event.ts,
        durationMs
      }

      return {
        ...state,
        activeTool: null,
        lastStatus: nextStatus,
        lastResult: event.ok,
        lastDurationMs: durationMs,
        lastTransition: transition,
        transitions: state.transitions + 1,
        history: appendTransition(state.history, transition, state.maxHistoryEntries),
        currentToolStartedAt: null
      }
    }

    case "event": {
      const transition: HudTransition = {
        type: event.type,
        label: event.name,
        status: state.lastStatus,
        at: event.ts,
        durationMs: null
      }

      return {
        ...state,
        lastTransition: transition,
        transitions: state.transitions + 1,
        history: appendTransition(state.history, transition, state.maxHistoryEntries)
      }
    }
  }
}
