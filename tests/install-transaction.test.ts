import * as fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { installHudPluginTransaction, type InstallTransactionFs } from "../src/cli/install-transaction.js"
import { expectInstallFailed, expectInstallInstalled } from "./test-helpers.js"

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

describe("installHudPluginTransaction", () => {
  it("installs plugin once and remains idempotent on repeated install", async () => {
    const root = await createTempDir("hud-install-transaction-")
    const configPath = path.join(root, "opencode.json")

    await fs.writeFile(configPath, JSON.stringify({ plugin: ["other-plugin"] }, null, 2), "utf8")

    const first = await installHudPluginTransaction({ configPath })
    const second = await installHudPluginTransaction({ configPath })

    expectInstallInstalled(first)
    expectInstallInstalled(second)
    expect(first.changed).toBe(true)
    expect(second.changed).toBe(false)

    const installed = JSON.parse(await fs.readFile(configPath, "utf8")) as { plugin?: string[] }
    expect(installed.plugin).toEqual(["other-plugin", "opencode-status-hud"])
  })

  it("creates backup once and preserves original content", async () => {
    const root = await createTempDir("hud-install-transaction-")
    const configPath = path.join(root, "opencode.json")
    const backupPath = `${configPath}.bak`

    const original = JSON.stringify({ plugin: ["legacy-plugin"] }, null, 2)
    await fs.writeFile(configPath, original, "utf8")

    await installHudPluginTransaction({ configPath })

    await fs.writeFile(configPath, JSON.stringify({ plugin: ["legacy-plugin", "manual-change"] }, null, 2), "utf8")
    await installHudPluginTransaction({ configPath })

    const backup = await fs.readFile(backupPath, "utf8")
    expect(backup).toBe(original)
  })

  it("rolls back safely when atomic rename fails", async () => {
    const root = await createTempDir("hud-install-transaction-")
    const configPath = path.join(root, "opencode.json")

    await fs.writeFile(configPath, JSON.stringify({ plugin: ["existing"] }, null, 2), "utf8")

    const failingRenameFs: InstallTransactionFs = {
      access: async (filePath, mode) => await fs.access(filePath, mode),
      mkdir: async (dirPath, options) => await fs.mkdir(dirPath, options),
      copyFile: async (sourcePath, targetPath) => await fs.copyFile(sourcePath, targetPath),
      readFile: async (filePath, encoding) => await fs.readFile(filePath, encoding),
      writeFile: async (filePath, content, encoding) => await fs.writeFile(filePath, content, encoding),
      rename: async () => {
        throw new Error("rename failed")
      },
      rm: async (filePath, options) => await fs.rm(filePath, options)
    }

    const result = await installHudPluginTransaction({
      configPath,
      fs: failingRenameFs
    })

    expectInstallFailed(result)
    expect(result.reason).toBe("write_failed")

    const current = JSON.parse(await fs.readFile(configPath, "utf8")) as { plugin?: string[] }
    expect(current.plugin).toEqual(["existing"])
  })

  it("preserves existing JSONC comments while updating plugin list", async () => {
    const root = await createTempDir("hud-install-transaction-")
    const configPath = path.join(root, "opencode.jsonc")

    await fs.writeFile(
      configPath,
      '{\n  // keep me\n  "profile": "minimal",\n  "plugin": ["legacy"]\n}\n',
      "utf8"
    )

    const result = await installHudPluginTransaction({ configPath })
    expectInstallInstalled(result)

    const updated = await fs.readFile(configPath, "utf8")
    expect(updated.includes("// keep me")).toBe(true)

    const normalized = updated.replace(/\/\/.*$/gm, "")
    const parsed = JSON.parse(normalized) as { plugin?: string[] }
    expect(parsed.plugin).toEqual(["legacy", "opencode-status-hud"])
  })

  it("restores from existing backup when config becomes missing during failure", async () => {
    const root = await createTempDir("hud-install-transaction-")
    const configPath = path.join(root, "opencode.json")
    const backupPath = `${configPath}.bak`

    await fs.writeFile(configPath, JSON.stringify({ plugin: ["existing"] }, null, 2), "utf8")
    await fs.writeFile(backupPath, JSON.stringify({ plugin: ["from-backup"] }, null, 2), "utf8")

    const removeThenFailFs: InstallTransactionFs = {
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

    const result = await installHudPluginTransaction({
      configPath,
      fs: removeThenFailFs
    })

    expectInstallFailed(result)
    expect(result.reason).toBe("write_failed")

    const restored = JSON.parse(await fs.readFile(configPath, "utf8")) as { plugin?: string[] }
    expect(restored.plugin).toEqual(["from-backup"])
  })
})
