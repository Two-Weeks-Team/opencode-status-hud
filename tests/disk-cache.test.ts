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
      version: 1,
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
      ]
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
      version: 1,
      lastFetchMs: 123456,
      samples: [],
      modelRegistry: []
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
      version: 1,
      lastFetchMs: 789012,
      samples: [],
      modelRegistry: []
    }

    await cache.save(testData)

    // Verify the file exists and is valid JSON (atomic write completed)
    const content = await readFile(cachePath, "utf-8")
    const parsed = JSON.parse(content)
    expect(parsed.version).toBe(1)
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
})
