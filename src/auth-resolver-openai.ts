/**
 * OpenAI Auth Resolver - Credential auto-detection for OpenAI Codex
 *
 * Priority (first match wins):
 * 1. $CODEX_HOME/auth.json (if CODEX_HOME set)
 * 2. ~/.codex/auth.json
 *
 * Supports two auth modes:
 * - JWT OAuth: tokens.access_token + tokens.account_id
 * - API Key: OPENAI_API_KEY field (NOTE: won't work for usage endpoint)
 *
 * Returns null if no credentials found. Never throws.
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import type { ResolvedOpenAIAuthToken } from "./provider-usage.types.js"

export interface ReadFileFn {
  (path: string, encoding: BufferEncoding): Promise<string>
}

export interface OpenAIAuthResolverOptions {
  readFileFn?: ReadFileFn | undefined
  env?: NodeJS.ProcessEnv | undefined
}

/**
 * Check if a token string is non-empty (not empty or whitespace-only).
 */
function isNonEmptyToken(token: string | null | undefined): token is string {
  return typeof token === "string" && token.trim().length > 0
}

/**
 * Parse the auth.json file and extract credentials.
 * Returns null if file not found, invalid JSON, or no credentials.
 */
async function resolveFromAuthJson(
  options: OpenAIAuthResolverOptions
): Promise<ResolvedOpenAIAuthToken | null> {
  const env = options.env ?? process.env
  const read = options.readFileFn ?? readFile

  const authJsonPath = env.CODEX_HOME
    ? join(env.CODEX_HOME, "auth.json")
    : join(homedir(), ".codex", "auth.json")

  let content: string
  try {
    content = await read(authJsonPath, "utf-8")
  } catch {
    // File not found or unreadable
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    // Invalid JSON
    return null
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null
  }

  const data = parsed as Record<string, unknown>

  // Check for JWT tokens (priority)
  const tokens = data.tokens
  if (typeof tokens === "object" && tokens !== null) {
    const tokenData = tokens as Record<string, unknown>
    const accessToken = tokenData.access_token
    if (typeof accessToken === "string" && isNonEmptyToken(accessToken)) {
      const accountId = tokenData.account_id
      const refreshToken = tokenData.refresh_token
      return {
        accessToken: accessToken.trim(),
        accountId: typeof accountId === "string" && isNonEmptyToken(accountId) ? accountId.trim() : undefined,
        refreshToken: typeof refreshToken === "string" && isNonEmptyToken(refreshToken) ? refreshToken.trim() : undefined,
        source: "codex-auth-file",
        kind: "jwt"
      }
    }
  }

  // Check for API key (fallback)
  const apiKey = data.OPENAI_API_KEY
  if (typeof apiKey === "string" && isNonEmptyToken(apiKey)) {
    return {
      accessToken: apiKey.trim(),
      source: "codex-auth-file",
      kind: "api-key"
    }
  }

  // No valid credentials found
  return null
}

/**
 * Resolve OpenAI authentication token.
 * Returns null if no credentials found. Never throws.
 */
export async function resolveOpenAIAuthToken(
  options?: OpenAIAuthResolverOptions
): Promise<ResolvedOpenAIAuthToken | null> {
  const opts: OpenAIAuthResolverOptions = options ?? {}

  return resolveFromAuthJson(opts)
}
