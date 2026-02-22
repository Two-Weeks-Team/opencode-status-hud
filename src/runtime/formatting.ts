export function normalizeDisplayText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\t+/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join(" ")
    .trim()
}

export function sanitizeDisplayText(input: string): string {
  return normalizeDisplayText(input).replace(/[<>`$]/g, "")
}

export function truncateDisplayText(input: string, maxLength: number): string {
  if (maxLength <= 0) {
    return ""
  }

  if (input.length <= maxLength) {
    return input
  }

  if (maxLength <= 3) {
    return ".".repeat(maxLength)
  }

  return `${input.slice(0, maxLength - 3)}...`
}

export function safeDisplayValue(value: unknown, maxLength: number): string {
  let raw: string

  if (typeof value === "string") {
    raw = value
  } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
    raw = String(value)
  } else {
    try {
      raw = JSON.stringify(value)
    } catch {
      raw = "[unserializable value]"
    }
  }

  return truncateDisplayText(sanitizeDisplayText(raw), maxLength)
}
