import { afterEach, describe, expect, it } from "vitest"
import { mkdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import type { DiskCacheData } from "../src/disk-cache.js"
import { createDiskCache, defaultCachePath } from "../src/disk-cache.js"

const originalEnv = process.env

describe("disk-cache", () => {
  let testDir: string

  afterEach(async () => {
    process.env = originalEnv

    if (testDir) {
      try {
        await unlink(join(testDir, "cache.json"))
      } catch {
        // ignore
      }
      try {
        await rmdir(testDir, { recursive: true })
      } catch {
        // ignore
      }
    }
  })

  async function createTempDir(): Promise<string> {
    const dir = join(tmpdir(), "opencode-hud-test-" + Math.random().toString(36).slice(2))
    await mkdir(dir, { recursive: true })
    return dir
  }

  it("defaultCachePath uses XDG_CONFIG_HOME", () => {
    process.env = { ...originalEnv, XDG_CONFIG_HOME: "/custom/config" }
    const path = defaultCachePath()
    expect(path).toBe("/custom/config/opencode-status-hud/usage-cache.json")
  })

  it("defaultCachePath falls back to ~/.config", () => {
    delete process.env.XDG_CONFIG_HOME
    const path = defaultCachePath()
    expect(path).toMatch(/\.config\/opencode-status-hud\/usage-cache\.json$/)
  })

  it("load returns null when file does not exist", async () => {
    testDir = await createTempDir()
    const cachePath = join(testDir, "nonexistent-cache.json")
    const cache = createDiskCache({ cachePath })

    const result = await cache.load()
    expect(result).toBeNull()
  })

  it("save + load roundtrip preserves data", async () => {
    testDir = await createTempDir()
    const cachePath = join(testDir, "cache.json")
    const cache = createDiskCache({ cachePath })

    const testData: DiskCacheData = {
      version: 2,
      lastFetchMs: Date.now(),
      samples: [
        {
          messageID: "msg_1",
          sessionKey: "ses_1",
          completedMs: 1000,
          contextUsedTokens: 5000,
          cost: 0.05
        }
      ],
      modelRegistry: [
        {
          providerID: "anthropic",
          modelID: "claude-sonnet-4",
          cost: {
            input: 0.000003,
            output: 0.000015,
            cacheRead: 0.0000003,
            cacheWrite: 0.00000375
          },
          limit: { context: 200000, output: 16384 }
        }
      ],
      providerUsage: undefined
    }

    await cache.save(testData)
    const loaded = await cache.load()

    expect(loaded).toEqual(testData)
  })

  it("save creates parent directory if missing", async () => {
    testDir = await createTempDir()
    const nestedDir = join(testDir, "nested", "deep", "path")
    const cachePath = join(nestedDir, "cache.json")
    const cache = createDiskCache({ cachePath })

    const testData: DiskCacheData = {
      version: 2,
      lastFetchMs: 123456,
      samples: [],
      modelRegistry: [],
      providerUsage: undefined
    }

    await cache.save(testData)
    const loaded = await cache.load()

    expect(loaded).toEqual(testData)
  })

  it("save uses atomic write (tmp + rename)", async () => {
    testDir = await createTempDir()
    const cachePath = join(testDir, "atomic-cache.json")
    const cache = createDiskCache({ cachePath })

    const testData: DiskCacheData = {
      version: 2,
      lastFetchMs: 789012,
      samples: [],
      modelRegistry: [],
      providerUsage: undefined
    }

    await cache.save(testData)

    // Verify the file exists and is valid JSON (atomic write completed)
    const content = await readFile(cachePath, "utf-8")
    const parsed = JSON.parse(content)
    expect(parsed.version).toBe(2)
    expect(parsed.lastFetchMs).toBe(789012)
  })

  it("load returns null for corrupt JSON", async () => {
    testDir = await createTempDir()
    const cachePath = join(testDir, "corrupt.json")

    // Write garbage data
    await mkdir(testDir, { recursive: true })
    await writeFile(cachePath, "{ invalid json garbage }")

    const cache = createDiskCache({ cachePath })
    const result = await cache.load()

    expect(result).toBeNull()
  })

  it("load returns null for wrong version", async () => {
    testDir = await createTempDir()
    const cachePath = join(testDir, "wrong-version.json")

    // Write data with wrong version
    await mkdir(testDir, { recursive: true })
    await writeFile(cachePath, JSON.stringify({ version: 99, lastFetchMs: 123, samples: [], modelRegistry: [] }))

    const cache = createDiskCache({ cachePath })
    const result = await cache.load()

    expect(result).toBeNull()
  })

  it("v1 to v2 migration: load migrates v1 file to v2", async () => {
    testDir = await createTempDir()
    const cachePath = join(testDir, "cache.json")

    // Write raw v1 data manually (not via the typed interface)
    const v1Data = {
      version: 1,
      lastFetchMs: 123456,
      samples: [{ messageID: "msg_1", sessionKey: "ses_1", completedMs: 1000, contextUsedTokens: 5000, cost: 0.05 }],
      modelRegistry: [{ providerID: "anthropic", modelID: "claude-sonnet-4", cost: { input: 0.000003, output: 0.000015, cacheRead: 0.0000003, cacheWrite: 0.00000375 }, limit: { context: 200000, output: 16384 } }]
    }
    await mkdir(testDir, { recursive: true })
    await writeFile(cachePath, JSON.stringify(v1Data))

    const cache = createDiskCache({ cachePath })
    const loaded = await cache.load()

    expect(loaded).not.toBeNull()
    expect(loaded?.version).toBe(2)
    expect(loaded?.providerUsage).toBeUndefined()
    expect(loaded?.lastFetchMs).toBe(123456)
    expect(loaded?.samples).toEqual(v1Data.samples)
    expect(loaded?.modelRegistry).toEqual(v1Data.modelRegistry)
  })

  it("v2 roundtrip with providerUsage preserves data", async () => {
    testDir = await createTempDir()
    const cachePath = join(testDir, "cache.json")
    const cache = createDiskCache({ cachePath })

    const testData: DiskCacheData = {
      version: 2,
      lastFetchMs: 123456,
      samples: [],
      modelRegistry: [],
      providerUsage: {
        provider: "anthropic",
        fetchedAtMs: 123456789,
        windows: [
          { label: "5h", usedPercent: 50, resetAtMs: 1234567890 },
          { label: "7d", usedPercent: 25 }
        ],
        extraUsage: {
          enabled: true,
          monthlyLimitCents: 10000,
          usedCents: 5000,
          utilization: 50,
          currency: "USD"
        }
      }
    }

    await cache.save(testData)
    const loaded = await cache.load()

    expect(loaded).toEqual(testData)
  })

  it("v2 roundtrip without providerUsage preserves data", async () => {
    testDir = await createTempDir()
    const cachePath = join(testDir, "cache.json")
    const cache = createDiskCache({ cachePath })

    const testData: DiskCacheData = {
      version: 2,
      lastFetchMs: 789012,
      samples: [],
      modelRegistry: [],
      providerUsage: undefined
    }

    await cache.save(testData)
    const loaded = await cache.load()

    expect(loaded).toEqual(testData)
  })

  it("v1 migration preserves samples and modelRegistry unchanged", async () => {
    testDir = await createTempDir()
    const cachePath = join(testDir, "cache.json")

    const v1Samples = [
      { messageID: "msg_1", sessionKey: "ses_1", completedMs: 1000, contextUsedTokens: 5000, cost: 0.05 },
      { messageID: "msg_2", sessionKey: "ses_2", completedMs: 2000, contextUsedTokens: 10000, cost: 0.1 }
    ]
    const v1Registry = [
      { providerID: "anthropic", modelID: "claude-sonnet-4", cost: { input: 0.000003, output: 0.000015, cacheRead: 0.0000003, cacheWrite: 0.00000375 }, limit: { context: 200000, output: 16384 } },
      { providerID: "openai", modelID: "gpt-4", cost: { input: 0.00003, output: 0.00006, cacheRead: 0.000015, cacheWrite: 0.00003 }, limit: { context: 128000, output: 8192 } }
    ]

    const v1Data = {
      version: 1,
      lastFetchMs: 123456,
      samples: v1Samples,
      modelRegistry: v1Registry
    }
    await mkdir(testDir, { recursive: true })
    await writeFile(cachePath, JSON.stringify(v1Data))

    const cache = createDiskCache({ cachePath })
    const loaded = await cache.load()

    expect(loaded?.samples).toEqual(v1Samples)
    expect(loaded?.modelRegistry).toEqual(v1Registry)
    // Ensure we're not mutating the arrays by reference
    expect(loaded?.samples === v1Samples).toBe(false)
    expect(loaded?.modelRegistry === v1Registry).toBe(false)
  })

  it("save always writes version 2", async () => {
    testDir = await createTempDir()
    const cachePath = join(testDir, "cache.json")
    const cache = createDiskCache({ cachePath })

    const testData: DiskCacheData = {
      version: 2,
      lastFetchMs: 123456,
      samples: [],
      modelRegistry: [],
      providerUsage: undefined
    }

    await cache.save(testData)

    // Read raw file content to verify version
    const content = await readFile(cachePath, "utf-8")
    const parsed = JSON.parse(content)
    expect(parsed.version).toBe(2)
    expect(parsed.providerUsage).toBeUndefined()
  })

  it("v1 with empty arrays migrates correctly", async () => {
    testDir = await createTempDir()
    const cachePath = join(testDir, "cache.json")

    const v1Data = {
      version: 1,
      lastFetchMs: 0,
      samples: [],
      modelRegistry: []
    }
    await mkdir(testDir, { recursive: true })
    await writeFile(cachePath, JSON.stringify(v1Data))

    const cache = createDiskCache({ cachePath })
    const loaded = await cache.load()

    expect(loaded?.version).toBe(2)
    expect(loaded?.lastFetchMs).toBe(0)
    expect(loaded?.samples).toEqual([])
    expect(loaded?.modelRegistry).toEqual([])
    expect(loaded?.providerUsage).toBeUndefined()
  })
})
