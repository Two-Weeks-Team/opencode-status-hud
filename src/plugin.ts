import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin"

import { createModelRegistry, type ModelRegistry, type ProviderListResponse, type ChatParamsModel, type ChatParamsProviderCtx } from "./model-registry.js"
import { resolveMessageCost, type TokenBreakdown } from "./cost-calculator.js"
import { createUsageAggregator, type UsageAggregator, type AggregatorClient } from "./usage-aggregator.js"
import { createDiskCache, type DiskCache, type DiskCacheData } from "./disk-cache.js"

import type { ProviderUsageSnapshot, ProviderKey } from "./provider-usage.types.js"
import { resolveAuthToken } from "./auth-resolver.js"
import { fetchClaudeUsage } from "./fetch-claude.js"
import { createPollingManager, type PollingManager } from "./polling-manager.js"
import { resolveOpenAIAuthToken } from "./auth-resolver-openai.js"
import { fetchOpenAIUsage } from "./fetch-openai.js"
import type { ResolvedOpenAIAuthToken } from "./provider-usage.types.js"
import {
  createInitialCoexistenceState,
  type HudChannelMode,
  type HudVerbosity,
  type CoexistenceRuntimeState,
  dispatchHudTransition
} from "./runtime/coexistence.js"
import { createInitialHudState, reduceHudState, type HudReducerEvent, type HudState } from "./runtime/reducer.js"
import type { HudProfile } from "./config/index.js"

type HudPluginHooks = Pick<Hooks, "event" | "chat.params" | "tool.execute.before" | "tool.execute.after" | "experimental.text.complete">

interface HudPluginTuiClient {
  showToast: (parameters?: {
    directory?: string
    title?: string
    message?: string
    variant?: "info" | "success" | "warning" | "error"
    duration?: number
  }) => unknown
  appendPrompt: (parameters?: {
    directory?: string
    text?: string
  }) => unknown
}

export interface HudPluginContext {
  directory: string
  tuiClient: HudPluginTuiClient
  client?: PluginInput["client"]
}

interface SessionRuntime {
  hudState: HudState
  coexistenceState: CoexistenceRuntimeState
  seenAssistantMessages: Set<string>
  lastUsagePrompt: string | null
  usageByMessageID: Map<string, MessageUsageInfo>
  outputAugmentedMessages: Set<string>
  lastCompletedUsage: MessageUsageInfo | null
}

export interface MessageUsageInfo {
  providerID: string
  modelID: string
  mode: string
  cost: number
  contextUsedTokens: number
  contextLimitTokens: number
  tokens: {
    input: number
    output: number
    reasoning: number
    cache: { read: number; write: number }
  }
}

export interface UsageSample {
  messageID: string
  sessionKey: string
  completedMs: number
  contextUsedTokens: number
  cost: number
}

type UsageDisplayMode = "toast" | "prompt" | "output" | "both" | "output+toast" | "all"

interface HudRuntimeConfig {
  channelMode: HudChannelMode
  verbosity: HudVerbosity
  promptProfile: HudProfile
  usageDisplay: UsageDisplayMode
  usagePromptIntervalMs: number
}

interface IntervalHandle {
  unref?: () => void
}

interface HudPluginRuntimeOptions {
  setIntervalFn?: (callback: () => void, intervalMs: number) => IntervalHandle
  pollingManagerOverride?: PollingManager | undefined
}

const DEFAULT_RUNTIME_CONFIG: HudRuntimeConfig = {
  channelMode: "toast-only",
  verbosity: "normal",
  promptProfile: "minimal",
  usageDisplay: "output",
  usagePromptIntervalMs: 10000
}

const SESSION_FALLBACK_KEY = "__global__"
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000


const ENV_CHANNEL_MODE = "OPENCODE_STATUS_HUD_CHANNEL_MODE"
const ENV_VERBOSITY = "OPENCODE_STATUS_HUD_VERBOSITY"
const ENV_PROMPT_PROFILE = "OPENCODE_STATUS_HUD_PROMPT_PROFILE"
const ENV_USAGE_DISPLAY = "OPENCODE_STATUS_HUD_USAGE_DISPLAY"
const ENV_USAGE_PROMPT_INTERVAL_MS = "OPENCODE_STATUS_HUD_USAGE_PROMPT_INTERVAL_MS"

function toSessionKey(sessionID: string | null | undefined): string {
  return sessionID ?? SESSION_FALLBACK_KEY
}

function parseChannelMode(value: string | undefined): HudChannelMode | null {
  if (value === "toast-only" || value === "prompt-only" || value === "both") {
    return value
  }

  return null
}

function parseVerbosity(value: string | undefined): HudVerbosity | null {
  if (value === "low" || value === "normal" || value === "high") {
    return value
  }

  return null
}

function parsePromptProfile(value: string | undefined): HudProfile | null {
  if (value === "minimal" || value === "balanced" || value === "verbose") {
    return value
  }

  return null
}

