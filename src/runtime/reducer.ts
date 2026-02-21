export interface HudState {
  activeTool: string | null
  lastStatus: "idle" | "running" | "done" | "error"
  transitions: number
}

export function createInitialHudState(): HudState {
  return {
    activeTool: null,
    lastStatus: "idle",
    transitions: 0
  }
}

export function reduceHudState(
  state: HudState,
  event: { type: "tool.execute.before" | "tool.execute.after"; toolName: string; ok?: boolean }
): HudState {
  if (event.type === "tool.execute.before") {
    return {
      activeTool: event.toolName,
      lastStatus: "running",
      transitions: state.transitions + 1
    }
  }

  return {
    activeTool: null,
    lastStatus: event.ok === false ? "error" : "done",
    transitions: state.transitions + 1
  }
}
