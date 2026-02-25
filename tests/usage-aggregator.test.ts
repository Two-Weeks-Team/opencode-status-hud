import { describe, expect, it, beforeEach } from "vitest"

import {
  createUsageAggregator,
  type AggregatorClient,
  type UsageAggregator
} from "../src/usage-aggregator.js"

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

describe("UsageAggregator", () => {
  let aggregator: UsageAggregator
  let nowMs: number

  beforeEach(() => {
    aggregator = createUsageAggregator()
    nowMs = Date.now()
  })

  it("starts empty, all aggregates return 0", () => {
    expect(aggregator.allSamples()).toHaveLength(0)
    expect(aggregator.cost5h(nowMs)).toBe(0)
    expect(aggregator.cost7d(nowMs)).toBe(0)
    expect(aggregator.totalCost("session1")).toBe(0)
    expect(aggregator.samples5h(nowMs)).toHaveLength(0)
    expect(aggregator.samples7d(nowMs)).toHaveLength(0)
  })

  it("addSample + allSamples roundtrip", () => {
    const sample = {
      messageID: "msg_1",
      sessionKey: "ses_1",
      completedMs: nowMs - 1000,
      contextUsedTokens: 100,
      cost: 0.05
    }

    aggregator.addSample(sample)
    const samples = aggregator.allSamples()

    expect(samples).toHaveLength(1)
    expect(samples[0]).toEqual(sample)
  })

  it("upsertSample replaces existing by messageID", () => {
    const sample1 = {
      messageID: "msg_1",
      sessionKey: "ses_1",
      completedMs: nowMs - 1000,
      contextUsedTokens: 100,
      cost: 0.05
    }
    const sample2 = {
      messageID: "msg_1",
      sessionKey: "ses_1",
      completedMs: nowMs - 1000,
      contextUsedTokens: 150,
      cost: 0.075
    }

    aggregator.addSample(sample1)
    aggregator.upsertSample(sample2)
    const samples = aggregator.allSamples()

    expect(samples).toHaveLength(1)
    expect(samples[0]?.cost).toBe(0.075)
    expect(samples[0]?.contextUsedTokens).toBe(150)
  })

  it("upsertSample adds new when messageID not found", () => {
    const sample1 = {
      messageID: "msg_1",
      sessionKey: "ses_1",
      completedMs: nowMs - 1000,
      contextUsedTokens: 100,
      cost: 0.05
    }
    const sample2 = {
      messageID: "msg_2",
      sessionKey: "ses_1",
      completedMs: nowMs - 2000,
      contextUsedTokens: 80,
      cost: 0.04
    }

    aggregator.upsertSample(sample1)
    aggregator.upsertSample(sample2)
    const samples = aggregator.allSamples()

    expect(samples).toHaveLength(2)
  })

  it("samples5h filters correctly", () => {
    const sampleInWindow = {
      messageID: "msg_1",
      sessionKey: "ses_1",
      completedMs: nowMs - FIVE_HOURS_MS + 1000,
      contextUsedTokens: 100,
      cost: 0.05
    }
    const sampleAtBoundary = {
      messageID: "msg_2",
      sessionKey: "ses_1",
      completedMs: nowMs - FIVE_HOURS_MS,
      contextUsedTokens: 80,
      cost: 0.04
    }
    const sampleOutsideWindow = {
      messageID: "msg_3",
      sessionKey: "ses_1",
      completedMs: nowMs - FIVE_HOURS_MS - 1000,
      contextUsedTokens: 60,
      cost: 0.03
    }

    aggregator.addSample(sampleInWindow)
    aggregator.addSample(sampleAtBoundary)
    aggregator.addSample(sampleOutsideWindow)

    const samples5h = aggregator.samples5h(nowMs)

    expect(samples5h).toHaveLength(2)
    expect(samples5h.some(s => s.messageID === "msg_1")).toBe(true)
    expect(samples5h.some(s => s.messageID === "msg_2")).toBe(true)
    expect(samples5h.some(s => s.messageID === "msg_3")).toBe(false)
  })

  it("samples7d filters correctly", () => {
    const sampleInWindow = {
      messageID: "msg_1",
      sessionKey: "ses_1",
      completedMs: nowMs - SEVEN_DAYS_MS + 1000,
      contextUsedTokens: 100,
      cost: 0.05
    }
    const sampleAtBoundary = {
      messageID: "msg_2",
      sessionKey: "ses_1",
      completedMs: nowMs - SEVEN_DAYS_MS,
      contextUsedTokens: 80,
      cost: 0.04
    }
    const sampleOutsideWindow = {
      messageID: "msg_3",
      sessionKey: "ses_1",
      completedMs: nowMs - SEVEN_DAYS_MS - 1000,
      contextUsedTokens: 60,
      cost: 0.03
    }

    aggregator.addSample(sampleInWindow)
    aggregator.addSample(sampleAtBoundary)
    aggregator.addSample(sampleOutsideWindow)

    const samples7d = aggregator.samples7d(nowMs)

    expect(samples7d).toHaveLength(2)
    expect(samples7d.some(s => s.messageID === "msg_1")).toBe(true)
    expect(samples7d.some(s => s.messageID === "msg_2")).toBe(true)
    expect(samples7d.some(s => s.messageID === "msg_3")).toBe(false)
  })

  it("cost5h sums costs in 5h window", () => {
    aggregator.addSample({
      messageID: "msg_1",
      sessionKey: "ses_1",
      completedMs: nowMs - FIVE_HOURS_MS + 1000,
      contextUsedTokens: 100,
      cost: 0.05
    })
    aggregator.addSample({
      messageID: "msg_2",
      sessionKey: "ses_1",
      completedMs: nowMs - FIVE_HOURS_MS + 2000,
      contextUsedTokens: 80,
      cost: 0.04
    })
    aggregator.addSample({
      messageID: "msg_3",
      sessionKey: "ses_1",
      completedMs: nowMs - FIVE_HOURS_MS - 1000,
      contextUsedTokens: 60,
      cost: 0.03
    })

    expect(aggregator.cost5h(nowMs)).toBe(0.09)
  })

  it("cost7d sums costs in 7d window", () => {
    aggregator.addSample({
      messageID: "msg_1",
      sessionKey: "ses_1",
      completedMs: nowMs - SEVEN_DAYS_MS + 1000,
      contextUsedTokens: 100,
      cost: 0.05
    })
    aggregator.addSample({
      messageID: "msg_2",
      sessionKey: "ses_1",
      completedMs: nowMs - SEVEN_DAYS_MS + 2000,
      contextUsedTokens: 80,
      cost: 0.04
    })
    aggregator.addSample({
      messageID: "msg_3",
      sessionKey: "ses_1",
      completedMs: nowMs - SEVEN_DAYS_MS - 1000,
      contextUsedTokens: 60,
      cost: 0.03
    })

    expect(aggregator.cost7d(nowMs)).toBe(0.09)
  })

  it("totalCost sums for specific sessionKey", () => {
    aggregator.addSample({
      messageID: "msg_1",
      sessionKey: "ses_1",
      completedMs: nowMs - 1000,
      contextUsedTokens: 100,
      cost: 0.05
    })
    aggregator.addSample({
      messageID: "msg_2",
      sessionKey: "ses_1",
      completedMs: nowMs - 2000,
      contextUsedTokens: 80,
      cost: 0.04
    })
    aggregator.addSample({
      messageID: "msg_3",
      sessionKey: "ses_2",
      completedMs: nowMs - 3000,
      contextUsedTokens: 60,
      cost: 0.03
    })

    expect(aggregator.totalCost("ses_1")).toBe(0.09)
    expect(aggregator.totalCost("ses_2")).toBe(0.03)
    expect(aggregator.totalCost("ses_3")).toBe(0)
  })

  it("windowRemaining5h from oldest sample", () => {
    const oldestMs = nowMs - FIVE_HOURS_MS + 5000
    aggregator.addSample({
      messageID: "msg_1",
      sessionKey: "ses_1",
      completedMs: oldestMs,
      contextUsedTokens: 100,
      cost: 0.05
    })
    aggregator.addSample({
      messageID: "msg_2",
      sessionKey: "ses_1",
      completedMs: nowMs - 1000,
      contextUsedTokens: 80,
      cost: 0.04
    })

    const remaining = aggregator.windowRemaining5h(nowMs)

    expect(remaining).toBe(5000)
  })

  it("windowRemaining5h returns full 5h when no samples", () => {
    expect(aggregator.windowRemaining5h(nowMs)).toBe(FIVE_HOURS_MS)
  })

  it("windowRemaining7d from oldest sample", () => {
    const oldestMs = nowMs - SEVEN_DAYS_MS + 10_000
    aggregator.addSample({
      messageID: "msg_1",
      sessionKey: "ses_1",
      completedMs: oldestMs,
      contextUsedTokens: 100,
      cost: 0.05
    })
    aggregator.addSample({
      messageID: "msg_2",
      sessionKey: "ses_1",
      completedMs: nowMs - 1000,
      contextUsedTokens: 80,
      cost: 0.04
    })

    const remaining = aggregator.windowRemaining7d(nowMs)

    expect(remaining).toBe(10_000)
  })

  it("windowRemaining7d returns full 7d when no samples", () => {
    expect(aggregator.windowRemaining7d(nowMs)).toBe(SEVEN_DAYS_MS)
  })

  it("trim evicts samples older than 7d", () => {
    const sampleToKeep = {
      messageID: "msg_1",
      sessionKey: "ses_1",
      completedMs: nowMs - SEVEN_DAYS_MS + 1000,
      contextUsedTokens: 100,
      cost: 0.05
    }
    const sampleToEvict = {
      messageID: "msg_2",
      sessionKey: "ses_1",
      completedMs: nowMs - SEVEN_DAYS_MS - 1000,
      contextUsedTokens: 80,
      cost: 0.04
    }

    aggregator.addSample(sampleToKeep)
    aggregator.addSample(sampleToEvict)
    aggregator.trim(nowMs)

    const samples = aggregator.allSamples()
    expect(samples).toHaveLength(1)
    expect(samples[0]?.messageID).toBe("msg_1")
  })

  it("loadHistorical fetches and creates samples from mock client", async () => {
    const mockClient: AggregatorClient = {
      async sessionList() {
        return [
          { id: "ses_1", time: { created: nowMs - 3600_000, updated: nowMs - 1000 } },
          { id: "ses_old", time: { created: nowMs - 8 * 86400_000, updated: nowMs - 8 * 86400_000 } }
        ]
      },
      async sessionMessages(sessionID) {
        if (sessionID === "ses_1") {
          return [
            {
              info: {
                id: "msg_1",
                sessionID: "ses_1",
                role: "assistant",
                time: { created: 1000, completed: 1200 },
                modelID: "gpt-4",
                providerID: "openai",
                cost: 0.05,
                tokens: {
                  input: 100,
                  output: 50,
                  reasoning: 0,
                  cache: { read: 0, write: 0 }
                }
              }
            },
            {
              info: {
                id: "msg_2",
                sessionID: "ses_1",
                role: "user",
                time: { created: 900, completed: 950 },
                modelID: "",
                providerID: "",
                cost: 0,
                tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
              }
            },
            {
              info: {
                id: "msg_3",
                sessionID: "ses_1",
                role: "assistant",
                time: { created: 1300 },
                modelID: "gpt-4",
                providerID: "openai",
                cost: 0.03,
                tokens: {
                  input: 80,
                  output: 30,
                  reasoning: 0,
                  cache: { read: 0, write: 0 }
                }
              }
            }
          ]
        }
        return []
      }
    }

    const count = await aggregator.loadHistorical(mockClient, "/tmp/test")

    expect(count).toBe(1)
    const samples = aggregator.allSamples()
    expect(samples).toHaveLength(1)
    expect(samples[0]?.messageID).toBe("msg_1")
    expect(samples[0]?.cost).toBe(0.05)
    expect(samples[0]?.sessionKey).toBe("ses_1")
  })

  it("toJSON/fromJSON roundtrip", () => {
    const sample1 = {
      messageID: "msg_1",
      sessionKey: "ses_1",
      completedMs: nowMs - 1000,
      contextUsedTokens: 100,
      cost: 0.05
    }
    const sample2 = {
      messageID: "msg_2",
      sessionKey: "ses_2",
      completedMs: nowMs - 2000,
      contextUsedTokens: 80,
      cost: 0.04
    }

    aggregator.addSample(sample1)
    aggregator.addSample(sample2)

    const json = aggregator.toJSON()
    expect(json).toHaveLength(2)
    expect(json[0]).toEqual(sample1)
    expect(json[1]).toEqual(sample2)

    const newAggregator = createUsageAggregator()
    newAggregator.fromJSON(json)

    expect(newAggregator.allSamples()).toHaveLength(2)
    expect(newAggregator.allSamples()[0]).toEqual(sample1)
    expect(newAggregator.allSamples()[1]).toEqual(sample2)
  })

  it("fromJSON merges samples with existing (upsert behavior)", () => {
    const oldSample = {
      messageID: "old_msg",
      sessionKey: "ses_old",
      completedMs: nowMs - 5000,
      contextUsedTokens: 50,
      cost: 0.02
    }
    aggregator.addSample(oldSample)

    const newSamples = [
      {
        messageID: "new_msg",
        sessionKey: "ses_new",
        completedMs: nowMs - 1000,
        contextUsedTokens: 100,
        cost: 0.05
      }
    ]

    aggregator.fromJSON(newSamples)

    const samples = aggregator.allSamples()
    expect(samples).toHaveLength(2)
    expect(samples.map((s) => s.messageID).sort()).toEqual(["new_msg", "old_msg"])
  })

  it("loadHistorical uses since option to filter sessions", async () => {
    const mockClient: AggregatorClient = {
      async sessionList() {
        return [
          { id: "ses_recent", time: { created: nowMs - 3600_000, updated: nowMs - 1000 } },
          { id: "ses_old", time: { created: nowMs - 10 * 86400_000, updated: nowMs - 10 * 86400_000 } }
        ]
      },
      async sessionMessages(sessionID) {
        if (sessionID === "ses_recent") {
          return [
            {
              info: {
                id: "msg_recent",
                sessionID: "ses_recent",
                role: "assistant",
                time: { created: 1000, completed: 1200 },
                modelID: "gpt-4",
                providerID: "openai",
                cost: 0.05,
                tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } }
              }
            }
          ]
        }
        return []
      }
    }

    const sinceMs = nowMs - 5 * 86400_000
    const count = await aggregator.loadHistorical(mockClient, "/tmp/test", { since: sinceMs })

    expect(count).toBe(1)
    const samples = aggregator.allSamples()
    expect(samples).toHaveLength(1)
    expect(samples[0]?.sessionKey).toBe("ses_recent")
  })

  it("loadHistorical uses costRatesLookup when provided", async () => {
    const mockClient: AggregatorClient = {
      async sessionList() {
        return [
          { id: "ses_1", time: { created: nowMs - 3600_000, updated: nowMs - 1000 } }
        ]
      },
      async sessionMessages(sessionID) {
        if (sessionID === "ses_1") {
          return [
            {
              info: {
                id: "msg_1",
                sessionID: "ses_1",
                role: "assistant",
                time: { created: 1000, completed: 1200 },
                modelID: "gpt-4",
                providerID: "openai",
                cost: 0,
                tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } }
              }
            }
          ]
        }
        return []
      }
    }

    const costRatesLookup = () => ({
      input: 0.00001,
      output: 0.00002,
      cacheRead: 0,
      cacheWrite: 0
    })

    const count = await aggregator.loadHistorical(mockClient, "/tmp/test", { costRatesLookup })

    expect(count).toBe(1)
    const samples = aggregator.allSamples()
    expect(samples).toHaveLength(1)
    expect(samples[0]?.cost).toBe(100 * 0.00001 + 50 * 0.00002)
  })

  it("allSamples returns copy of array not reference", () => {
    const sample = {
      messageID: "msg_1",
      sessionKey: "ses_1",
      completedMs: nowMs - 1000,
      contextUsedTokens: 100,
      cost: 0.05
    }

    aggregator.addSample(sample)
    const samples = aggregator.allSamples()

    samples.push({
      messageID: "msg_2",
      sessionKey: "ses_1",
      completedMs: nowMs - 2000,
      contextUsedTokens: 80,
      cost: 0.04
    })

    expect(aggregator.allSamples()).toHaveLength(1)
  })
})
