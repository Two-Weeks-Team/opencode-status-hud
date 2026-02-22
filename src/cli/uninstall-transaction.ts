import { access, constants, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import path from "node:path"

import { applyEdits, modify } from "jsonc-parser"

import {
  parseConfigByExtension,
  type OpenCodeConfigShape,
  validateConfigSchemaCompatibility
} from "./config-manager.js"
import { type InstallTransactionFs } from "./install-transaction.js"

const defaultFs: InstallTransactionFs = {
  access: async (filePath, mode) => await access(filePath, mode),
  mkdir: async (dirPath, options) => await mkdir(dirPath, options),
  copyFile: async (sourcePath, targetPath) => await copyFile(sourcePath, targetPath),
  readFile: async (filePath, encoding) => await readFile(filePath, encoding),
  writeFile: async (filePath, content, encoding) => await writeFile(filePath, content, encoding),
  rename: async (sourcePath, targetPath) => await rename(sourcePath, targetPath),
  rm: async (filePath, options) => await rm(filePath, options)
}

export interface UninstallHudPluginOptions {
  configPath: string
  pluginSpecifier?: string
  backupPath?: string
  fs?: InstallTransactionFs
}

export type UninstallHudPluginResult =
  | {
      kind: "uninstalled"
      path: string
      backupPath: string | null
      pluginSpecifier: string
      changed: boolean
    }
  | {
      kind: "failed"
      path: string
      reason: "invalid_config" | "write_failed" | "rollback_failed"
      message: string
      backupPath: string | null
    }

const DEFAULT_PLUGIN_SPECIFIER = "opencode-status-hud"

function defaultBackupPath(configPath: string): string {
  return `${configPath}.bak`
}

async function exists(filePath: string, fsImpl: InstallTransactionFs): Promise<boolean> {
  try {
    await fsImpl.access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function buildNextContent(filePath: string, originalContent: string, nextConfig: OpenCodeConfigShape): string {
  if (filePath.endsWith(".jsonc")) {
    const edits = modify(
      originalContent,
      ["plugin"],
      nextConfig.plugin,
      {
        formattingOptions: {
          insertSpaces: true,
          tabSize: 2,
          eol: "\n"
        }
      }
    )
    return applyEdits(originalContent, edits)
  }

  return `${JSON.stringify(nextConfig, null, 2)}\n`
}

export async function uninstallHudPluginTransaction(
  options: UninstallHudPluginOptions
): Promise<UninstallHudPluginResult> {
  const fsImpl = options.fs ?? defaultFs
  const pluginSpecifier = options.pluginSpecifier ?? DEFAULT_PLUGIN_SPECIFIER
  const backupPath = options.backupPath ?? defaultBackupPath(options.configPath)

  if (backupPath === options.configPath) {
    return {
      kind: "failed",
      path: options.configPath,
      reason: "invalid_config",
      message: "The configuration file path and backup path cannot be the same.",
      backupPath: null
    }
  }

  await fsImpl.mkdir(path.dirname(options.configPath), { recursive: true })

  const configExists = await exists(options.configPath, fsImpl)
  if (!configExists) {
    return {
      kind: "uninstalled",
      path: options.configPath,
      backupPath: null,
      pluginSpecifier,
      changed: false
    }
  }

  const backupExists = await exists(backupPath, fsImpl)
  if (!backupExists) {
    await fsImpl.copyFile(options.configPath, backupPath)
  }

  const originalContent = await fsImpl.readFile(options.configPath, "utf8")
  const parsed = parseConfigByExtension(originalContent, options.configPath)
  if (parsed.kind === "invalid") {
    return {
      kind: "failed",
      path: options.configPath,
      reason: "invalid_config",
      message: parsed.message,
      backupPath
    }
  }

  const validated = validateConfigSchemaCompatibility(parsed.value)
  if (validated.kind === "invalid") {
    return {
      kind: "failed",
      path: options.configPath,
      reason: "invalid_config",
      message: validated.message,
      backupPath
    }
  }

  const baseConfig = validated.config
  const existingPlugins = Array.isArray(baseConfig.plugin) ? baseConfig.plugin : []
  const nextPlugins = existingPlugins.filter((plugin) => plugin !== pluginSpecifier)
  const changed = nextPlugins.length !== existingPlugins.length

  const nextConfig: OpenCodeConfigShape = {
    ...baseConfig,
    plugin: nextPlugins
  }

  const tempPath = `${options.configPath}.tmp.${randomBytes(6).toString("hex")}`
  const nextContent = buildNextContent(options.configPath, originalContent, nextConfig)

  try {
    await fsImpl.writeFile(tempPath, nextContent, "utf8")
    await fsImpl.rename(tempPath, options.configPath)
  } catch {
    await fsImpl.rm(tempPath, { force: true }).catch(() => undefined)

    const currentExists = await exists(options.configPath, fsImpl)
    if (!currentExists) {
      try {
        await fsImpl.copyFile(backupPath, options.configPath)
      } catch {
        return {
          kind: "failed",
          path: options.configPath,
          reason: "rollback_failed",
          message: "Uninstall failed and backup rollback could not restore original config.",
          backupPath
        }
      }
    }

    return {
      kind: "failed",
      path: options.configPath,
      reason: "write_failed",
      message: "Uninstall transaction failed during temporary write or atomic rename.",
      backupPath
    }
  }

  return {
    kind: "uninstalled",
    path: options.configPath,
    backupPath,
    pluginSpecifier,
    changed
  }
}
