import path from "node:path"

import { resolveConfigPath } from "./config-manager.js"
import { installHudPluginTransaction } from "./install-transaction.js"
import { uninstallHudPluginTransaction } from "./uninstall-transaction.js"

type CliCommand = "install" | "uninstall" | "resolve-config"

interface CliOptions {
  configPath?: string
  backupPath?: string
  pluginSpecifier?: string
}

function printHelp(): void {
  console.log(`opencode-status-hud CLI

Usage:
  opencode-status-hud <command> [options]

Commands:
  install          Install HUD plugin into OpenCode config
  uninstall        Uninstall HUD plugin from OpenCode config
  resolve-config   Print detected OpenCode config path

Options:
  --config <path>  Override target config path
  --backup <path>  Override backup file path
  --plugin <name>  Override plugin specifier (default: opencode-status-hud)
  -h, --help       Show this help
`)
}

function parseArgv(argv: string[]): { command: CliCommand; options: CliOptions } | null {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    return null
  }

  const command = argv[0]
  if (command !== "install" && command !== "uninstall" && command !== "resolve-config") {
    return null
  }

  const options: CliOptions = {}
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]
    if ((token === "--config" || token === "--backup" || token === "--plugin") && index + 1 < argv.length) {
      const value = argv[index + 1]!
      if (token === "--config") {
        options.configPath = value
      } else if (token === "--backup") {
        options.backupPath = value
      } else {
        options.pluginSpecifier = value
      }
      index += 1
      continue
    }
  }

  return {
    command,
    options
  }
}

async function resolveTargetConfigPath(override?: string): Promise<string> {
  if (override) {
    return path.resolve(override)
  }

  const resolved = await resolveConfigPath()
  return resolved.path
}

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgv(argv)
  if (!parsed) {
    printHelp()
    return 1
  }

  if (parsed.command === "resolve-config") {
    const configPath = await resolveTargetConfigPath(parsed.options.configPath)
    console.log(configPath)
    return 0
  }

  const configPath = await resolveTargetConfigPath(parsed.options.configPath)

  if (parsed.command === "install") {
    const installOptions: Parameters<typeof installHudPluginTransaction>[0] = { configPath }
    if (parsed.options.backupPath) {
      installOptions.backupPath = parsed.options.backupPath
    }
    if (parsed.options.pluginSpecifier) {
      installOptions.pluginSpecifier = parsed.options.pluginSpecifier
    }

    const result = await installHudPluginTransaction(installOptions)

    if (result.kind === "failed") {
      console.error(`install failed: ${result.message}`)
      return 1
    }

    console.log(result.changed ? `installed: ${result.path}` : `already installed: ${result.path}`)
    if (result.backupPath) {
      console.log(`backup: ${result.backupPath}`)
    }
    return 0
  }

  const uninstallOptions: Parameters<typeof uninstallHudPluginTransaction>[0] = { configPath }
  if (parsed.options.backupPath) {
    uninstallOptions.backupPath = parsed.options.backupPath
  }
  if (parsed.options.pluginSpecifier) {
    uninstallOptions.pluginSpecifier = parsed.options.pluginSpecifier
  }

  const result = await uninstallHudPluginTransaction(uninstallOptions)

  if (result.kind === "failed") {
    console.error(`uninstall failed: ${result.message}`)
    return 1
  }

  console.log(result.changed ? `uninstalled: ${result.path}` : `already uninstalled: ${result.path}`)
  if (result.backupPath) {
    console.log(`backup: ${result.backupPath}`)
  }
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().then((exitCode) => {
    process.exit(exitCode)
  })
}
