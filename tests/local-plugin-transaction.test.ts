import * as fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  installLocalHudPluginTransaction,
  uninstallLocalHudPluginTransaction,
  type LocalPluginTransactionFs
} from "../src/cli/local-plugin-transaction.js"

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

describe("local plugin install transaction", () => {
  it("installs shim file idempotently", async () => {
    const root = await createTempDir("hud-local-plugin-")
    const pluginDir = path.join(root, "plugins")
    const entryPath = path.join(root, "entry.js")
    await fs.writeFile(entryPath, "export default async () => ({})\n", "utf8")

    const first = await installLocalHudPluginTransaction({ pluginDirectory: pluginDir, pluginEntryPath: entryPath })
    const second = await installLocalHudPluginTransaction({ pluginDirectory: pluginDir, pluginEntryPath: entryPath })

    expect(first.kind).toBe("installed")
    expect(second.kind).toBe("installed")

    if (first.kind === "installed" && second.kind === "installed") {
      expect(first.changed).toBe(true)
      expect(second.changed).toBe(false)
      const shim = await fs.readFile(first.pluginPath, "utf8")
      expect(shim).toContain("export { default } from")
      expect(shim).toContain("entry.js")
    }
  })

  it("fails safely when plugin entry does not exist", async () => {
    const root = await createTempDir("hud-local-plugin-")
    const pluginDir = path.join(root, "plugins")
    const missingEntry = path.join(root, "missing-entry.js")

    const result = await installLocalHudPluginTransaction({ pluginDirectory: pluginDir, pluginEntryPath: missingEntry })
    expect(result.kind).toBe("failed")
    if (result.kind === "failed") {
      expect(result.reason).toBe("invalid_entry_path")
    }
  })

  it("uninstalls only local shim and remains idempotent", async () => {
    const root = await createTempDir("hud-local-plugin-")
    const pluginDir = path.join(root, "plugins")
    const entryPath = path.join(root, "entry.js")
    await fs.writeFile(entryPath, "export default async () => ({})\n", "utf8")

    const installed = await installLocalHudPluginTransaction({ pluginDirectory: pluginDir, pluginEntryPath: entryPath })
    expect(installed.kind).toBe("installed")

    const first = await uninstallLocalHudPluginTransaction({ pluginDirectory: pluginDir })
    const second = await uninstallLocalHudPluginTransaction({ pluginDirectory: pluginDir })

    expect(first.kind).toBe("uninstalled")
    expect(second.kind).toBe("uninstalled")
    if (first.kind === "uninstalled" && second.kind === "uninstalled") {
      expect(first.changed).toBe(true)
      expect(second.changed).toBe(false)
    }
  })

  it("returns write failure when rename fails", async () => {
    const root = await createTempDir("hud-local-plugin-")
    const pluginDir = path.join(root, "plugins")
    const entryPath = path.join(root, "entry.js")
    await fs.writeFile(entryPath, "export default async () => ({})\n", "utf8")

    const failingRenameFs: LocalPluginTransactionFs = {
      access: async (filePath, mode) => await fs.access(filePath, mode),
      mkdir: async (dirPath, options) => await fs.mkdir(dirPath, options),
      readFile: async (filePath, encoding) => await fs.readFile(filePath, encoding),
      writeFile: async (filePath, content, encoding) => await fs.writeFile(filePath, content, encoding),
      rename: async () => {
        throw new Error("rename failed")
      },
      rm: async (filePath, options) => await fs.rm(filePath, options)
    }

    const result = await installLocalHudPluginTransaction({
      pluginDirectory: pluginDir,
      pluginEntryPath: entryPath,
      fs: failingRenameFs
    })

    expect(result.kind).toBe("failed")
    if (result.kind === "failed") {
      expect(result.reason).toBe("write_failed")
    }
  })
})
