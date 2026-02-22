import { expect } from "vitest"

import type { InstallHudPluginResult } from "../src/cli/install-transaction.js"
import type { UninstallHudPluginResult } from "../src/cli/uninstall-transaction.js"

export function expectInstallInstalled(
  result: InstallHudPluginResult
): asserts result is Extract<InstallHudPluginResult, { kind: "installed" }> {
  expect(result.kind).toBe("installed")
}

export function expectInstallFailed(
  result: InstallHudPluginResult
): asserts result is Extract<InstallHudPluginResult, { kind: "failed" }> {
  expect(result.kind).toBe("failed")
}

export function expectUninstallUninstalled(
  result: UninstallHudPluginResult
): asserts result is Extract<UninstallHudPluginResult, { kind: "uninstalled" }> {
  expect(result.kind).toBe("uninstalled")
}

export function expectUninstallFailed(
  result: UninstallHudPluginResult
): asserts result is Extract<UninstallHudPluginResult, { kind: "failed" }> {
  expect(result.kind).toBe("failed")
}
