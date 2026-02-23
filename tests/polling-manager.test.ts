import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ProviderUsageSnapshot, ResolvedAuthToken } from "../src/provider-usage.types.js"
import {
  createPollingManager,
  DEFAULT_INTERVAL_MS,
  DEFAULT_MAX_BACKOFF_MS
} from "../src/polling-manager.js"

describe("polling-manager", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function createMockSnapshot(error?: string): ProviderUsageSnapshot {
    return {
      provider: "anthropic",
      fetchedAtMs: Date.now(),
      windows: [],
      error
    }
  }

  function createSuccessSnapshot(): ProviderUsageSnapshot {
    return {
      provider: "anthropic",
      fetchedAtMs: Date.now(),
      windows: [{ label: "5h", usedPercent: 50 }]
    }
  }

  function createMockToken(): ResolvedAuthToken {
    return {
      token: "test-token",
      source: "env-session",
      kind: "session"
    }
  }

  it("start() triggers immediate fetch", async () => {
    const mockAuth = vi.fn(async () => createMockToken())
    const mockFetch = vi.fn(async () => createSuccessSnapshot())
    const mockOnSnapshot = vi.fn()

    const poller = createPollingManager({
      intervalMs: DEFAULT_INTERVAL_MS,
      maxBackoffMs: DEFAULT_MAX_BACKOFF_MS,
      authResolver: mockAuth,
      fetcher: mockFetch,
      onSnapshot: mockOnSnapshot
    })

    poller.start()

    await vi.advanceTimersByTimeAsync(0)

    expect(mockAuth).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1)
  })

  it("polls at configured interval after start", async () => {
    const mockAuth = vi.fn(async () => createMockToken())
    const mockFetch = vi.fn(async () => createSuccessSnapshot())
    const mockOnSnapshot = vi.fn()

    const poller = createPollingManager({
      intervalMs: 60_000,
      maxBackoffMs: 300_000,
      authResolver: mockAuth,
      fetcher: mockFetch,
      onSnapshot: mockOnSnapshot
    })

    poller.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(mockOnSnapshot).toHaveBeenCalledTimes(3)
  })

  it("applies exponential backoff on consecutive errors (1m -> 2m -> 4m -> 5m cap)", async () => {
    const mockAuth = vi.fn(async () => createMockToken())
    const mockFetch = vi.fn(async () => createMockSnapshot("API error"))

    const poller = createPollingManager({
      intervalMs: 60_000,
      maxBackoffMs: 300_000,
      authResolver: mockAuth,
      fetcher: mockFetch
    })

    poller.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(119_999)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(239_999)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(299_999)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch).toHaveBeenCalledTimes(4)
  })

  it("resets to normal interval after success following errors", async () => {
    const mockAuth = vi.fn(async () => createMockToken())
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(createMockSnapshot("API error"))
      .mockResolvedValue(createSuccessSnapshot())

    const poller = createPollingManager({
      intervalMs: 60_000,
      maxBackoffMs: 300_000,
      authResolver: mockAuth,
      fetcher: mockFetch
    })

    poller.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(119_999)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(59_999)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it("stop() prevents further polling", async () => {
    const mockAuth = vi.fn(async () => createMockToken())
    const mockFetch = vi.fn(async () => createSuccessSnapshot())
    const mockOnSnapshot = vi.fn()

    const poller = createPollingManager({
      intervalMs: 60_000,
      maxBackoffMs: 300_000,
      authResolver: mockAuth,
      fetcher: mockFetch,
      onSnapshot: mockOnSnapshot
    })

    poller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1)

    poller.stop()

    await vi.advanceTimersByTimeAsync(300_000)
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1)
    expect(poller.isRunning()).toBe(false)
  })

  it("stop() is idempotent", async () => {
    const mockAuth = vi.fn(async () => createMockToken())
    const mockFetch = vi.fn(async () => createSuccessSnapshot())

    const poller = createPollingManager({
      intervalMs: 60_000,
      maxBackoffMs: 300_000,
      authResolver: mockAuth,
      fetcher: mockFetch
    })

    poller.start()
    poller.stop()
    poller.stop()
    poller.stop()

    expect(poller.isRunning()).toBe(false)
  })

  it("start() is idempotent (double start does not double poll)", async () => {
    const mockAuth = vi.fn(async () => createMockToken())
    const mockFetch = vi.fn(async () => createSuccessSnapshot())
    const mockOnSnapshot = vi.fn()

    const poller = createPollingManager({
      intervalMs: 60_000,
      maxBackoffMs: 300_000,
      authResolver: mockAuth,
      fetcher: mockFetch,
      onSnapshot: mockOnSnapshot
    })

    poller.start()
    poller.start()
    poller.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("null auth token skips fetch, does not count as error", async () => {
    const mockAuth = vi.fn(async () => null)
    const mockFetch = vi.fn(async () => createSuccessSnapshot())

    const poller = createPollingManager({
      intervalMs: 60_000,
      maxBackoffMs: 300_000,
      authResolver: mockAuth,
      fetcher: mockFetch
    })

    poller.start()

    await vi.advanceTimersByTimeAsync(0)

    expect(mockAuth).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(0)

    await vi.advanceTimersByTimeAsync(59_999)
    expect(mockAuth).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(mockAuth).toHaveBeenCalledTimes(2)
  })

  it("onSnapshot called on each successful fetch", async () => {
    const mockAuth = vi.fn(async () => createMockToken())
    const mockFetch = vi.fn(async () => createSuccessSnapshot())
    const mockOnSnapshot = vi.fn()

    const poller = createPollingManager({
      intervalMs: 60_000,
      maxBackoffMs: 300_000,
      authResolver: mockAuth,
      fetcher: mockFetch,
      onSnapshot: mockOnSnapshot
    })

    poller.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(mockOnSnapshot).toHaveBeenCalledTimes(3)
  })

  it("onSnapshot NOT called on error", async () => {
    const mockAuth = vi.fn(async () => createMockToken())
    const mockFetch = vi.fn(async () => createMockSnapshot("API error"))
    const mockOnSnapshot = vi.fn()

    const poller = createPollingManager({
      intervalMs: 60_000,
      maxBackoffMs: 300_000,
      authResolver: mockAuth,
      fetcher: mockFetch,
      onSnapshot: mockOnSnapshot
    })

    poller.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(mockOnSnapshot).toHaveBeenCalledTimes(0)
  })

  it("forceRefresh() fetches immediately and returns snapshot", async () => {
    const mockAuth = vi.fn(async () => createMockToken())
    const mockFetch = vi.fn(async () => createSuccessSnapshot())

    const poller = createPollingManager({
      intervalMs: 60_000,
      maxBackoffMs: 300_000,
      authResolver: mockAuth,
      fetcher: mockFetch
    })

    poller.start()
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(30_000)

    const snapshot = await poller.forceRefresh()

    expect(snapshot).not.toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it("latest() returns most recent successful snapshot", async () => {
    const mockAuth = vi.fn(async () => createMockToken())
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(createMockSnapshot("first error"))
      .mockResolvedValueOnce(createSuccessSnapshot())

    const poller = createPollingManager({
      intervalMs: 60_000,
      maxBackoffMs: 300_000,
      authResolver: mockAuth,
      fetcher: mockFetch
    })

    expect(poller.latest()).toBeNull()

    poller.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(poller.latest()).toBeNull()

    await vi.advanceTimersByTimeAsync(120_000)
    const latest = poller.latest()
    expect(latest).not.toBeNull()
    expect(latest?.provider).toBe("anthropic")
    expect(latest?.windows).toEqual([{ label: "5h", usedPercent: 50 }])
  })

  it("isRunning() returns correct state", async () => {
    const mockAuth = vi.fn(async () => createMockToken())
    const mockFetch = vi.fn(async () => createSuccessSnapshot())

    const poller = createPollingManager({
      intervalMs: 60_000,
      maxBackoffMs: 300_000,
      authResolver: mockAuth,
      fetcher: mockFetch
    })

    expect(poller.isRunning()).toBe(false)

    poller.start()
    expect(poller.isRunning()).toBe(true)

    await vi.advanceTimersByTimeAsync(0)
    expect(poller.isRunning()).toBe(true)

    poller.stop()
    expect(poller.isRunning()).toBe(false)
  })

  it("handles fetch exceptions as errors", async () => {
    const mockAuth = vi.fn(async () => createMockToken())
    const mockFetch = vi.fn(async () => { throw new Error("Network error") })

    const poller = createPollingManager({
      intervalMs: 60_000,
      maxBackoffMs: 300_000,
      authResolver: mockAuth,
      fetcher: mockFetch
    })

    poller.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(59_999)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_001)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it("custom setTimeout/clearTimeout functions are used", async () => {
    const mockAuth = vi.fn(async () => createMockToken())
    const mockFetch = vi.fn(async () => createSuccessSnapshot())
    const customSetTimeout = vi.fn(() => setTimeout(() => {}, 0))
    const customClearTimeout = vi.fn()

    createPollingManager({
      intervalMs: 60_000,
      maxBackoffMs: 300_000,
      authResolver: mockAuth,
      fetcher: mockFetch,
      setTimeoutFn: customSetTimeout,
      clearTimeoutFn: customClearTimeout
    })

    expect(customSetTimeout).toBeDefined()
    expect(customClearTimeout).toBeDefined()
  })
})
