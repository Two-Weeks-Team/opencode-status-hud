import type { UsageSample } from "./plugin.js"
import type { CostRates } from "./cost-calculator.js"
import { resolveMessageCost } from "./cost-calculator.js"

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export interface AggregatorClient {
  sessionList(directory: string): Promise<SessionListItem[]>
  sessionMessages(sessionID: string, directory: string): Promise<SessionMessageItem[]>
}

export interface SessionListItem {
  id: string
  time: { created: number; updated: number }
}

export interface SessionMessageItem {
  info: {
    id: string
    sessionID: string
    role: string
    time: { created: number; completed?: number }
    modelID: string
    providerID: string
    cost: number
    tokens: {
      input: number; output: number; reasoning: number
      cache: { read: number; write: number }
    }
  }
}

export interface UsageAggregator {
  addSample(sample: UsageSample): void
  upsertSample(sample: UsageSample): void
  allSamples(): UsageSample[]
  samples5h(nowMs: number): UsageSample[]
  samples7d(nowMs: number): UsageSample[]
  totalCost(sessionKey: string): number
  cost5h(nowMs: number): number
  cost7d(nowMs: number): number
  windowRemaining5h(nowMs: number): number
  windowRemaining7d(nowMs: number): number
  trim(nowMs: number): void
  loadHistorical(client: AggregatorClient, directory: string, opts?: {
    since?: number
    costRatesLookup?: (providerID: string, modelID: string) => CostRates | null
  }): Promise<number>
  toJSON(): UsageSample[]
  fromJSON(samples: UsageSample[]): void
}

interface TokenBreakdown {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}

export function createUsageAggregator(): UsageAggregator {
  const samples: UsageSample[] = []

  function addSample(sample: UsageSample): void {
    samples.push(sample)
  }

  function upsertSample(sample: UsageSample): void {
    const index = samples.findIndex((item) => item.messageID === sample.messageID)
    if (index >= 0) {
      samples[index] = sample
      return
    }
    samples.push(sample)
  }

  function allSamples(): UsageSample[] {
    return [...samples]
  }

  function samples5h(nowMs: number): UsageSample[] {
    const lowerBound = nowMs - FIVE_HOURS_MS
    return samples.filter((sample) => sample.completedMs >= lowerBound)
  }

  function samples7d(nowMs: number): UsageSample[] {
    const lowerBound = nowMs - SEVEN_DAYS_MS
    return samples.filter((sample) => sample.completedMs >= lowerBound)
  }

  function totalCost(sessionKey: string): number {
    return samples
      .filter((sample) => sample.sessionKey === sessionKey)
      .reduce((sum, sample) => sum + sample.cost, 0)
  }

  function cost5h(nowMs: number): number {
    return samples5h(nowMs).reduce((sum, sample) => sum + sample.cost, 0)
  }

  function cost7d(nowMs: number): number {
    return samples7d(nowMs).reduce((sum, sample) => sum + sample.cost, 0)
  }

  function windowRemaining5h(nowMs: number): number {
    const lowerBound = nowMs - FIVE_HOURS_MS
    const samplesInWindow = samples.filter((sample) => sample.completedMs >= lowerBound)

    if (samplesInWindow.length === 0) {
      return FIVE_HOURS_MS
    }

    const oldest = samplesInWindow.reduce<number>((oldestMs, sample) => {
      return sample.completedMs < oldestMs ? sample.completedMs : oldestMs
    }, samplesInWindow[0]?.completedMs ?? nowMs)

    return Math.max(0, FIVE_HOURS_MS - (nowMs - oldest))
  }

  function windowRemaining7d(nowMs: number): number {
    const lowerBound = nowMs - SEVEN_DAYS_MS
    const samplesInWindow = samples.filter((sample) => sample.completedMs >= lowerBound)

    if (samplesInWindow.length === 0) {
      return SEVEN_DAYS_MS
    }

    const oldest = samplesInWindow.reduce<number>((oldestMs, sample) => {
      return sample.completedMs < oldestMs ? sample.completedMs : oldestMs
    }, samplesInWindow[0]?.completedMs ?? nowMs)

    return Math.max(0, SEVEN_DAYS_MS - (nowMs - oldest))
  }

  function trim(nowMs: number): void {
    const lowerBound = nowMs - SEVEN_DAYS_MS
    for (let index = samples.length - 1; index >= 0; index -= 1) {
      const sample = samples[index]
      if (!sample || sample.completedMs < lowerBound) {
        samples.splice(index, 1)
      }
    }
  }

  async function loadHistorical(
    client: AggregatorClient,
    directory: string,
    opts?: {
      since?: number
      costRatesLookup?: (providerID: string, modelID: string) => CostRates | null
    }
  ): Promise<number> {
    const since = opts?.since
    const costRatesLookup = opts?.costRatesLookup
    const now = Date.now()

    const sessionList = await client.sessionList(directory)

    const sessionsToProcess = sessionList.filter((session) => {
      const cutoff = since ?? now - SEVEN_DAYS_MS
      return session.time.updated >= cutoff
    })

    let newSampleCount = 0

    for (const session of sessionsToProcess) {
      const messages = await client.sessionMessages(session.id, directory)

      for (const message of messages) {
        const info = message.info

        if (info.role !== "assistant") {
          continue
        }

        if (typeof info.time.completed !== "number") {
          continue
        }

        let cost = info.cost
        if (cost === 0 && costRatesLookup !== undefined) {
          const rates = costRatesLookup(info.providerID, info.modelID)
          if (rates !== null) {
            cost = resolveMessageCost(
              info.cost,
              info.tokens as TokenBreakdown,
              rates,
              undefined
            )
          }
        }

        upsertSample({
          messageID: info.id,
          sessionKey: info.sessionID,
          completedMs: info.time.completed,
          contextUsedTokens: info.tokens.input + info.tokens.output + info.tokens.reasoning,
          cost
        })

        newSampleCount += 1
      }
    }

    return newSampleCount
  }

  function toJSON(): UsageSample[] {
    return [...samples]
  }

  function fromJSON(data: UsageSample[]): void {
    for (const sample of data) {
      upsertSample(sample)
    }
  }

  return {
    addSample,
    upsertSample,
    allSamples,
    samples5h,
    samples7d,
    totalCost,
    cost5h,
    cost7d,
    windowRemaining5h,
    windowRemaining7d,
    trim,
    loadHistorical,
    toJSON,
    fromJSON
  }
}
