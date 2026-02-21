export interface HudConfig {
  profile: "minimal" | "balanced" | "verbose"
  cooldownMs: number
  maxStateEntries: number
}

export function createDefaultConfig(): HudConfig {
  return {
    profile: "minimal",
    cooldownMs: 1000,
    maxStateEntries: 200
  }
}