function parseUsageDisplay(value: string | undefined): UsageDisplayMode | null {
  if (
    value === "toast" ||
    value === "prompt" ||
    value === "output" ||
    value === "both" ||
    value === "output+toast" ||
    value === "all"
  ) {
    return value
  }

  return null
}

function usageWantsToast(mode: UsageDisplayMode): boolean {
  return mode === "toast" || mode === "both" || mode === "output+toast" || mode === "all"
}

function usageWantsPrompt(mode: UsageDisplayMode): boolean {
  return mode === "prompt" || mode === "both" || mode === "all"
}

function usageWantsOutput(mode: UsageDisplayMode): boolean {
  return mode === "output" || mode === "output+toast" || mode === "all"
}

function parseUsagePromptIntervalMs(value: string | undefined): number | null {
  if (value === undefined) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return null
  }

  if (parsed === 0 || parsed >= 1000) {
    return parsed
  }

  return null
}

/**
 * Resolve which provider key to use for API usage data based on providerID and modelID.
 * Returns null if provider is unknown or doesn't have a usage API.
 */
function resolveProviderKey(providerID: string, modelID: string): ProviderKey | null {
  const lowerProvider = providerID.toLowerCase()
  const lowerModel = modelID.toLowerCase()

  // Anthropic models
  if (lowerProvider.includes("anthropic") || lowerModel.includes("claude") || lowerModel.includes("opus") || lowerModel.includes("sonnet") || lowerModel.includes("haiku")) {
    return "anthropic"
  }

  // OpenAI models
  if (lowerProvider.includes("openai") || lowerModel.includes("gpt") || lowerModel.includes("codex") || lowerModel.includes("o1") || lowerModel.includes("o3") || lowerModel.includes("o4")) {
    return "openai"
  }

  return null
}

function resolveContextUsedTokens(tokens: { total?: number; input: number; output: number; reasoning: number }): number {
  const total = asFiniteNumber(tokens.total ?? 0)
  if (total > 0) {
    return Math.max(0, Math.trunc(total))
  }

  const fallback = asFiniteNumber(tokens.input) + asFiniteNumber(tokens.output) + asFiniteNumber(tokens.reasoning)
  return Math.max(0, Math.trunc(fallback))
}

function formatCompactTokens(value: number): string {
  const safe = Math.max(0, Math.trunc(asFiniteNumber(value)))

  if (safe >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(safe >= 10_000_000 ? 0 : 1)}M`
  }

  if (safe >= 1_000) {
    return `${Math.round(safe / 1_000)}K`
  }

  return `${safe}`
}

function formatDurationCompact(durationMs: number): string {
  const clamped = Math.max(0, Math.trunc(asFiniteNumber(durationMs)))
  const totalMinutes = Math.floor(clamped / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours <= 0) {
    return `${minutes}m`
  }

  return `${hours}h ${minutes}m`
}

function formatDurationCompactDays(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000))
  const totalHours = Math.floor(totalMinutes / 60)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days > 0) return `${days}d ${hours}h`
  if (totalHours > 0) return `${totalHours}h ${totalMinutes % 60}m`
  return `${totalMinutes}m`
}

/**
 * Format resets_at for 5h window: within 24h shows duration, >24h shows weekday.
 */
function formatResetsAtCompact(resetAtMs: number | undefined, nowMs: number): string {
  if (resetAtMs === undefined) return "?"
  const diff = resetAtMs - nowMs
  if (diff <= 0) return "now"
  if (diff < 24 * 60 * 60 * 1000) {
    return formatDurationCompact(diff)
  }
  return formatWeekdayTime(resetAtMs)
}

/**
 * Format resets_at for 7d window: always weekday + time.
 */
function formatResetsAt7d(resetAtMs: number | undefined): string {
  if (resetAtMs === undefined) return "?"
  return formatWeekdayTime(resetAtMs)
}

/**
 * Format epoch ms as "Mon 14:00" in local timezone.
 */
function formatWeekdayTime(epochMs: number): string {
  const date = new Date(epochMs)
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const dayName = days[date.getDay()] ?? "???"
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${dayName} ${hours}:${minutes}`
}

function formatPercent(value: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(asFiniteNumber(value))))
  return `${clamped}%`
}

function buildProgressBar(percent: number, theme?: ModelTheme | undefined): string {
  const clamped = Math.max(0, Math.min(100, asFiniteNumber(percent)))
  const width = 12
  const filled = Math.max(0, Math.min(width, Math.round((clamped / 100) * width)))
  const filledStr = "█".repeat(filled)
  const emptyStr = "░".repeat(width - filled)

  if (theme) {
    return `${theme.ansiColor}${filledStr}${theme.ansiReset}${emptyStr}`
  }
  return `${filledStr}${emptyStr}`
}

