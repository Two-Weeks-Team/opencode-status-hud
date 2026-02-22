import { access, constants, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import { parse as parseJsonc, printParseErrorCode, type ParseError } from "jsonc-parser"

import { validateConfigSchemaCompatibility, type OpenCodeConfigShape } from "./config-manager.js"

export interface InstallTransactionFs {
  access: (filePath: string, mode?: number) => Promise<void>
  mkdir: (dirPath: string, options: { recursive: true }) => Promise<unknown>
  copyFile: (sourcePath: string, targetPath: string) => Promise<void>
  readFile: (filePath: string, encoding: "utf8") => Promise<string>
  writeFile: (filePath: string, content: string, encoding: "utf8") => Promise<void>
  rename: (sourcePath: string, targetPath: string) => Promise<void>
  rm: (filePath: string, options: { force: true }) => Promise<void>
}

const defaultFs: InstallTransactionFs = {
  access: async (filePath, mode) => await access(filePath, mode),
  mkdir: async (dirPath, options) => await mkdir(dirPath, options),
  copyFile: async (sourcePath, targetPath) => await copyFile(sourcePath, targetPath),
  readFile: async (filePath, encoding) => await readFile(filePath, encoding),
  writeFile: async (filePath, content, encoding) => await writeFile(filePath, content, encoding),
  rename: async (sourcePath, targetPath) => await rename(sourcePath, targetPath),
  rm: async (filePath, options) => await rm(filePath, options)
}

export interface InstallHudPluginOptions {
  configPath: string
  pluginSpecifier?: string
  backupPath?: string
  fs?: InstallTransactionFs
}

export type InstallHudPluginResult =
  | {
      kind: "installed"
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

function parseConfigContent(content: string, filePath: string): { kind: "valid"; value: unknown } | {
  kind: "invalid"
  message: string
} {
  if (filePath.endsWith(".jsonc")) {
    const errors: ParseError[] = []
    const value = parseJsonc(content, errors)
    if (errors.length > 0) {
      const first = errors[0]!
      return {
        kind: "invalid",
        message: `Invalid JSONC syntax: ${printParseErrorCode(first.error)} at offset ${first.offset}.`
      }
    }

    return {
      kind: "valid",
      value
    }
  }

  try {
    return {
      kind: "valid",
      value: JSON.parse(content) as unknown
    }
  } catch {
    return {
      kind: "invalid",
      message: "Invalid JSON syntax in config file."
    }
  }
}

export async function installHudPluginTransaction(options: InstallHudPluginOptions): Promise<InstallHudPluginResult> {
  const fsImpl = options.fs ?? defaultFs
  const pluginSpecifier = options.pluginSpecifier ?? DEFAULT_PLUGIN_SPECIFIER
  const backupPath = options.backupPath ?? defaultBackupPath(options.configPath)

  await fsImpl.mkdir(path.dirname(options.configPath), { recursive: true })

  const configExists = await exists(options.configPath, fsImpl)
  const backupExists = await exists(backupPath, fsImpl)
  const originalContent = configExists ? await fsImpl.readFile(options.configPath, "utf8") : null

  if (configExists && !backupExists) {
    await fsImpl.copyFile(options.configPath, backupPath)
  }

  let baseConfig: OpenCodeConfigShape = {}
  if (originalContent !== null) {
    const parsed = parseConfigContent(originalContent, options.configPath)
    if (parsed.kind === "invalid") {
      return {
        kind: "failed",
        path: options.configPath,
        reason: "invalid_config",
        message: parsed.message,
        backupPath: configExists ? backupPath : null
      }
    }

    const validated = validateConfigSchemaCompatibility(parsed.value)
    if (validated.kind === "invalid") {
      return {
        kind: "failed",
        path: options.configPath,
        reason: "invalid_config",
        message: validated.message,
        backupPath: configExists ? backupPath : null
      }
    }

    baseConfig = validated.config
  }

  const existingPlugins = Array.isArray(baseConfig.plugin) ? baseConfig.plugin : []
  const hasPlugin = existingPlugins.includes(pluginSpecifier)
  const nextPlugins = hasPlugin ? existingPlugins : [...existingPlugins, pluginSpecifier]

  const nextConfig: OpenCodeConfigShape = {
    ...baseConfig,
    plugin: nextPlugins
  }

  const tempPath = `${options.configPath}.tmp.${process.pid}.${Date.now()}`
  const nextContent = `${JSON.stringify(nextConfig, null, 2)}\n`

  try {
    await fsImpl.writeFile(tempPath, nextContent, "utf8")
    await fsImpl.rename(tempPath, options.configPath)
  } catch {
    await fsImpl.rm(tempPath, { force: true }).catch(() => undefined)

    if (configExists && !backupExists) {
      const currentExists = await exists(options.configPath, fsImpl)
      if (!currentExists) {
        try {
          await fsImpl.copyFile(backupPath, options.configPath)
        } catch {
          return {
            kind: "failed",
            path: options.configPath,
            reason: "rollback_failed",
            message: "Install failed and backup rollback could not restore original config.",
            backupPath
          }
        }
      }
    }

    return {
      kind: "failed",
      path: options.configPath,
      reason: "write_failed",
      message: "Install transaction failed during temporary write or atomic rename.",
      backupPath: configExists ? backupPath : null
    }
  }

  return {
    kind: "installed",
    path: options.configPath,
    backupPath: configExists ? backupPath : null,
    pluginSpecifier,
    changed: !hasPlugin
  }
}
