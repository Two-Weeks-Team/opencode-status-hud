import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"

export interface OpenCodeAuthEntry {
  type: "oauth" | "api" | "wellknown"
  access?: string | undefined
  refresh?: string | undefined
  expires?: number | undefined
  accountId?: string | undefined
  key?: string | undefined
  token?: string | undefined
  enterpriseUrl?: string | undefined
}

export interface OpenCodeAuthReaderOptions {
  readFileFn?: ((path: string, encoding: BufferEncoding) => Promise<string>) | undefined
  env?: NodeJS.ProcessEnv | undefined
  platform?: string | undefined
}

export function resolveOpenCodeDataDir(
  env?: NodeJS.ProcessEnv,
  platform?: string
): string {
  const e = env ?? process.env
  const p = platform ?? process.platform

  if (e.XDG_DATA_HOME) {
    return join(e.XDG_DATA_HOME, "opencode")
  }

  if (p === "win32" && e.LOCALAPPDATA) {
    return join(e.LOCALAPPDATA, "opencode")
  }

  return join(homedir(), ".local", "share", "opencode")
}

export async function readOpenCodeAuth(
  providerKey: string,
  options?: OpenCodeAuthReaderOptions
): Promise<OpenCodeAuthEntry | null> {
  const read = options?.readFileFn ?? readFile
  const dataDir = resolveOpenCodeDataDir(options?.env, options?.platform)
  const authJsonPath = join(dataDir, "auth.json")

  let content: string
  try {
    content = await read(authJsonPath, "utf-8")
  } catch {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null
  }

  const entry = (parsed as Record<string, unknown>)[providerKey]
  if (typeof entry !== "object" || entry === null) {
    return null
  }

  const data = entry as Record<string, unknown>
  const entryType = data.type
  if (entryType !== "oauth" && entryType !== "api" && entryType !== "wellknown") {
    return null
  }

  return {
    type: entryType,
    access: typeof data.access === "string" ? data.access : undefined,
    refresh: typeof data.refresh === "string" ? data.refresh : undefined,
    expires: typeof data.expires === "number" ? data.expires : undefined,
    accountId: typeof data.accountId === "string" ? data.accountId : undefined,
    key: typeof data.key === "string" ? data.key : undefined,
    token: typeof data.token === "string" ? data.token : undefined,
    enterpriseUrl: typeof data.enterpriseUrl === "string" ? data.enterpriseUrl : undefined,
  }
}
