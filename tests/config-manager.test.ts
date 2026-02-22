import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  readAndValidateConfigSchema,
  resolveConfigPath,
  validateConfigSchemaCompatibility
} from "../src/cli/config-manager.js"

const tempRoots: string[] = []

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
  tempRoots.push(dir)
  return dir
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop()
    if (!dir) {
      continue
    }
    await rm(dir, { recursive: true, force: true })
  }
})

describe("resolveConfigPath", () => {
  it("prefers OPENCODE_CONFIG when explicitly set", async () => {
    const root = await createTempDir("hud-config-manager-")
    const explicit = path.join(root, "custom-opencode.json")

    const result = await resolveConfigPath({
      cwd: root,
      env: { OPENCODE_CONFIG: explicit }
    })

    expect(result.path).toBe(explicit)
    expect(result.source).toBe("env:OPENCODE_CONFIG")
  })

  it("resolves project opencode.jsonc before opencode.json", async () => {
    const root = await createTempDir("hud-config-manager-")
    const jsonc = path.join(root, "opencode.jsonc")
    const json = path.join(root, "opencode.json")
    await writeFile(json, "{}", "utf8")
    await writeFile(jsonc, "{}", "utf8")

    const result = await resolveConfigPath({ cwd: root, env: {} })

    expect(result.path).toBe(jsonc)
    expect(result.source).toBe("project")
  })

  it("uses OPENCODE_CONFIG_DIR candidates when project files do not exist", async () => {
    const root = await createTempDir("hud-config-manager-")
    const configDir = await createTempDir("hud-config-dir-")
    const json = path.join(configDir, "opencode.json")
    await writeFile(json, "{}", "utf8")

    const result = await resolveConfigPath({
      cwd: root,
      env: { OPENCODE_CONFIG_DIR: configDir }
    })

    expect(result.path).toBe(json)
    expect(result.source).toBe("env:OPENCODE_CONFIG_DIR")
  })

  it("falls back to global default path when no config file exists", async () => {
    const root = await createTempDir("hud-config-manager-")
    const fakeHome = await createTempDir("hud-home-")

    const result = await resolveConfigPath({
      cwd: root,
      env: {},
      homeDir: fakeHome,
      platform: "darwin"
    })

    expect(result.source).toBe("global-default")
    expect(result.path).toBe(path.join(fakeHome, ".config", "opencode", "opencode.json"))
  })
})

describe("validateConfigSchemaCompatibility", () => {
  it("accepts object configs with plugin string arrays", () => {
    const result = validateConfigSchemaCompatibility({
      $schema: "https://opencode.ai/config.json",
      plugin: ["opencode-status-hud"]
    })

    expect(result.kind).toBe("valid")
  })

  it("rejects plugin values when not an array", () => {
    const result = validateConfigSchemaCompatibility({
      plugin: "opencode-status-hud"
    })

    expect(result).toEqual({
      kind: "invalid",
      reason: "plugin_not_array",
      message: "'plugin' must be an array of plugin specifier strings."
    })
  })

  it("rejects plugin array entries that are not strings", () => {
    const result = validateConfigSchemaCompatibility({
      plugin: ["ok", 1]
    })

    expect(result).toEqual({
      kind: "invalid",
      reason: "plugin_item_not_string",
      message: "Every 'plugin' entry must be a string."
    })
  })
})

describe("readAndValidateConfigSchema", () => {
  it("parses and validates JSONC config files", async () => {
    const root = await createTempDir("hud-config-manager-")
    const file = path.join(root, "opencode.jsonc")
    await writeFile(file, '{\n  // comment\n  "plugin": ["opencode-status-hud"]\n}\n', "utf8")

    const result = await readAndValidateConfigSchema(file)

    expect(result.kind).toBe("valid")
  })

  it("fails safely on malformed JSON with actionable reason", async () => {
    const root = await createTempDir("hud-config-manager-")
    const file = path.join(root, "opencode.json")
    await writeFile(file, '{"plugin": [}', "utf8")

    const result = await readAndValidateConfigSchema(file)

    expect(result.kind).toBe("invalid")
    if (result.kind === "invalid") {
      expect(result.reason).toBe("invalid_json")
    }
  })

  it("fails safely when target path cannot be read", async () => {
    const root = await createTempDir("hud-config-manager-")
    const dirPath = path.join(root, "blocked")
    await mkdir(dirPath)

    const result = await readAndValidateConfigSchema(dirPath)

    expect(result.kind).toBe("invalid")
    if (result.kind === "invalid") {
      expect(result.reason).toBe("read_failed")
    }
  })
})
