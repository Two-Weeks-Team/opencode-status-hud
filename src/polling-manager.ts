/**
 * Polling Manager with Exponential Backoff
 *
 * Periodically polls provider usage API with automatic backoff on errors.
 * Uses setTimeout pattern (not setInterval) to handle dynamic interval changes
 * and prevent overlapping ticks.
 */

import type { ResolvedAuthToken, ProviderUsageSnapshot } from "./provider-usage.types.js"

/** Default polling interval: 1 minute */
export const DEFAULT_INTERVAL_MS = 60_000

/** Default maximum backoff: 5 minutes */
export const DEFAULT_MAX_BACKOFF_MS = 300_000

/** Options for creating a PollingManager */
export interface PollingManagerOptions {
  /** Base interval between polls in milliseconds */
  intervalMs?: number | undefined
  /** Maximum backoff interval in milliseconds */
  maxBackoffMs?: number | undefined
  /** Function to resolve authentication token */
  authResolver: () => Promise<ResolvedAuthToken | null>
  /** Function to fetch usage snapshot */
  fetcher: (token: ResolvedAuthToken) => Promise<ProviderUsageSnapshot>
  /** Optional callback for successful snapshots */
  onSnapshot?: ((snapshot: ProviderUsageSnapshot) => void) | undefined
  /** Custom setTimeout function for DI/testing */
  setTimeoutFn?: ((cb: () => void, ms: number) => ReturnType<typeof setTimeout>) | undefined
  /** Custom clearTimeout function for DI/testing */
  clearTimeoutFn?: ((handle: ReturnType<typeof setTimeout>) => void) | undefined
}

/** Polling manager interface */
export interface PollingManager {
  /** Start polling (idempotent) */
  start(): void
  /** Stop polling */
  stop(): void
  /** Get the latest successful snapshot */
  latest(): ProviderUsageSnapshot | null
  /** Force immediate refresh */
  forceRefresh(): Promise<ProviderUsageSnapshot | null>
  /** Check if polling is active */
  isRunning(): boolean
}

/**
 * Create a polling manager with exponential backoff.
 *
 * Uses setTimeout + reschedule pattern (not setInterval) to support:
 * - Dynamic interval changes due to backoff
 * - Prevention of overlapping ticks when fetch takes longer than interval
 */
export function createPollingManager(options: PollingManagerOptions): PollingManager {
  const effectiveIntervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS

  const setTimeoutFn = options.setTimeoutFn ?? setTimeout
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout

  // Internal state
  let running = false
  let latestSnapshot: ProviderUsageSnapshot | null = null
  let timerHandle: ReturnType<typeof setTimeout> | null = null
  let currentIntervalMs = effectiveIntervalMs
  let consecutiveErrors = 0

  /**
   * Execute a single polling tick.
   * Handles auth resolution, fetching, and error/backoff logic.
   */
  async function tick(): Promise<void> {
    try {
      const token = await options.authResolver()

      // Skip cycle if no token available - don't count as error
      if (token === null) {
        return
      }

      const snapshot = await options.fetcher(token)

      if (snapshot.error !== undefined) {
        // Increment error count and apply backoff
        consecutiveErrors += 1
        const backoffMs = Math.min(maxBackoffMs, effectiveIntervalMs * 2 ** consecutiveErrors)
        currentIntervalMs = backoffMs
      } else {
        // Success - reset state
        consecutiveErrors = 0
        currentIntervalMs = effectiveIntervalMs
        latestSnapshot = snapshot
        options.onSnapshot?.(snapshot)
      }
    } catch {
      // Treat exceptions as errors
      consecutiveErrors += 1
      const backoffMs = Math.min(maxBackoffMs, effectiveIntervalMs * 2 ** consecutiveErrors)
      currentIntervalMs = backoffMs
    }
  }

  /**
   * Schedule the next tick.
   * Uses setTimeout with unref to prevent blocking Node exit.
   */
  function scheduleNext(): void {
    if (!running) {
      return
    }

    timerHandle = setTimeoutFn(() => {
      tick().then(() => {
        scheduleNext()
      }).catch(() => {
        scheduleNext()  // Ensure polling continues even on error
      })
    }, currentIntervalMs)

    // Prevent timer from blocking Node process exit
    timerHandle?.unref?.()
  }

  return {
    start(): void {
      if (running) {
        return // Idempotent
      }

      running = true

      // Immediate first fetch, then schedule next
      tick().then(() => {
        scheduleNext()
      }).catch(() => {
        scheduleNext()
      })
    },

    stop(): void {
      running = false

      if (timerHandle !== null) {
        clearTimeoutFn(timerHandle)
        timerHandle = null
      }
    },

    latest(): ProviderUsageSnapshot | null {
      return latestSnapshot
    },

    async forceRefresh(): Promise<ProviderUsageSnapshot | null> {
      // Cancel pending timer
      if (timerHandle !== null) {
        clearTimeoutFn(timerHandle)
        timerHandle = null
      }

      await tick()

      // Resume cycle if still running
      if (running) {
        scheduleNext()
      }

      return latestSnapshot
    },

    isRunning(): boolean {
      return running
    }
  }
}