function summarizeModelLabel(modelID: string): string {
  const lower = modelID.toLowerCase()
  if (lower.includes("claude-opus")) {
    return "Opus"
  }
  if (lower.includes("claude-sonnet")) {
    return "Sonnet"
  }
  if (lower.includes("claude-haiku")) {
    return "Haiku"
  }
  if (lower.includes("gpt-5")) {
    return "GPT-5"
  }
  if (lower.includes("gemini")) {
    return "Gemini"
  }

  const lastSegment = modelID.split("/").at(-1) ?? modelID
  return truncateLabel(lastSegment, 18)
}

interface ModelTheme {
  emoji: string     // Colored circle emoji
  ansiColor: string // ANSI escape code for color (e.g., "\x1b[35m" for magenta)
  ansiReset: string // "\x1b[39m" — resets foreground only, preserves dim/bold
}

/**
 * Reset foreground color only (\x1b[39m).
 *
 * Using \x1b[0m would reset ALL attributes including the outer dim wrapper
 * (\x1b[2m), causing text after the progress bar to appear at full brightness.
 */
const ANSI_RESET = "\x1b[39m"

function resolveModelTheme(modelID: string): ModelTheme {
  const lower = modelID.toLowerCase()

  if (lower.includes("claude-opus") || lower.includes("opus")) {
    return { emoji: "\uD83D\uDFE3", ansiColor: "\x1b[35m", ansiReset: ANSI_RESET }  // 🟣 purple/magenta
  }
  if (lower.includes("claude-sonnet") || lower.includes("sonnet")) {
    return { emoji: "\uD83D\uDFE0", ansiColor: "\x1b[33m", ansiReset: ANSI_RESET }  // 🟠 orange/yellow
  }
  if (lower.includes("claude-haiku") || lower.includes("haiku")) {
    return { emoji: "\uD83D\uDFE2", ansiColor: "\x1b[32m", ansiReset: ANSI_RESET }  // 🟢 green
  }
  if (lower.includes("gpt-5") || lower.includes("gpt-4") || lower.includes("openai")) {
    return { emoji: "\uD83D\uDFE1", ansiColor: "\x1b[33m", ansiReset: ANSI_RESET }  // 🟡 yellow
  }
  if (lower.includes("gemini") || lower.includes("google")) {
    return { emoji: "\uD83D\uDD35", ansiColor: "\x1b[36m", ansiReset: ANSI_RESET }  // 🔵 cyan
  }
  if (lower.includes("deepseek")) {
    return { emoji: "\uD83D\uDFE4", ansiColor: "\x1b[34m", ansiReset: ANSI_RESET }  // 🟤 blue (brown emoji)
  }
  // Default: white circle
  return { emoji: "\u26AA", ansiColor: "\x1b[37m", ansiReset: ANSI_RESET }  // ⚪ white/default
}

function resolveAgentTheme(agentName: string): ModelTheme | null {
  const lower = agentName.toLowerCase()
  if (lower === "sisyphus") return { emoji: "\uD83D\uDD35", ansiColor: "\x1b[36m", ansiReset: ANSI_RESET }    // 🔵 cyan
  if (lower === "hephaestus") return { emoji: "\uD83D\uDFE0", ansiColor: "\x1b[33m", ansiReset: ANSI_RESET }  // 🟠 orange/yellow
  if (lower === "prometheus") return { emoji: "\uD83D\uDD34", ansiColor: "\x1b[31m", ansiReset: ANSI_RESET }  // 🔴 red
  if (lower === "atlas") return { emoji: "\uD83D\uDFE2", ansiColor: "\x1b[32m", ansiReset: ANSI_RESET }       // 🟢 green
  if (lower === "build") return { emoji: "\uD83D\uDD35", ansiColor: "\x1b[34m", ansiReset: ANSI_RESET }       // 🔵 blue
  if (lower === "plan") return { emoji: "\uD83D\uDFE1", ansiColor: "\x1b[33m", ansiReset: ANSI_RESET }        // 🟡 yellow
  return null
}

function resolveRuntimeConfig(env: NodeJS.ProcessEnv = process.env): HudRuntimeConfig {
  const channelMode = parseChannelMode(env[ENV_CHANNEL_MODE])
  const verbosity = parseVerbosity(env[ENV_VERBOSITY])
  const promptProfile = parsePromptProfile(env[ENV_PROMPT_PROFILE])
  const usageDisplay = parseUsageDisplay(env[ENV_USAGE_DISPLAY])
  const usagePromptIntervalMs = parseUsagePromptIntervalMs(env[ENV_USAGE_PROMPT_INTERVAL_MS])

  return {
    channelMode: channelMode ?? DEFAULT_RUNTIME_CONFIG.channelMode,
    verbosity: verbosity ?? DEFAULT_RUNTIME_CONFIG.verbosity,
    promptProfile: promptProfile ?? DEFAULT_RUNTIME_CONFIG.promptProfile,
    usageDisplay: usageDisplay ?? DEFAULT_RUNTIME_CONFIG.usageDisplay,
    usagePromptIntervalMs: usagePromptIntervalMs ?? DEFAULT_RUNTIME_CONFIG.usagePromptIntervalMs
  }
}

