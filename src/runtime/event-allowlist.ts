export const EVENT_ALLOWLIST = {
  required: ["tool.execute.before", "tool.execute.after"],
  supported: ["event"]
} as const

const ALLOWED_EVENT_SET = new Set<string>([...EVENT_ALLOWLIST.required, ...EVENT_ALLOWLIST.supported])

export type RequiredEventType = (typeof EVENT_ALLOWLIST.required)[number]
export type SupportedEventType = (typeof EVENT_ALLOWLIST.supported)[number]
export type AllowedEventType = RequiredEventType | SupportedEventType

export function isAllowedEventType(value: unknown): value is AllowedEventType {
  if (typeof value !== "string") {
    return false
  }

  return ALLOWED_EVENT_SET.has(value)
}
