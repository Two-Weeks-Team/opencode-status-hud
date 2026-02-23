import path from "node:path"
import { fileURLToPath } from "node:url"

import { resolveConfigPath, resolveGlobalPluginDir } from "./config-manager.js"
import { installHudPluginTransaction } from "./install-transaction.js"
import { installLocalHudPluginTransaction, uninstallLocalHudPluginTransaction } from "./local-plugin-transaction.js"
import { uninstallHudPluginTransaction } from "./uninstall-transaction.js"

type CliCommand = "install" | "uninstall" | "resolve-config"
type InstallMode = "local" | "config"

interface CliOptions {
  configPath?: string
  backupPath?: string
  pluginSpecifier?: string
  mode?: InstallMode
  pluginDir?: string
}

const DEFAULT_INSTALL_MODE: InstallMode = "local"
const HUD_PLUGIN_ENTRY = fileURLToPath(new URL("../index.js", import.meta.url))

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
  --mode <type>    Install mode: local|config (default: local)
  --plugin-dir <path>  Override plugin directory for local mode
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
    if (
      (token === "--config" || token === "--backup" || token === "--plugin" || token === "--mode" || token === "--plugin-dir") &&
      index + 1 < argv.length
    ) {
      const value = argv[index + 1]!
      if (token === "--config") {
        options.configPath = value
      } else if (token === "--backup") {
        options.backupPath = value
      } else if (token === "--plugin") {
        options.pluginSpecifier = value
      } else if (token === "--mode") {
        if (value === "local" || value === "config") {
          options.mode = value
        }
      } else {
        options.pluginDir = value
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

function resolveInstallMode(mode?: InstallMode): InstallMode {
  return mode ?? DEFAULT_INSTALL_MODE
}

function resolveTargetPluginDir(parsed: { options: CliOptions }): string {
  if (parsed.options.pluginDir) {
    return path.resolve(parsed.options.pluginDir)
  }

  return resolveGlobalPluginDir()
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
  const mode = resolveInstallMode(parsed.options.mode)

  if (parsed.command === "install") {
    if (mode === "local") {
      const result = await installLocalHudPluginTransaction({
        pluginDirectory: resolveTargetPluginDir(parsed),
        pluginEntryPath: HUD_PLUGIN_ENTRY
      })

      if (result.kind === "failed") {
        console.error(`install failed: ${result.message}`)
        return 1
      }

      console.log(result.changed ? `installed local plugin: ${result.pluginPath}` : `already installed local plugin: ${result.pluginPath}`)
      return 0
    }

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

    console.log(result.changed ? `installed config plugin: ${result.path}` : `already installed config plugin: ${result.path}`)
    if (result.backupPath) {
      console.log(`backup: ${result.backupPath}`)
    }
    return 0
  }

  if (mode === "local") {
    const result = await uninstallLocalHudPluginTransaction({
      pluginDirectory: resolveTargetPluginDir(parsed)
    })

    if (result.kind === "failed") {
      console.error(`uninstall failed: ${result.message}`)
      return 1
    }

    console.log(result.changed ? `uninstalled local plugin: ${result.pluginPath}` : `already uninstalled local plugin: ${result.pluginPath}`)
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

  console.log(result.changed ? `uninstalled config plugin: ${result.path}` : `already uninstalled config plugin: ${result.path}`)
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
