import { access, constants, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { parse as parseJsonc, printParseErrorCode, type ParseError } from "jsonc-parser"

type ConfigPathSource =
  | "env:OPENCODE_CONFIG"
  | "project"
  | "project:.opencode"
  | "env:OPENCODE_CONFIG_DIR"
  | "global"
  | "global-default"

export interface ResolveConfigPathOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  homeDir?: string
  platform?: NodeJS.Platform
}

export type ResolveConfigPathResult = {
  path: string
  source: ConfigPathSource
  searched: string[]
}

export interface OpenCodeConfigShape {
  $schema?: string
  plugin?: string[]
  [key: string]: unknown
}

type ValidateConfigResult =
  | { kind: "valid"; config: OpenCodeConfigShape }
  | { kind: "invalid"; reason: string; message: string }

export type ReadAndValidateConfigResult =
  | { kind: "valid"; path: string; config: OpenCodeConfigShape }
  | { kind: "invalid"; path: string; reason: string; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function resolveGlobalConfigDir(env: NodeJS.ProcessEnv, homeDir: string, platform: NodeJS.Platform): string {
  if (env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.length > 0) {
    return path.join(env.XDG_CONFIG_HOME, "opencode")
  }

  if (platform === "win32") {
    const appData = env.APPDATA ?? path.join(homeDir, "AppData", "Roaming")
    return path.join(appData, "opencode")
  }

  return path.join(homeDir, ".config", "opencode")
}

export async function resolveConfigPath(options: ResolveConfigPathOptions = {}): Promise<ResolveConfigPathResult> {
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  const homeDir = options.homeDir ?? os.homedir()
  const platform = options.platform ?? process.platform

  const searched: string[] = []

  const explicitConfig = env.OPENCODE_CONFIG
  if (explicitConfig && explicitConfig.length > 0) {
    return {
      path: explicitConfig,
      source: "env:OPENCODE_CONFIG",
      searched
    }
  }

  const projectCandidates: Array<{ path: string; source: ConfigPathSource }> = [
    { path: path.join(cwd, "opencode.jsonc"), source: "project" },
    { path: path.join(cwd, "opencode.json"), source: "project" },
    { path: path.join(cwd, ".opencode", "opencode.jsonc"), source: "project:.opencode" },
    { path: path.join(cwd, ".opencode", "opencode.json"), source: "project:.opencode" }
  ]

  const configDir = env.OPENCODE_CONFIG_DIR
  if (configDir && configDir.length > 0) {
    projectCandidates.push({ path: path.join(configDir, "opencode.jsonc"), source: "env:OPENCODE_CONFIG_DIR" })
    projectCandidates.push({ path: path.join(configDir, "opencode.json"), source: "env:OPENCODE_CONFIG_DIR" })
  }

  const globalDir = resolveGlobalConfigDir(env, homeDir, platform)
  projectCandidates.push({ path: path.join(globalDir, "opencode.jsonc"), source: "global" })
  projectCandidates.push({ path: path.join(globalDir, "opencode.json"), source: "global" })

  for (const candidate of projectCandidates) {
    searched.push(candidate.path)
    if (await exists(candidate.path)) {
      return {
        path: candidate.path,
        source: candidate.source,
        searched
      }
    }
  }

  return {
    path: path.join(globalDir, "opencode.json"),
    source: "global-default",
    searched
  }
}

export function validateConfigSchemaCompatibility(input: unknown): ValidateConfigResult {
  if (!isRecord(input)) {
    return {
      kind: "invalid",
      reason: "config_not_object",
      message: "Expected top-level JSON object in OpenCode config."
    }
  }

  const schema = input.$schema
  if (schema !== undefined && typeof schema !== "string") {
    return {
      kind: "invalid",
      reason: "schema_not_string",
      message: "If present, '$schema' must be a string."
    }
  }

  const plugin = input.plugin
  if (plugin !== undefined) {
    if (!Array.isArray(plugin)) {
      return {
        kind: "invalid",
        reason: "plugin_not_array",
        message: "'plugin' must be an array of plugin specifier strings."
      }
    }

    const hasInvalidPluginItem = plugin.some((item) => typeof item !== "string")
    if (hasInvalidPluginItem) {
      return {
        kind: "invalid",
        reason: "plugin_item_not_string",
        message: "Every 'plugin' entry must be a string."
      }
    }
  }

  return {
    kind: "valid",
    config: input as OpenCodeConfigShape
  }
}

export function parseConfigByExtension(content: string, filePath: string):
  | { kind: "parsed"; value: unknown }
  | { kind: "invalid"; reason: string; message: string } {
  if (filePath.endsWith(".jsonc")) {
    const errors: ParseError[] = []
    const value = parseJsonc(content, errors)
    if (errors.length > 0) {
      const first = errors[0]!
      return {
        kind: "invalid",
        reason: "invalid_jsonc",
        message: `Invalid JSONC syntax: ${printParseErrorCode(first.error)} at offset ${first.offset}.`
      }
    }

    return { kind: "parsed", value }
  }

  try {
    return { kind: "parsed", value: JSON.parse(content) as unknown }
  } catch {
    return {
      kind: "invalid",
      reason: "invalid_json",
      message: "Invalid JSON syntax in config file."
    }
  }
}

export async function readAndValidateConfigSchema(filePath: string): Promise<ReadAndValidateConfigResult> {
  let content: string
  try {
    content = await readFile(filePath, "utf8")
  } catch {
    return {
      kind: "invalid",
      path: filePath,
      reason: "read_failed",
      message: `Could not read config file at '${filePath}'.`
    }
  }

  const parsed = parseConfigByExtension(content, filePath)
  if (parsed.kind === "invalid") {
    return {
      kind: "invalid",
      path: filePath,
      reason: parsed.reason,
      message: parsed.message
    }
  }

  const validated = validateConfigSchemaCompatibility(parsed.value)
  if (validated.kind === "invalid") {
    return {
      kind: "invalid",
      path: filePath,
      reason: validated.reason,
      message: validated.message
    }
  }

  return {
    kind: "valid",
    path: filePath,
    config: validated.config
  }
}
