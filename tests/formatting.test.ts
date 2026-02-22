import { describe, expect, it } from "vitest"

import {
  normalizeDisplayText,
  safeDisplayValue,
  sanitizeDisplayText,
  truncateDisplayText
} from "../src/runtime/formatting.js"

describe("formatting safety utilities", () => {
  it("normalizes whitespace and control characters", () => {
    const normalized = normalizeDisplayText("line1\r\nline2\t\u0007  done")

    expect(normalized).toBe("line1 line2 done")
  })

  it("sanitizes unsafe prompt markup characters", () => {
    const sanitized = sanitizeDisplayText("<script>`drop $all`</script>")

    expect(sanitized).toBe("scriptdrop all/script")
  })

  it("truncates oversized strings with policy suffix", () => {
    const value = truncateDisplayText("x".repeat(200), 16)

    expect(value.length).toBe(16)
    expect(value.endsWith("...")).toBe(true)
  })

  it("handles irregular payload values without corruption", () => {
    const circular: { ref?: unknown } = {}
    circular.ref = circular

    expect(safeDisplayValue({ a: "x".repeat(1000) }, 40).length).toBeLessThanOrEqual(40)
    expect(safeDisplayValue(circular, 40)).toBe("[unserializable value]")
    expect(safeDisplayValue("bad\n<inject>`cmd`", 40)).not.toContain("\n")
  })
})
