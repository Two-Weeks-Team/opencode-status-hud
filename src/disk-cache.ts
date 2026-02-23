import { readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises"
import { join, dirname } from "node:path"
import { homedir } from "node:os"

import type { UsageSample } from "./plugin.js"
import type { ModelRegistryEntry } from "./model-registry.js"
import type { ProviderUsageSnapshot, ProviderKey } from "./provider-usage.types.js"

/** v1 schema - kept for migration reference */
interface DiskCacheDataV1 {
  version: 1
  lastFetchMs: number
  samples: UsageSample[]
  modelRegistry: ModelRegistryEntry[]
}

/** v2 schema - extends v1 with optional providerUsage */
interface DiskCacheDataV2 {
  version: 2
  lastFetchMs: number
  samples: UsageSample[]
  modelRegistry: ModelRegistryEntry[]
  providerUsage?: ProviderUsageSnapshot | undefined
}

/** v3 schema - extends v2 with multi-provider usage */
export interface DiskCacheData {
  version: 3
  lastFetchMs: number
  samples: UsageSample[]
  modelRegistry: ModelRegistryEntry[]
  providerUsages?: Partial<Record<ProviderKey, ProviderUsageSnapshot>> | undefined
}

export interface DiskCache {
  load(): Promise<DiskCacheData | null>
  save(data: DiskCacheData): Promise<void>
}

export function defaultCachePath(): string {
  const configDir = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")
  return join(configDir, "opencode-status-hud", "usage-cache.json")
}

interface DiskCacheOptions {
  cachePath?: string
}

export function createDiskCache(options?: DiskCacheOptions): DiskCache {
  const cachePath = options?.cachePath ?? defaultCachePath()

  return {
    async load(): Promise<DiskCacheData | null> {
      try {
        const content = await readFile(cachePath, "utf-8")
        const parsed = JSON.parse(content) as unknown

        if (
          typeof parsed !== "object" ||
          parsed === null ||
          !("version" in parsed)
        ) {
          return null
        }

        const version = (parsed as { version: unknown }).version

        if (version === 3) {
          return parsed as DiskCacheData
        }

        if (version === 2) {
          const v2 = parsed as DiskCacheDataV2
          // v2 → v3: migrate single providerUsage to providerUsages map
          const providerUsages: Partial<Record<ProviderKey, ProviderUsageSnapshot>> | undefined =
            v2.providerUsage !== undefined
              ? { anthropic: v2.providerUsage }
              : undefined
          return {
            version: 3,
            lastFetchMs: v2.lastFetchMs,
            samples: v2.samples,
            modelRegistry: v2.modelRegistry,
            providerUsages
          }
        }

        if (version === 1) {
          const v1 = parsed as DiskCacheDataV1
          return {
            version: 3,
            lastFetchMs: v1.lastFetchMs,
            samples: v1.samples,
            modelRegistry: v1.modelRegistry,
            providerUsages: undefined
          }
        }

        return null
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return null
        }

        if (error instanceof SyntaxError) {
          return null
        }

        return null
      }
    },

    async save(data: DiskCacheData): Promise<void> {
      const tmpPath = `${cachePath}.${process.pid}.tmp`

      try {
        await mkdir(dirname(cachePath), { recursive: true })
        await writeFile(tmpPath, JSON.stringify(data), "utf-8")
        await rename(tmpPath, cachePath)
      } catch (error) {
        try {
          await unlink(tmpPath)
        } catch {
          // Silently ignore cleanup errors
        }
        throw error
      }
    }
  }
}
