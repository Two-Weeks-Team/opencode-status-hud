import { isAllowedEventType } from "./event-allowlist.js"

export interface ToolExecuteBeforeEvent {
  type: "tool.execute.before"
  toolName: string
  sessionId: string | null
  ts: number | null
}

export interface ToolExecuteAfterEvent {
  type: "tool.execute.after"
  toolName: string
  ok: boolean | null
  sessionId: string | null
  ts: number | null
}

export interface SupportedGenericEvent {
  type: "event"
  name: string
  sessionId: string | null
  ts: number | null
}

export type AcceptedEvent = ToolExecuteBeforeEvent | ToolExecuteAfterEvent | SupportedGenericEvent

export type IntakeDecision =
  | { kind: "accepted"; event: AcceptedEvent }
  | { kind: "ignored"; reason: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function parseSessionId(record: Record<string, unknown>): string | null {
  const session = asRecord(record.session)
  return session ? asString(session.id) : null
}

export function parseIncomingEvent(input: unknown): IntakeDecision {
  const record = asRecord(input)
  if (!record) {
    return { kind: "ignored", reason: "payload_not_object" }
  }

  const type = record.type
  if (!isAllowedEventType(type)) {
    return { kind: "ignored", reason: "unknown_event_type" }
  }

  if (type === "tool.execute.before") {
    const tool = asRecord(record.tool)
    const toolName = tool ? asString(tool.name) : null
    if (!toolName) {
      return { kind: "ignored", reason: "invalid_tool_execute_before_shape" }
    }

    return {
      kind: "accepted",
      event: {
        type,
        toolName,
        sessionId: parseSessionId(record),
        ts: asNumber(record.ts)
      }
    }
  }

  if (type === "tool.execute.after") {
    const tool = asRecord(record.tool)
    const toolName = tool ? asString(tool.name) : null
    if (!toolName) {
      return { kind: "ignored", reason: "invalid_tool_execute_after_shape" }
    }

    const result = asRecord(record.result)
    const ok = result && typeof result.ok === "boolean" ? result.ok : null

    return {
      kind: "accepted",
      event: {
        type,
        toolName,
        ok,
        sessionId: parseSessionId(record),
        ts: asNumber(record.ts)
      }
    }
  }

  const name = asString(record.name)
  if (!name) {
    return { kind: "ignored", reason: "invalid_supported_event_shape" }
  }

  return {
    kind: "accepted",
    event: {
      type,
      name,
      sessionId: parseSessionId(record),
      ts: asNumber(record.ts)
    }
  }
}
