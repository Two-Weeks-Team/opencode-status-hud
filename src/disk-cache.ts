import { readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises"
import { join, dirname } from "node:path"
import { homedir } from "node:os"

import type { UsageSample } from "./plugin.js"
import type { ModelRegistryEntry } from "./model-registry.js"

export interface DiskCacheData {
  version: 1
  lastFetchMs: number
  samples: UsageSample[]
  modelRegistry: ModelRegistryEntry[]
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
          typeof parsed === "object" &&
          parsed !== null &&
          "version" in parsed &&
          (parsed as { version: unknown }).version === 1
        ) {
          return parsed as DiskCacheData
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
