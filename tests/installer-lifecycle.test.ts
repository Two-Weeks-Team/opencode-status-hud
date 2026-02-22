import * as fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { installHudPluginTransaction, type InstallHudPluginResult } from "../src/cli/install-transaction.js"
import { uninstallHudPluginTransaction } from "../src/cli/uninstall-transaction.js"

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

function expectInstalled(result: InstallHudPluginResult): asserts result is Extract<InstallHudPluginResult, { kind: "installed" }> {
  expect(result.kind).toBe("installed")
}

function expectFailed(result: InstallHudPluginResult): asserts result is Extract<InstallHudPluginResult, { kind: "failed" }> {
  expect(result.kind).toBe("failed")
}

describe("installer lifecycle regression", () => {
  it("passes clean install then reinstall with stable config output", async () => {
    const root = await createTempDir("hud-lifecycle-")
    const configPath = path.join(root, "opencode.json")

    const firstInstall = await installHudPluginTransaction({ configPath })
    expectInstalled(firstInstall)
    expect(firstInstall.changed).toBe(true)

    const afterFirst = await fs.readFile(configPath, "utf8")

    const secondInstall = await installHudPluginTransaction({ configPath })
    expectInstalled(secondInstall)
    expect(secondInstall.changed).toBe(false)

    const afterSecond = await fs.readFile(configPath, "utf8")
    expect(afterSecond).toBe(afterFirst)
  })

  it("passes uninstall and reinstall cycle without unrelated config drift", async () => {
    const root = await createTempDir("hud-lifecycle-")
    const configPath = path.join(root, "opencode.json")
    await fs.writeFile(
      configPath,
      JSON.stringify({ profile: "balanced", plugin: ["alpha", "opencode-status-hud", "omega"] }, null, 2),
      "utf8"
    )

    const uninstall = await uninstallHudPluginTransaction({ configPath })
    expect(uninstall.kind).toBe("uninstalled")

    const afterUninstall = JSON.parse(await fs.readFile(configPath, "utf8")) as { profile?: string; plugin?: string[] }
    expect(afterUninstall.profile).toBe("balanced")
    expect(afterUninstall.plugin).toEqual(["alpha", "omega"])

    const reinstall = await installHudPluginTransaction({ configPath })
    expect(reinstall.kind).toBe("installed")

    const afterReinstall = JSON.parse(await fs.readFile(configPath, "utf8")) as { profile?: string; plugin?: string[] }
    expect(afterReinstall.profile).toBe("balanced")
    expect(afterReinstall.plugin).toEqual(["alpha", "omega", "opencode-status-hud"])
  })

  it("fails safely on corrupted config and supports backup-based recovery", async () => {
    const root = await createTempDir("hud-lifecycle-")
    const configPath = path.join(root, "opencode.json")
    const backupPath = `${configPath}.bak`

    await fs.writeFile(configPath, JSON.stringify({ plugin: ["stable"] }, null, 2), "utf8")
    await fs.writeFile(backupPath, JSON.stringify({ plugin: ["stable"] }, null, 2), "utf8")

    await fs.writeFile(configPath, "{\n  \"plugin\": [\n", "utf8")

    const failedInstall = await installHudPluginTransaction({ configPath, backupPath })
    expectFailed(failedInstall)
    expect(failedInstall.reason).toBe("invalid_config")

    const corruptedStillThere = await fs.readFile(configPath, "utf8")
    expect(corruptedStillThere).toContain('"plugin"')

    await fs.copyFile(backupPath, configPath)

    const recoveredInstall = await installHudPluginTransaction({ configPath, backupPath })
    expectInstalled(recoveredInstall)
    expect(recoveredInstall.changed).toBe(true)

    const recovered = JSON.parse(await fs.readFile(configPath, "utf8")) as { plugin?: string[] }
    expect(recovered.plugin).toEqual(["stable", "opencode-status-hud"])
  })
})
