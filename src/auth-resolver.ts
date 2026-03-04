/**
 * Auth Resolver - Credential auto-detection following priority chain
 *
 * Priority (first match wins):
 * 1. macOS Keychain (darwin only)
 * 2. ~/.claude/.credentials.json
 * 3. Env ANTHROPIC_OAUTH_TOKEN
 * 4. Env CLAUDE_AI_SESSION_KEY or CLAUDE_WEB_SESSION_KEY
 * 5. Env CLAUDE_WEB_COOKIE (parse sessionKey)
 * 6. ~/.claude-session-key file
 *
 * Returns null if no credentials found. Never throws.
 * Token values are never logged or included in error messages.
 */

import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { promisify } from "node:util"
import type { ResolvedAuthToken, AuthTokenSource } from "./provider-usage.types.js"
import { readOpenCodeAuth } from "./opencode-auth.js"

const execFileAsync = promisify(execFile)

export interface ExecFileFn {
  (file: string, args: string[], options?: { encoding?: BufferEncoding | null }): Promise<{ stdout: string; stderr: string }>
}

export interface ReadFileFn {
  (path: string, encoding: BufferEncoding): Promise<string>
}

export interface AuthResolverOptions {
  execFileFn?: ExecFileFn | undefined
  readFileFn?: ReadFileFn | undefined
  env?: NodeJS.ProcessEnv | undefined
  platform?: string | undefined
}

/**
 * Parse keychain JSON output to extract OAuth access token.
 * Expected format: { "claudeAiOauth": { "accessToken": "sk-ant-oat01-..." } }
 */
function parseKeychainJson(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw) as unknown
    if (typeof parsed !== "object" || parsed === null) return null
    if (!("claudeAiOauth" in parsed)) return null
    const oauth = (parsed as { claudeAiOauth: unknown }).claudeAiOauth
    if (typeof oauth !== "object" || oauth === null) return null
    if (!("accessToken" in oauth)) return null
    const token = (oauth as { accessToken: unknown }).accessToken
    return typeof token === "string" && token.length > 0 ? token : null
  } catch {
    return null
  }
}

/**
 * Check if a token string is non-empty (not empty or whitespace-only).
 */
function isNonEmptyToken(token: string | null | undefined): token is string {
  return typeof token === "string" && token.trim().length > 0
}

/**
 * Extract sessionKey from cookie string.
 * Looks for pattern: sessionKey=sk-ant-sid01-... followed by semicolon or end.
 */
function extractSessionKeyFromCookie(cookieString: string): string | null {
  const match = /sessionKey=([^;]+)/.exec(cookieString)
  const token = match?.[1]
  return isNonEmptyToken(token) ? token.trim() : null
}

/**
 * Resolve auth token from macOS Keychain.
 * Only runs on darwin platform.
 */
async function resolveFromKeychain(
  options: AuthResolverOptions,
): Promise<{ token: string; source: AuthTokenSource } | null> {
  const platform = options.platform ?? process.platform
  if (platform !== "darwin") return null

  const exec = options.execFileFn ?? execFileAsync

  try {
    const { stdout } = await exec(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { encoding: "utf8" },
    )
    const token = parseKeychainJson(stdout)
    if (isNonEmptyToken(token)) {
      return { token, source: "keychain" }
    }
  } catch {
    // Keychain access failed or no entry found - continue to next source
  }
  return null
}

/**
 * Resolve auth token from ~/.claude/.credentials.json file.
 */
async function resolveFromCredentialsFile(
  options: AuthResolverOptions,
): Promise<{ token: string; source: AuthTokenSource } | null> {
  const read = options.readFileFn ?? readFile
  const credentialsPath = join(homedir(), ".claude", ".credentials.json")

  try {
    const content = await read(credentialsPath, "utf-8")
    const token = parseKeychainJson(content)
    if (isNonEmptyToken(token)) {
      return { token, source: "credentials-file" }
    }
  } catch {
    // File not found or unreadable - continue to next source
  }
  return null
}

/**
 * Resolve auth token from ANTHROPIC_OAUTH_TOKEN environment variable.
 */
function resolveFromEnvOauth(options: AuthResolverOptions): { token: string; source: AuthTokenSource } | null {
  const env = options.env ?? process.env
  const token = env.ANTHROPIC_OAUTH_TOKEN

  if (isNonEmptyToken(token)) {
    return { token, source: "env-oauth" }
  }
  return null
}

/**
 * Resolve auth token from CLAUDE_AI_SESSION_KEY or CLAUDE_WEB_SESSION_KEY
 * environment variables.
 */
