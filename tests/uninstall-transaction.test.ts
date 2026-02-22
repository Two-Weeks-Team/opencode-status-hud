import * as fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { installHudPluginTransaction } from "../src/cli/install-transaction.js"
import { uninstallHudPluginTransaction, type UninstallHudPluginOptions } from "../src/cli/uninstall-transaction.js"

const tempRoots: string[] = []

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  tempRoots.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.allSettled(tempRoots.map((dir) => fs.rm(dir, { recursive: true, force: true })))
  tempRoots.length = 0
})

describe("uninstallHudPluginTransaction", () => {
  it("removes only target plugin and preserves unrelated config", async () => {
    const root = await createTempDir("hud-uninstall-transaction-")
    const configPath = path.join(root, "opencode.json")
    await fs.writeFile(
      configPath,
      JSON.stringify({ profile: "minimal", plugin: ["first", "opencode-status-hud", "third"] }, null, 2),
      "utf8"
    )

    const result = await uninstallHudPluginTransaction({ configPath })
    expect(result.kind).toBe("uninstalled")
    if (result.kind === "uninstalled") {
      expect(result.changed).toBe(true)
    }

    const updated = JSON.parse(await fs.readFile(configPath, "utf8")) as { profile?: string; plugin?: string[] }
    expect(updated.profile).toBe("minimal")
    expect(updated.plugin).toEqual(["first", "third"])
  })

  it("is idempotent on repeated uninstall", async () => {
    const root = await createTempDir("hud-uninstall-transaction-")
    const configPath = path.join(root, "opencode.json")
    await fs.writeFile(configPath, JSON.stringify({ plugin: ["opencode-status-hud"] }, null, 2), "utf8")

    const first = await uninstallHudPluginTransaction({ configPath })
    const second = await uninstallHudPluginTransaction({ configPath })

    expect(first.kind).toBe("uninstalled")
    expect(second.kind).toBe("uninstalled")
    if (first.kind === "uninstalled" && second.kind === "uninstalled") {
      expect(first.changed).toBe(true)
      expect(second.changed).toBe(false)
    }

    const updated = JSON.parse(await fs.readFile(configPath, "utf8")) as { plugin?: string[] }
    expect(updated.plugin).toEqual([])
  })

  it("supports clean reinstall after uninstall", async () => {
    const root = await createTempDir("hud-uninstall-transaction-")
    const configPath = path.join(root, "opencode.json")
    await fs.writeFile(configPath, JSON.stringify({ plugin: ["opencode-status-hud"] }, null, 2), "utf8")

    const uninstall = await uninstallHudPluginTransaction({ configPath })
    expect(uninstall.kind).toBe("uninstalled")

    const reinstall = await installHudPluginTransaction({ configPath })
    expect(reinstall.kind).toBe("installed")
    if (reinstall.kind === "installed") {
      expect(reinstall.changed).toBe(true)
    }

    const updated = JSON.parse(await fs.readFile(configPath, "utf8")) as { plugin?: string[] }
    expect(updated.plugin).toEqual(["opencode-status-hud"])
  })

  it("restores from backup when failure leaves config missing", async () => {
    const root = await createTempDir("hud-uninstall-transaction-")
    const configPath = path.join(root, "opencode.json")
    const backupPath = `${configPath}.bak`

    await fs.writeFile(configPath, JSON.stringify({ plugin: ["opencode-status-hud", "other"] }, null, 2), "utf8")
    await fs.writeFile(backupPath, JSON.stringify({ plugin: ["from-backup"] }, null, 2), "utf8")

    const fsOverride: NonNullable<UninstallHudPluginOptions["fs"]> = {
      access: async (filePath, mode) => await fs.access(filePath, mode),
      mkdir: async (dirPath, options) => await fs.mkdir(dirPath, options),
      copyFile: async (sourcePath, targetPath) => await fs.copyFile(sourcePath, targetPath),
      readFile: async (filePath, encoding) => await fs.readFile(filePath, encoding),
      writeFile: async (filePath, content, encoding) => await fs.writeFile(filePath, content, encoding),
      rename: async () => {
        await fs.rm(configPath, { force: true })
        throw new Error("rename failed")
      },
      rm: async (filePath, options) => await fs.rm(filePath, options)
    }

    const result = await uninstallHudPluginTransaction({
      configPath,
      fs: fsOverride
    })

    expect(result.kind).toBe("failed")
    if (result.kind === "failed") {
      expect(result.reason).toBe("write_failed")
    }

    const restored = JSON.parse(await fs.readFile(configPath, "utf8")) as { plugin?: string[] }
    expect(restored.plugin).toEqual(["from-backup"])
  })
})
