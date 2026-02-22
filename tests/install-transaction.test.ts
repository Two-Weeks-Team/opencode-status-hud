import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { installHudPluginTransaction, type InstallTransactionFs } from "../src/cli/install-transaction.js"

const tempRoots: string[] = []

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
  tempRoots.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.allSettled(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })))
  tempRoots.length = 0
})

describe("installHudPluginTransaction", () => {
  it("installs plugin once and remains idempotent on repeated install", async () => {
    const root = await createTempDir("hud-install-transaction-")
    const configPath = path.join(root, "opencode.json")

    await writeFile(configPath, JSON.stringify({ plugin: ["other-plugin"] }, null, 2), "utf8")

    const first = await installHudPluginTransaction({ configPath })
    const second = await installHudPluginTransaction({ configPath })

    expect(first.kind).toBe("installed")
    expect(second.kind).toBe("installed")

    if (first.kind === "installed" && second.kind === "installed") {
      expect(first.changed).toBe(true)
      expect(second.changed).toBe(false)
    }

    const installed = JSON.parse(await readFile(configPath, "utf8")) as { plugin?: string[] }
    expect(installed.plugin).toEqual(["other-plugin", "opencode-status-hud"])
  })

  it("creates backup once and preserves original content", async () => {
    const root = await createTempDir("hud-install-transaction-")
    const configPath = path.join(root, "opencode.json")
    const backupPath = `${configPath}.bak`

    const original = JSON.stringify({ plugin: ["legacy-plugin"] }, null, 2)
    await writeFile(configPath, original, "utf8")

    await installHudPluginTransaction({ configPath })

    await writeFile(configPath, JSON.stringify({ plugin: ["legacy-plugin", "manual-change"] }, null, 2), "utf8")
    await installHudPluginTransaction({ configPath })

    const backup = await readFile(backupPath, "utf8")
    expect(backup).toBe(original)
  })

  it("rolls back safely when atomic rename fails", async () => {
    const root = await createTempDir("hud-install-transaction-")
    const configPath = path.join(root, "opencode.json")

    await writeFile(configPath, JSON.stringify({ plugin: ["existing"] }, null, 2), "utf8")

    const failingRenameFs: InstallTransactionFs = {
      access: async (filePath, mode) => await import("node:fs/promises").then((m) => m.access(filePath, mode)),
      mkdir: async (dirPath, options) => await import("node:fs/promises").then((m) => m.mkdir(dirPath, options)),
      copyFile: async (sourcePath, targetPath) =>
        await import("node:fs/promises").then((m) => m.copyFile(sourcePath, targetPath)),
      readFile: async (filePath, encoding) => await import("node:fs/promises").then((m) => m.readFile(filePath, encoding)),
      writeFile: async (filePath, content, encoding) =>
        await import("node:fs/promises").then((m) => m.writeFile(filePath, content, encoding)),
      rename: async () => {
        throw new Error("rename failed")
      },
      rm: async (filePath, options) => await import("node:fs/promises").then((m) => m.rm(filePath, options))
    }

    const result = await installHudPluginTransaction({
      configPath,
      fs: failingRenameFs
    })

    expect(result.kind).toBe("failed")
    if (result.kind === "failed") {
      expect(result.reason).toBe("write_failed")
    }

    const current = JSON.parse(await readFile(configPath, "utf8")) as { plugin?: string[] }
    expect(current.plugin).toEqual(["existing"])
  })
})