function resolveFromEnvSession(options: AuthResolverOptions): { token: string; source: AuthTokenSource } | null {
  const env = options.env ?? process.env
  const token = env.CLAUDE_AI_SESSION_KEY ?? env.CLAUDE_WEB_SESSION_KEY

  if (isNonEmptyToken(token)) {
    return { token, source: "env-session" }
  }
  return null
}

/**
 * Resolve auth token from CLAUDE_WEB_COOKIE environment variable.
 * Parses the cookie string to extract sessionKey.
 */
function resolveFromEnvCookie(options: AuthResolverOptions): { token: string; source: AuthTokenSource } | null {
  const env = options.env ?? process.env
  const cookieString = env.CLAUDE_WEB_COOKIE

  if (typeof cookieString !== "string" || cookieString.length === 0) {
    return null
  }

  const token = extractSessionKeyFromCookie(cookieString)
  if (token !== null) {
    return { token, source: "env-cookie" }
  }
  return null
}

/**
 * Resolve auth token from ~/.claude-session-key file.
 */
async function resolveFromSessionKeyFile(
  options: AuthResolverOptions,
): Promise<{ token: string; source: AuthTokenSource } | null> {
  const read = options.readFileFn ?? readFile
  const sessionKeyPath = join(homedir(), ".claude-session-key")

  try {
    const content = await read(sessionKeyPath, "utf-8")
    const token = content.trim()
    if (isNonEmptyToken(token)) {
      return { token, source: "session-key-file" }
    }
  } catch {
    // File not found or unreadable - continue to next source
  }
  return null
}

/**
 * Resolve authentication token using priority chain.
 * Returns null if no credentials found. Never throws.
 *
 * Priority order:
 * 1. macOS Keychain (darwin only)
 * 2. ~/.claude/.credentials.json
 * 3. Env ANTHROPIC_OAUTH_TOKEN
 * 4. Env CLAUDE_AI_SESSION_KEY or CLAUDE_WEB_SESSION_KEY
 * 5. Env CLAUDE_WEB_COOKIE
 * 6. ~/.claude-session-key file
 */
export async function resolveAuthToken(
  options: AuthResolverOptions | undefined,
): Promise<ResolvedAuthToken | null> {
  const opts: AuthResolverOptions = options ?? {}

  const ocEntry = await readOpenCodeAuth("anthropic", {
    readFileFn: opts.readFileFn,
    env: opts.env ?? undefined,
    platform: opts.platform ?? undefined,
  })
  if (ocEntry !== null) {
    if (ocEntry.type === "oauth" && typeof ocEntry.access === "string" && ocEntry.access.length > 0) {
      return { token: ocEntry.access, source: "opencode-auth", kind: "oauth" }
    }
    if (ocEntry.type === "api" && typeof ocEntry.key === "string" && ocEntry.key.length > 0) {
      return { token: ocEntry.key, source: "opencode-auth", kind: "oauth" }
    }
  }

  const keychainResult = await resolveFromKeychain(opts)
  if (keychainResult !== null) {
    return {
      token: keychainResult.token,
      source: keychainResult.source,
      kind: "oauth",
    }
  }

  // Priority 2: ~/.claude/.credentials.json
  const credentialsFileResult = await resolveFromCredentialsFile(opts)
  if (credentialsFileResult !== null) {
    return {
      token: credentialsFileResult.token,
      source: credentialsFileResult.source,
      kind: "oauth",
    }
  }

  // Priority 3: Env ANTHROPIC_OAUTH_TOKEN
  const envOauthResult = resolveFromEnvOauth(opts)
  if (envOauthResult !== null) {
    return {
      token: envOauthResult.token,
      source: envOauthResult.source,
      kind: "oauth",
    }
  }

  // Priority 4: Env CLAUDE_AI_SESSION_KEY or CLAUDE_WEB_SESSION_KEY
  const envSessionResult = resolveFromEnvSession(opts)
  if (envSessionResult !== null) {
    return {
      token: envSessionResult.token,
      source: envSessionResult.source,
      kind: "session",
    }
  }

  // Priority 5: Env CLAUDE_WEB_COOKIE
  const envCookieResult = resolveFromEnvCookie(opts)
  if (envCookieResult !== null) {
    return {
      token: envCookieResult.token,
      source: envCookieResult.source,
      kind: "session",
    }
  }

  // Priority 6: ~/.claude-session-key file
  const sessionKeyFileResult = await resolveFromSessionKeyFile(opts)
  if (sessionKeyFileResult !== null) {
    return {
      token: sessionKeyFileResult.token,
      source: sessionKeyFileResult.source,
      kind: "session",
    }
  }

  // No credentials found
  return null
}
