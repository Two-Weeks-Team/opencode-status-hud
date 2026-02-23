/**
 * Live smoke test for Anthropic Usage API.
 * Run: npx tsx tests/live/smoke-fetch.ts
 * Requires real credentials (macOS Keychain or env). NOT in automated suite.
 */

import { resolveAuthToken } from "../../src/auth-resolver.js"
import { fetchClaudeUsage } from "../../src/fetch-claude.js"

async function main() {
  console.log("=== Live Smoke Test: Anthropic Usage API ===\n")

  console.log("[1] Resolving auth token...")
  const token = await resolveAuthToken(undefined)

  if (!token) {
    console.error("FAIL: No auth token found. Check keychain or env vars.")
    process.exit(1)
  }

  console.log(`  Auth: ${token.source} (${token.kind})`)
  console.log(`  Token prefix: ${token.token.slice(0, 15)}...`)

  console.log("\n[2] Fetching usage from Anthropic API...")
  const snapshot = await fetchClaudeUsage({ token })

  if (snapshot.error) {
    console.error(`  FAIL: API returned error: ${snapshot.error}`)
    console.log(`  Provider: ${snapshot.provider}`)
    console.log(`  FetchedAt: ${new Date(snapshot.fetchedAtMs).toISOString()}`)
    process.exit(1)
  }

  console.log(`  Provider: ${snapshot.provider}`)
  console.log(`  FetchedAt: ${new Date(snapshot.fetchedAtMs).toISOString()}`)
  console.log(`  Windows: ${snapshot.windows.length}`)

  for (const w of snapshot.windows) {
    const resetStr = w.resetAtMs
      ? `resets_at=${new Date(w.resetAtMs).toISOString()}`
      : "no reset time"
    console.log(`    ${w.label}: ${w.usedPercent}% ${resetStr}`)
  }

  if (snapshot.extraUsage) {
    const extra = snapshot.extraUsage
    console.log(`  Extra Usage: enabled=${extra.enabled}, used=$${(extra.usedCents / 100).toFixed(2)}/${(extra.monthlyLimitCents / 100).toFixed(2)} ${extra.currency}`)
  }

  console.log("\n[3] Validation...")
  const has5h = snapshot.windows.some(w => w.label === "5h")
  const has7d = snapshot.windows.some(w => w.label === "7d")

  console.log(`  Has 5h window: ${has5h ? "YES" : "NO"}`)
  console.log(`  Has 7d window: ${has7d ? "YES" : "NO"}`)

  if (has5h && has7d) {
    console.log("\n=== PASS: Live smoke test succeeded ===")
  } else {
    console.log("\n=== WARN: Missing windows (may be normal for some accounts) ===")
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
