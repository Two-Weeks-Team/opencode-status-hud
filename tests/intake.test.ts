import { describe, expect, it } from "vitest"

import { parseIncomingEvent } from "../src/runtime/intake.js"

describe("parseIncomingEvent", () => {
  it("accepts well-formed tool.execute.before payload", () => {
    const decision = parseIncomingEvent({
      type: "tool.execute.before",
      tool: { name: "bash" },
      session: { id: "ses_1" },
      ts: 1730000000000
    })

    expect(decision.kind).toBe("accepted")
    if (decision.kind === "accepted") {
      expect(decision.event.type).toBe("tool.execute.before")
      if (decision.event.type === "tool.execute.before") {
        expect(decision.event.toolName).toBe("bash")
      }
    }
  })

  it("ignores unknown event types consistently", () => {
    const decision = parseIncomingEvent({ type: "custom.unknown", foo: "bar" })

    expect(decision).toEqual({ kind: "ignored", reason: "unknown_event_type" })
  })

  it("ignores malformed required payload shape", () => {
    const decision = parseIncomingEvent({
      type: "tool.execute.before",
      tool: null
    })

    expect(decision).toEqual({ kind: "ignored", reason: "invalid_tool_execute_before_shape" })
  })

  it("never throws for invalid payload inputs", () => {
    const inputs: unknown[] = [null, 42, "bad", [], { type: 123 }, { type: "event" }]

    for (const value of inputs) {
      expect(() => parseIncomingEvent(value)).not.toThrow()
      const decision = parseIncomingEvent(value)
      expect(decision.kind).toBe("ignored")
    }
  })
})
