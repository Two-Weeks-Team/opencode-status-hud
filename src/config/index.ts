export const HUD_PROFILES = ["minimal", "balanced", "verbose"] as const

export type HudProfile = (typeof HUD_PROFILES)[number]

export interface HudConfig {
  profile: HudProfile
  cooldownMs: number
  maxStateEntries: number
}

export function isHudProfile(value: unknown): value is HudProfile {
  return typeof value === "string" && HUD_PROFILES.includes(value as HudProfile)
}

export function createDefaultConfig(): HudConfig {
  return {
    profile: "minimal",
    cooldownMs: 1000,
    maxStateEntries: 200
  }
}