function inferToolResult(output: { output: string; metadata: unknown }): boolean | null {
  if (typeof output.metadata === "object" && output.metadata !== null) {
    const maybeOk = (output.metadata as Record<string, unknown>).ok
    if (typeof maybeOk === "boolean") {
      return maybeOk
    }
  }

  const lower = output.output.toLowerCase()
  if (lower.includes("error:") || lower.includes("failed") || lower.includes("exception")) {
    return false
  }

  if (output.output.trim().length === 0) {
    return null
  }

  return true
}

function asFiniteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function truncateLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`
}

function formatCostCompact(cost: number): string {
  return `$${Math.max(0, asFiniteNumber(cost)).toFixed(2)}`
}

function buildAssistantUsageToast(input: {
  modelID: string
  tokens: {
    input: number
    output: number
    reasoning: number
  }
  cost: number
}): { title: string; message: string; variant: "info" } {
  const model = truncateLabel(input.modelID, 28)
  const inputTokens = Math.max(0, Math.trunc(asFiniteNumber(input.tokens.input)))
  const outputTokens = Math.max(0, Math.trunc(asFiniteNumber(input.tokens.output)))
  const reasoningTokens = Math.max(0, Math.trunc(asFiniteNumber(input.tokens.reasoning)))
  const cost = Math.max(0, asFiniteNumber(input.cost))

  return {
    title: "HUD Usage",
    message: `${model} in:${inputTokens} out:${outputTokens} rsn:${reasoningTokens} cost:${formatCost(cost)}`,
    variant: "info"
  }
}

export function buildAssistantUsageLine(input: {
  sessionKey: string
  providerID: string
  modelID: string
  contextUsedTokens: number
  contextLimitTokens: number
  usageSamples: UsageSample[]
  nowMs: number
  apiUsage?: ProviderUsageSnapshot | null | undefined
  agentName?: string | undefined
}): string {
  const contextLimit = Math.max(1, Math.trunc(asFiniteNumber(input.contextLimitTokens)))
  const contextUsed = Math.max(0, Math.trunc(asFiniteNumber(input.contextUsedTokens)))
  const contextPercent = (contextUsed / contextLimit) * 100
  const modelLabel = summarizeModelLabel(input.modelID)
  const agentTheme = input.agentName !== undefined ? resolveAgentTheme(input.agentName) : null
  const theme = agentTheme ?? resolveModelTheme(input.modelID)

  const lowerBound5h = input.nowMs - FIVE_HOURS_MS
  const lowerBound7d = input.nowMs - SEVEN_DAYS_MS

  const samples5h = input.usageSamples.filter((sample) => sample.completedMs >= lowerBound5h)
  const samples7d = input.usageSamples.filter((sample) => sample.completedMs >= lowerBound7d)

  const oldest5h = samples5h.reduce<number | null>((oldest, sample) => {
    if (oldest === null || sample.completedMs < oldest) {
      return sample.completedMs
    }

    return oldest
  }, null)

  const oldest7d = samples7d.reduce<number | null>((oldest, sample) => {
    if (oldest === null || sample.completedMs < oldest) return sample.completedMs
    return oldest
  }, null)

  const windowRemainingMs = oldest5h === null ? FIVE_HOURS_MS : Math.max(0, FIVE_HOURS_MS - (input.nowMs - oldest5h))
  const windowRemaining7dMs = oldest7d === null ? SEVEN_DAYS_MS : Math.max(0, SEVEN_DAYS_MS - (input.nowMs - oldest7d))
  const sessionSamples = input.usageSamples.filter((sample) => sample.sessionKey === input.sessionKey)
  const sessionCost = sessionSamples.reduce((accumulator, sample) => accumulator + sample.cost, 0)

  const warningIndicator = contextPercent >= 90 ? " ✖" : contextPercent >= 75 ? " ⚠" : ""

  const WINDOWS_PER_FIVE_HOURS = 5
  const totalContext5h = samples5h.reduce((sum, sample) => sum + sample.contextUsedTokens, 0)
  const denominator5h = contextLimit * WINDOWS_PER_FIVE_HOURS
  const approxPercent5h = denominator5h > 0 ? Math.min(100, Math.round((totalContext5h / denominator5h) * 100)) : 0

  const WINDOWS_PER_SEVEN_DAYS = 45
  const totalContext7d = samples7d.reduce((sum, sample) => sum + sample.contextUsedTokens, 0)
  const denominator7d = contextLimit * WINDOWS_PER_SEVEN_DAYS
  const approxPercent7d = denominator7d > 0 ? Math.min(100, Math.round((totalContext7d / denominator7d) * 100)) : 0

  // If apiUsage is available and has no error, use real API data
  if (input.apiUsage && !input.apiUsage.error) {
    const window5h = input.apiUsage.windows.find((w) => w.label === "5h")
    const window7d = input.apiUsage.windows.find((w) => w.label === "7d")

    const seg5h = window5h
      ? `5h: ${window5h.usedPercent}% (${formatResetsAtCompact(window5h.resetAtMs, input.nowMs)})`
      : `5h: ~${approxPercent5h}% (${formatDurationCompact(windowRemainingMs)})`

    const seg7d = window7d
      ? `7d: ${window7d.usedPercent}% (${formatResetsAt7d(window7d.resetAtMs)})`
      : `7d: ~${approxPercent7d}% (${formatDurationCompactDays(windowRemaining7dMs)})`

    return [
      `${theme.emoji} ${modelLabel}`,
      buildProgressBar(contextPercent, theme),
      `${formatPercent(contextPercent)}${warningIndicator}`,
      `${formatCompactTokens(contextUsed)}/${formatCompactTokens(contextLimit)}`,
      formatCostCompact(sessionCost),
      seg5h,
      seg7d
    ].join(" | ")
  }

  // Fallback: self-calculated approximations
  return [
    `${theme.emoji} ${modelLabel}`,
    buildProgressBar(contextPercent, theme),
    `${formatPercent(contextPercent)}${warningIndicator}`,
    `${formatCompactTokens(contextUsed)}/${formatCompactTokens(contextLimit)}`,
    formatCostCompact(sessionCost),
    `5h: ~${approxPercent5h}% (${formatDurationCompact(windowRemainingMs)})`,
    `7d: ~${approxPercent7d}% (${formatDurationCompactDays(windowRemaining7dMs)})`
  ].join(" | ")
}

function appendUsageLineToOutputText(text: string, usageLine: string): string {
  // Check raw content (without dim wrapper)
  if (text.includes(usageLine)) {
    return text
  }

  const dimLine = `\x1b[2m${usageLine}\x1b[22m`
  const base = text.trimEnd()
  if (base.length === 0) {
    return dimLine
  }

  return `${base}\n\n${dimLine}`
}

export function createHudPluginHooks(
  ctx: HudPluginContext,
  runtimeConfig: HudRuntimeConfig = resolveRuntimeConfig(),
  runtimeOptions: HudPluginRuntimeOptions = {}
): HudPluginHooks {
  const sessionRuntimes = new Map<string, SessionRuntime>()
  const sessionAgentMap = new Map<string, string>()
  let latestSessionKey: string | null = null

  const registry = createModelRegistry()
  const aggregator = createUsageAggregator()
  const diskCache = createDiskCache()

  // Cache snapshots per provider for immediate display
  const cachedApiSnapshots: Partial<Record<ProviderKey, ProviderUsageSnapshot>> = {}

  // Phase 1: Load disk cache immediately (instant strip on restart)
  diskCache.load().then(cached => {
    if (cached) {
      aggregator.fromJSON(cached.samples)
      registry.restore(cached.modelRegistry)
      if (cached.providerUsages) {
        for (const [key, snapshot] of Object.entries(cached.providerUsages)) {
          if (snapshot !== undefined) {
            cachedApiSnapshots[key as ProviderKey] = snapshot
          }
        }
      }
    }
  }).catch(() => { /* ignore cache load failure */ })

  // Shared cache save helper
  function buildProviderUsagesForCache(): Partial<Record<ProviderKey, ProviderUsageSnapshot>> {
    const usages: Partial<Record<ProviderKey, ProviderUsageSnapshot>> = {}
    const anthropicSnapshot = anthropicPoller.latest() ?? cachedApiSnapshots.anthropic
    const openaiSnapshot = openaiPoller.latest() ?? cachedApiSnapshots.openai
    if (anthropicSnapshot !== undefined) usages.anthropic = anthropicSnapshot
    if (openaiSnapshot !== undefined) usages.openai = openaiSnapshot
    return usages
  }

  function saveCacheDebounced(): void {
    diskCache.save({
      version: 3,
      lastFetchMs: Date.now(),
      samples: aggregator.toJSON(),
      modelRegistry: registry.snapshot(),
      providerUsages: buildProviderUsagesForCache()
    }).catch(() => {})
  }

  // Helper to get snapshot for a provider
  function getProviderSnapshot(providerKey: ProviderKey | null): ProviderUsageSnapshot | null {
    if (providerKey === "anthropic") {
      return anthropicPoller.latest() ?? cachedApiSnapshots.anthropic ?? null
    }
    if (providerKey === "openai") {
      return openaiPoller.latest() ?? cachedApiSnapshots.openai ?? null
    }
    return null
  }

  // Anthropic poller
  const anthropicPoller = runtimeOptions.pollingManagerOverride ?? createPollingManager({
    intervalMs: 60_000,
    maxBackoffMs: 300_000,
    authResolver: () => resolveAuthToken(undefined),
    fetcher: (token) => fetchClaudeUsage({ token }),
    onSnapshot: () => {
      saveCacheDebounced()
    }
  })

  // OpenAI poller — uses closure to pass the real token type
  let latestOpenAIToken: ResolvedOpenAIAuthToken | null = null

  const openaiPoller = createPollingManager({
    intervalMs: 60_000,
    maxBackoffMs: 300_000,
    authResolver: async () => {
      const token = await resolveOpenAIAuthToken()
      latestOpenAIToken = token
      if (token === null) return null
      return { token: token.accessToken, source: "env-oauth" as const, kind: "oauth" as const }
    },
    fetcher: async () => {
      if (latestOpenAIToken === null) {
        return { provider: "openai" as const, fetchedAtMs: Date.now(), windows: [], error: "no token" }
      }
      return fetchOpenAIUsage({ token: latestOpenAIToken })
    },
    onSnapshot: () => {
      saveCacheDebounced()
    }
  })

  // Start polling (non-blocking) if not using override
  if (!runtimeOptions.pollingManagerOverride) {
    anthropicPoller.start()
  }
  openaiPoller.start()

  // Phase 2: Fetch from local SDK (background, non-blocking)
  if (ctx.client) {
    // Populate model registry from provider list
    ctx.client.provider.list({ query: { directory: ctx.directory } }).then(res => {
      if (res.data) {
        registry.populateFromProviderList(res.data as unknown as ProviderListResponse)
      }
    }).catch(() => { /* provider list unavailable */ })

    // Load historical usage
    const sdkClient: AggregatorClient = {
      async sessionList(dir) {
        const res = await ctx.client!.session.list({ query: { directory: dir } })
        if (res.error || !res.data) return []
        return res.data.map(s => ({ id: s.id, time: { created: s.time.created, updated: s.time.updated } }))
      },
      async sessionMessages(sessionID, dir) {
        const res = await ctx.client!.session.messages({ path: { id: sessionID }, query: { directory: dir } })
        if (res.error || !res.data) return []
        return res.data.map(m => ({
          info: {
            id: m.info.id,
            sessionID: m.info.sessionID,
            role: m.info.role,
            time: { created: m.info.time.created, completed: (m.info as { time: { completed?: number } }).time.completed ?? 0 },
            modelID: (m.info as { modelID: string }).modelID ?? "",
            providerID: (m.info as { providerID: string }).providerID ?? "",
            cost: (m.info as { cost: number }).cost ?? 0,
            tokens: (m.info as { tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } } }).tokens ?? { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
          }
        }))
      }
    }

    aggregator.loadHistorical(sdkClient, ctx.directory, {
      costRatesLookup: (pid, mid) => registry.get(pid, mid)?.cost ?? null
    }).then(count => {
      if (count > 0) {
        saveCacheDebounced()
      }
    }).catch(() => { /* historical load unavailable */ })
  }

  const trimUsageSamples = (nowMs: number): void => {
    aggregator.trim(nowMs)
  }

  const upsertUsageSample = (sample: UsageSample): void => {
    aggregator.upsertSample(sample)
    saveCacheDebounced()
  }

  const buildUsageLineFromMessageUsage = (input: {
    sessionKey: string
    usage: MessageUsageInfo
    nowMs: number
  }): string => {
    trimUsageSamples(input.nowMs)
    const providerKey = resolveProviderKey(input.usage.providerID, input.usage.modelID)
    const agentName = sessionAgentMap.get(input.sessionKey)

    return buildAssistantUsageLine({
      sessionKey: input.sessionKey,
      providerID: input.usage.providerID,
      modelID: input.usage.modelID,
      contextUsedTokens: input.usage.contextUsedTokens,
      contextLimitTokens: input.usage.contextLimitTokens,
      usageSamples: aggregator.allSamples(),
      nowMs: input.nowMs,
      apiUsage: getProviderSnapshot(providerKey),
      agentName
    })
  }

  const fetchMessageUsageFromSession = async (sessionID: string, messageID: string): Promise<MessageUsageInfo | null> => {
    if (!ctx.client) {
      return null
    }

    const response = await ctx.client.session.message({
      path: {
        id: sessionID,
        messageID
      },
      query: {
        directory: ctx.directory
      }
    })

    if (response.error !== undefined || response.data === undefined) {
      return null
    }

    const message = response.data.info
    if (message.role !== "assistant") {
      return null
    }

    const contextUsedTokens = resolveContextUsedTokens(message.tokens)
    const contextLimitTokens = Math.max(registry.resolveContextLimit(message.modelID, message.providerID), contextUsedTokens)

    return {
      providerID: message.providerID,
      modelID: message.modelID,
      mode: message.mode,
      cost: message.cost,
      contextUsedTokens,
      contextLimitTokens,
      tokens: {
        input: asFiniteNumber(message.tokens.input),
        output: asFiniteNumber(message.tokens.output),
        reasoning: asFiniteNumber(message.tokens.reasoning),
        cache: {
          read: asFiniteNumber(message.tokens.cache.read),
          write: asFiniteNumber(message.tokens.cache.write)
        }
      }
    }
  }

  const setIntervalFn = runtimeOptions.setIntervalFn ?? ((callback, intervalMs) => setInterval(callback, intervalMs))

  if (usageWantsPrompt(runtimeConfig.usageDisplay) && runtimeConfig.usagePromptIntervalMs > 0) {
    const heartbeat = setIntervalFn(() => {
      if (!latestSessionKey) {
        return
      }

      const runtime = sessionRuntimes.get(latestSessionKey)
      if (!runtime?.lastUsagePrompt) {
        return
      }

      void ctx.tuiClient.appendPrompt({
        directory: ctx.directory,
        text: runtime.lastUsagePrompt
      })
    }, runtimeConfig.usagePromptIntervalMs)

    if (typeof heartbeat.unref === "function") {
      heartbeat.unref()
    }
  }

  const getOrCreateSessionRuntime = (sessionKey: string, nowMs: number): SessionRuntime => {
    const existing = sessionRuntimes.get(sessionKey)
    if (existing) {
      return existing
    }

    const created: SessionRuntime = {
      hudState: createInitialHudState(),
      coexistenceState: createInitialCoexistenceState(nowMs),
      seenAssistantMessages: new Set<string>(),
      lastUsagePrompt: null,
      usageByMessageID: new Map(),
      outputAugmentedMessages: new Set<string>(),
      lastCompletedUsage: null
    }
    sessionRuntimes.set(sessionKey, created)
    return created
  }

  const dispatchReducerEvent = async (sessionKey: string, event: HudReducerEvent, nowMs: number): Promise<void> => {
    const runtime = getOrCreateSessionRuntime(sessionKey, nowMs)
    latestSessionKey = sessionKey
    const previousState = runtime.hudState
    const nextState = reduceHudState(previousState, event)

    const transition = await dispatchHudTransition({
      previousState,
      nextState,
      coexistenceState: runtime.coexistenceState,
      nowMs,
      toastClient: {
        tui: {
          showToast: async (payload) => {
            await ctx.tuiClient.showToast({
              directory: ctx.directory,
              title: payload.title,
              message: payload.message,
              variant: payload.variant === "neutral" ? "info" : payload.variant,
              duration: 3000
            })
          }
        }
      },
      promptClient: {
        tui: {
          appendPrompt: async (payload) => {
            await ctx.tuiClient.appendPrompt({
              directory: ctx.directory,
              text: payload.content
            })
          }
        }
      },
      config: {
        channelMode: runtimeConfig.channelMode,
        verbosity: runtimeConfig.verbosity,
        promptProfile: runtimeConfig.promptProfile
      }
    })

    sessionRuntimes.set(sessionKey, {
      hudState: nextState,
      coexistenceState: transition.coexistenceState,
      seenAssistantMessages: runtime.seenAssistantMessages,
      lastUsagePrompt: runtime.lastUsagePrompt,
      usageByMessageID: runtime.usageByMessageID,
      outputAugmentedMessages: runtime.outputAugmentedMessages,
      lastCompletedUsage: runtime.lastCompletedUsage
    })
  }

  return {
    event: async (input) => {
      if (input.event.type !== "message.updated") {
        return
      }

      const message = input.event.properties.info
      if (message.role !== "assistant") {
        return
      }

      const nowMs = Date.now()
      const sessionKey = toSessionKey(message.sessionID)
      const runtime = getOrCreateSessionRuntime(sessionKey, nowMs)
      latestSessionKey = sessionKey

      const contextUsedTokens = resolveContextUsedTokens(message.tokens)
      const contextLimitTokens = Math.max(registry.resolveContextLimit(message.modelID, message.providerID), contextUsedTokens)

      runtime.usageByMessageID.set(message.id, {
        providerID: message.providerID,
        modelID: message.modelID,
        mode: message.mode,
        cost: message.cost,
        contextUsedTokens,
        contextLimitTokens,
        tokens: {
          input: asFiniteNumber(message.tokens.input),
          output: asFiniteNumber(message.tokens.output),
          reasoning: asFiniteNumber(message.tokens.reasoning),
          cache: {
            read: asFiniteNumber(message.tokens.cache.read),
            write: asFiniteNumber(message.tokens.cache.write)
          }
        }
      })

      if (typeof message.time.completed !== "number") {
        return
      }

      if (runtime.seenAssistantMessages.has(message.id)) {
        return
      }

      runtime.seenAssistantMessages.add(message.id)

      const completedUsage = runtime.usageByMessageID.get(message.id)
      if (completedUsage && completedUsage.contextUsedTokens > 0) {
        runtime.lastCompletedUsage = completedUsage
      }

      upsertUsageSample({
        messageID: message.id,
        sessionKey,
        completedMs: message.time.completed,
        contextUsedTokens: asFiniteNumber(message.tokens.input) + asFiniteNumber(message.tokens.output) + asFiniteNumber(message.tokens.reasoning),
        cost: resolveMessageCost(
          message.cost,
          { input: message.tokens.input, output: message.tokens.output, reasoning: message.tokens.reasoning, cache: { read: message.tokens.cache.read, write: message.tokens.cache.write } },
          registry.get(message.providerID, message.modelID)?.cost ?? null
        )
      })

      const usage = completedUsage
      if (!usage) {
        return
      }

      const usageLine = buildUsageLineFromMessageUsage({
        sessionKey,
        usage,
        nowMs
      })
      runtime.lastUsagePrompt = usageLine

      if (usageWantsToast(runtimeConfig.usageDisplay)) {
        const usageToast = buildAssistantUsageToast({
          modelID: message.modelID,
          tokens: {
            input: message.tokens.input,
            output: message.tokens.output,
            reasoning: message.tokens.reasoning
          },
          cost: message.cost
        })

        await ctx.tuiClient.showToast({
          directory: ctx.directory,
          title: usageToast.title,
          message: usageToast.message,
          variant: usageToast.variant,
          duration: 6000
        })
      }

      if (usageWantsPrompt(runtimeConfig.usageDisplay)) {
        await ctx.tuiClient.appendPrompt({
          directory: ctx.directory,
          text: usageLine
        })
      }
    },

    "chat.params": async (input) => {
      try {
        if (input.agent && input.sessionID) {
          sessionAgentMap.set(input.sessionID, input.agent)
        }
        if (input.model && input.provider) {
          const model = input.model as unknown as ChatParamsModel
          const provider = input.provider as unknown as ChatParamsProviderCtx
          if (model.id && model.cost && model.limit) {
            registry.updateFromChatParams(model, provider)
          }
        }
      } catch {
        // Silently ignore chat.params errors — registry is best-effort
      }
    },

    "experimental.text.complete": async (input, output) => {
      if (!usageWantsOutput(runtimeConfig.usageDisplay)) {
        return
      }

      const nowMs = Date.now()
      const sessionKey = toSessionKey(input.sessionID)
      const runtime = getOrCreateSessionRuntime(sessionKey, nowMs)

      if (runtime.outputAugmentedMessages.has(input.messageID)) {
        return
      }

      const currentUsage = runtime.usageByMessageID.get(input.messageID) ?? null
      let usage: MessageUsageInfo | null = null

      if (currentUsage !== null && currentUsage.contextUsedTokens > 0) {
        usage = currentUsage
      } else if (runtime.lastCompletedUsage !== null) {
        usage = runtime.lastCompletedUsage
      } else if (currentUsage !== null) {
        usage = currentUsage
      }

      if (usage === null) {
        return
      }

      const incrementalTokens = asFiniteNumber(usage.tokens.input) + asFiniteNumber(usage.tokens.output) + asFiniteNumber(usage.tokens.reasoning)
      if (incrementalTokens > 0 || usage.contextUsedTokens > 0) {
        upsertUsageSample({
          messageID: input.messageID,
          sessionKey,
          completedMs: nowMs,
          contextUsedTokens: incrementalTokens,
          cost: resolveMessageCost(
            usage.cost,
            usage.tokens,
            registry.get(usage.providerID, usage.modelID)?.cost ?? null
          )
        })
      }

      const usageLine = buildUsageLineFromMessageUsage({
        sessionKey,
        usage,
        nowMs
      })
      output.text = appendUsageLineToOutputText(output.text, usageLine)
      runtime.outputAugmentedMessages.add(input.messageID)
      latestSessionKey = sessionKey
    },

    "tool.execute.before": async (input) => {
      const nowMs = Date.now()
      await dispatchReducerEvent(
        toSessionKey(input.sessionID),
        {
          type: "tool.execute.before",
          toolName: input.tool,
          ts: nowMs
        },
        nowMs
      )
    },

    "tool.execute.after": async (input, output) => {
      const nowMs = Date.now()
      await dispatchReducerEvent(
        toSessionKey(input.sessionID),
        {
          type: "tool.execute.after",
          toolName: input.tool,
          ok: inferToolResult({ output: output.output, metadata: output.metadata }),
          ts: nowMs
        },
        nowMs
      )
    }
  }
}

export const OpenCodeStatusHudPlugin: Plugin = async (ctx) => {
  return createHudPluginHooks({
    directory: ctx.directory,
    client: ctx.client,
    tuiClient: {
      showToast: (parameters) => {
        const body: {
          title?: string
          message: string
          variant: "info" | "success" | "warning" | "error"
          duration?: number
        } = {
          message: parameters?.message ?? "",
          variant: parameters?.variant ?? "info"
        }
        if (parameters?.title !== undefined) {
          body.title = parameters.title
        }
        if (parameters?.duration !== undefined) {
          body.duration = parameters.duration
        }

        const query: { directory?: string } = {}
        if (parameters?.directory !== undefined) {
          query.directory = parameters.directory
        }

        return ctx.client.tui.showToast({ body, query })
      },
      appendPrompt: (parameters) => {
        const body: { text: string } = {
          text: parameters?.text ?? ""
        }

        const query: { directory?: string } = {}
        if (parameters?.directory !== undefined) {
          query.directory = parameters.directory
        }

        return ctx.client.tui.appendPrompt({ body, query })
      }
    }
  })
}

export default OpenCodeStatusHudPlugin
