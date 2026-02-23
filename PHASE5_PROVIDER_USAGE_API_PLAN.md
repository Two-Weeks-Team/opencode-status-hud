# Phase 5: Real Provider Usage API Integration — Implementation Plan

**Generated:** 2026-02-23  
**Status:** Planning  
**Depends on:** Phase 0-4 complete (128 tests, typecheck clean, build clean)  
**Issues:** #41 – #51

---

## Executive Summary

Replace self-calculated approximate `~%` usage values in the HUD strip with **real Anthropic Usage API data**. The current HUD renders:

```
Opus | ██░░░░░░░░░░ | 13% | 27K/200K | $0.00 | 5h: ~4% (15m) | 7d: ~1% (5d 19h)
```

After Phase 5, with real API data available:

```
Opus | ██░░░░░░░░░░ | 13% | 27K/200K | $0.00 | 5h: 2% (4h 22m) | 7d: 1% (Mon 14:00)
```

Key changes: `~%` becomes `%` (real), remaining time becomes `resets_at`-derived.

---

## Confirmed API Contract

### Primary: OAuth Usage API
```
GET https://api.anthropic.com/api/oauth/usage
Headers:
  Authorization: Bearer <sk-ant-oat01-*>
  anthropic-beta: oauth-2025-04-20
  Accept: application/json

Response:
{
  five_hour?: { utilization?: number; resets_at?: string }
  seven_day?: { utilization?: number; resets_at?: string }
  seven_day_sonnet?: { utilization?: number }
  seven_day_opus?: { utilization?: number }
  extra_usage?: { is_enabled?: boolean; monthly_limit?: number; used_credits?: number; utilization?: number; currency?: string }
}
```

### Fallback: Claude.ai Web API (when OAuth returns 403 scope error)
```
GET https://claude.ai/api/organizations  → [{ uuid: "org-id" }]
GET https://claude.ai/api/organizations/{orgId}/usage  → same response schema
Auth: Cookie: sessionKey=sk-ant-sid01-*
```

### Confirmed Auth Chain (first match wins)
1. macOS Keychain "Claude Code-credentials" → `claudeAiOauth.accessToken` (sk-ant-oat01-*)
2. ~/.claude/.credentials.json → same JSON structure
3. Env: ANTHROPIC_OAUTH_TOKEN
4. Env: CLAUDE_AI_SESSION_KEY / CLAUDE_WEB_SESSION_KEY
5. Env: CLAUDE_WEB_COOKIE → parse sessionKey
6. ~/.claude-session-key file

---

## Architecture Decision Record

### New Modules (6 files)

| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `src/provider-usage.types.ts` | API response types, UsageWindow, ProviderUsageSnapshot, AuthToken | ~60 |
| `src/auth-resolver.ts` | Credential chain: Keychain → file → env | ~120 |
| `src/fetch-utils.ts` | fetchJson with AbortController, error snapshot builder, clampPercent | ~70 |
| `src/fetch-claude.ts` | Claude OAuth + Web API fallback fetcher | ~150 |
| `src/polling-manager.ts` | Interval poller with backoff, cache-aside | ~130 |
| *(modified)* `src/plugin.ts` | `buildAssistantUsageLine` + `createHudPluginHooks` integration | ~+60 delta |

### New Test Files (5 files)

| File | Coverage target |
|------|----------------|
| `tests/provider-usage-types.test.ts` | Type guards, clampPercent, window builders |
| `tests/auth-resolver.test.ts` | Chain priority, parse errors, fallback |
| `tests/fetch-claude.test.ts` | OAuth success, 403→Web fallback, timeout, error snapshots |
| `tests/polling-manager.test.ts` | Interval, backoff, cache-aside, dispose |
| `tests/plugin-api-usage.test.ts` | HUD strip with/without API data, integration |

### Design Constraints

1. **No new runtime dependencies** — uses Node 22 native `fetch`, `child_process.execFile` for keychain
2. **ESM-only** with `.js` import extensions per existing convention
3. **strict: true, noUncheckedIndexedAccess, exactOptionalPropertyTypes** compliance
4. **Zero breaking changes** — existing 128 tests must remain green
5. **Graceful degradation** — if API unavailable, falls back to existing `~%` self-calculation

---

## Issue Breakdown

### Phase 5A — Foundation (Types + Auth)

#### P5-1 Provider usage type definitions and utility functions
**Issue [#41](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/41)** | Size: **S** | Labels: `phase:5`, `type:design`, `priority:high`

Define TypeScript types for the Anthropic Usage API contract and internal snapshot model. Foundational type layer for all Phase 5 modules.

**New file:** `src/provider-usage.types.ts`

Types: `AnthropicUsageApiResponse`, `UsageWindow`, `ProviderUsageSnapshot`, `AuthTokenSource`, `ResolvedAuthToken`  
Utils: `clampPercent()`, `parseResetsAt()`, `isUsageApiResponse()`, `buildUsageWindows()`

**Acceptance Criteria:**
- All types compile under strict + exactOptionalPropertyTypes
- `clampPercent` handles NaN, Infinity, negative, >100
- `parseResetsAt` handles valid ISO, invalid string, undefined
- `buildUsageWindows` correctly maps all window variants
- Unit tests (~10 cases)

**Dependencies:** None

---

#### P5-2 Credential resolver chain with auto-detection
**Issue [#42](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/42)** | Size: **M** | Labels: `phase:5`, `type:backend`, `priority:high`

Implement credential auto-detection following the confirmed auth chain. Users must not configure env vars.

**New file:** `src/auth-resolver.ts`

Auth chain: Keychain → credentials.json → env OAuth → env session → env cookie → session-key file.  
Interface: `resolveAuthToken(options?): Promise<ResolvedAuthToken | null>` with DI for testing.

**Acceptance Criteria:**
- Keychain path works (mock `execFile`)
- Credentials file path works (mock `readFile`)
- Env var paths work for all variants
- Returns `null` when no credentials (no throw)
- Token values never in error messages
- Platform-guards keychain to darwin
- Unit tests (~12 cases)

**Dependencies:** P5-1

---

### Phase 5B — Fetch Layer

#### P5-3 HTTP fetch utility with AbortController timeout
**Issue [#43](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/43)** | Size: **S** | Labels: `phase:5`, `type:backend`, `priority:high`

Reusable fetch wrapper with timeout via AbortController. Node 22 native fetch — no deps.

**New file:** `src/fetch-utils.ts`

Functions: `fetchJson()` with DI, `buildErrorSnapshot()`

**Acceptance Criteria:**
- Timeout aborts after configured ms
- AbortController cleanup prevents timer leak
- Network errors produce structured result (no throws)
- JSON parse errors handled gracefully
- Unit tests (~8 cases)

**Dependencies:** P5-1

---

#### P5-4 Claude usage fetcher with OAuth + Web API fallback
**Issue [#44](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/44)** | Size: **M** | Labels: `phase:5`, `type:backend`, `priority:high`

Core fetcher: Anthropic OAuth API primary, Claude.ai Web API fallback on 403 scope error.

**New file:** `src/fetch-claude.ts`

Interface: `fetchClaudeUsage(options): Promise<ProviderUsageSnapshot>`

Logic: OAuth path (200/401/403) → Web API fallback (org list → usage) → extra usage rescaling.

**Acceptance Criteria:**
- OAuth 200 returns valid snapshot
- 403 scope error triggers Web API fallback
- 401 returns structured error snapshot
- Web API resolves org UUID then fetches usage
- Extra usage rescaling for inflated values
- Unit tests (~15 cases)

**Dependencies:** P5-1, P5-3

---

### Phase 5C — Orchestration

#### P5-5 Usage polling manager with exponential backoff
**Issue [#45](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/45)** | Size: **M** | Labels: `phase:5`, `type:runtime`, `priority:high`

Periodic poller with backoff, cache-aside pattern.

**New file:** `src/polling-manager.ts`

Interface: `createPollingManager(options): PollingManager` with `start/stop/latest/forceRefresh/isRunning`.

Behavior: 60s default interval, exponential backoff on error (cap 5min), immediate fetch on start, `unref()` interval.

**Acceptance Criteria:**
- Polls at configured interval
- Exponential backoff on consecutive errors
- Resets on success after backoff
- `forceRefresh()` fetches immediately
- `stop()` clears interval
- Null auth skips gracefully
- Unit tests with fake timers (~12 cases)

**Dependencies:** P5-2, P5-4

---

#### P5-6 Disk cache v2 schema with provider usage snapshot
**Issue [#46](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/46)** | Size: **S** | Labels: `phase:5`, `type:backend`, `priority:medium`

Extend `DiskCacheData` to v2 with `providerUsage` field. Transparent v1→v2 migration.

**Modified file:** `src/disk-cache.ts`

Migration: v1 loads as v2 with `providerUsage: undefined`. v2 round-trips with snapshot. Unknown versions → null.

**Acceptance Criteria:**
- v1 cache files load and migrate
- v2 cache files load with providerUsage intact
- Existing disk-cache tests pass unchanged
- New migration tests (~5 cases)

**Dependencies:** P5-1

---

### Phase 5D — HUD Integration

#### P5-7 Enhance buildAssistantUsageLine for real API data
**Issue [#47](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/47)** | Size: **M** | Labels: `phase:5`, `type:integration`, `priority:high`

Modify `buildAssistantUsageLine()` to accept optional real API data and prefer it over self-calculated.

**Modified file:** `src/plugin.ts`

Rendering: With API → `5h: 2% (4h 22m) | 7d: 1% (Mon 14:00)`. Without API → `5h: ~4% (15m) | 7d: ~1% (5d 19h)` (unchanged fallback).

New helpers: `formatResetsAtCompact()`, `formatResetsAt7d()`

**Acceptance Criteria:**
- `apiUsage` null/undefined → output unchanged (backward compatible)
- Valid windows → real % without `~`, real reset times
- Error snapshot → falls back to `~%`
- 5h reset as duration, 7d reset as weekday+time
- New tests (~10 cases)

**Dependencies:** P5-1

---

#### P5-8 Wire API polling into plugin lifecycle
**Issue [#48](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/48)** | Size: **L** | Labels: `phase:5`, `type:integration`, `priority:high`

Final integration: connect auth, polling, cache, and HUD rendering in `createHudPluginHooks()`.

**Modified file:** `src/plugin.ts`

Changes: Init polling after cache load, load cached snapshot on startup, pass `pollingManager.latest()` to `buildAssistantUsageLine`, force refresh on first assistant message, cleanup on disposal.

**Acceptance Criteria:**
- Polling starts automatically
- Cached snapshot used on restart
- Fresh data after first poll
- Real `%` when available, `~%` when not
- Disk cache persists snapshot
- All 128 existing tests pass
- Integration tests (~8 cases)

**Dependencies:** P5-2, P5-5, P5-6, P5-7

---

### Phase 5E — Quality Gate

#### P5-9 Unit tests for auth, fetch, and polling modules
**Issue [#49](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/49)** | Size: **M** | Labels: `phase:5`, `type:test`, `priority:high`

Comprehensive unit tests for all new modules with DI mocking.

New test files: `provider-usage-types.test.ts`, `auth-resolver.test.ts`, `fetch-claude.test.ts`, `polling-manager.test.ts`

**Total: ~49 new test cases** → 177+ total

**Dependencies:** P5-2, P5-3, P5-4, P5-5

---

#### P5-10 Integration regression + build gate
**Issue [#50](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/50)** | Size: **M** | Labels: `phase:5`, `type:test`, `priority:high`

E2E integration test + build verification.

New test: `tests/plugin-api-usage.test.ts` — full lifecycle, degraded flow, error recovery, v1→v2 migration.

Build gate: `tsc --noEmit` clean, `vitest run` 177+ pass, `tsc -p tsconfig.build.json` clean.

**Dependencies:** P5-8, P5-9

---

#### P5-11 Live verification with real credentials
**Issue [#51](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/51)** | Size: **M** | Labels: `phase:5`, `type:test`, `priority:high`

Live smoke test with real Keychain credentials and actual API calls.

Steps: Verify keychain → standalone fetch → opencode session → cached restart.

**Dependencies:** P5-10

---

## Dependency Graph

```
Wave 1 (no deps):
  P5-1

Wave 2 (depends on P5-1, PARALLEL):
  P5-2    P5-3    P5-6    P5-7

Wave 3 (depends on Wave 2):
  P5-4 ◄── P5-1, P5-3

Wave 4 (depends on Wave 3):
  P5-5 ◄── P5-2, P5-4

Wave 5 (depends on Wave 4, PARALLEL):
  P5-8 ◄── P5-2, P5-5, P5-6, P5-7
  P5-9 ◄── P5-2, P5-3, P5-4, P5-5

Wave 6 (depends on Wave 5):
  P5-10 ◄── P5-8, P5-9

Wave 7 (depends on Wave 6):
  P5-11 ◄── P5-10
```

**Critical path:** P5-1 → P5-3 → P5-4 → P5-5 → P5-8 → P5-10 → P5-11  
**Max parallelism at Wave 2:** 4 concurrent tasks

---

## Verification Strategy

| Phase | Gate | Criteria |
|-------|------|----------|
| 5A | Type + auth compile | `tsc --noEmit` clean, auth unit tests green |
| 5B | Fetch tests green | Mock fetch covers success, fallback, error |
| 5C | Polling tests green | Fake timer tests prove interval, backoff |
| 5D | Integration green | HUD strip renders real `%` with mock; `~%` without |
| 5E | Build + live | 177+ tests green, live smoke passes |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OAuth 403 (scope missing) | Medium | Low | Web API fallback in P5-4 |
| Token expired (401) | Medium | Medium | Re-read from keychain on 401 |
| API schema changes | Low | Medium | Type guard + graceful degradation |
| Keychain access denied | Low | Low | Falls through to file/env chain |
| Rate limiting | Low | Medium | 60s interval; exponential backoff |

---

## Issue Summary Table

| Issue # | ID | Title | Size | Wave | Depends On |
|---------|-----|-------|------|------|------------|
| [#41](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/41) | P5-1 | Provider usage type definitions and utility functions | S | 1 | — |
| [#42](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/42) | P5-2 | Credential resolver chain with auto-detection | M | 2 | P5-1 |
| [#43](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/43) | P5-3 | HTTP fetch utility with AbortController timeout | S | 2 | P5-1 |
| [#44](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/44) | P5-4 | Claude usage fetcher with OAuth + Web API fallback | M | 3 | P5-1, P5-3 |
| [#45](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/45) | P5-5 | Usage polling manager with exponential backoff | M | 4 | P5-2, P5-4 |
| [#46](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/46) | P5-6 | Disk cache v2 schema with provider usage snapshot | S | 2 | P5-1 |
| [#47](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/47) | P5-7 | Enhance buildAssistantUsageLine for real API data | M | 2 | P5-1 |
| [#48](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/48) | P5-8 | Wire API polling into plugin lifecycle | L | 5 | P5-2, P5-5, P5-6, P5-7 |
| [#49](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/49) | P5-9 | Unit tests for auth, fetch, and polling modules | M | 5 | P5-2, P5-3, P5-4, P5-5 |
| [#50](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/50) | P5-10 | Integration regression + build gate | M | 6 | P5-8, P5-9 |
| [#51](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/51) | P5-11 | Live verification with real credentials | M | 7 | P5-10 |

---

## Design Decisions (resolved)

1. **Polling interval:** 60s default (conservative, avoids rate limits)
2. **Multi-provider:** Deferred — types use `provider: "anthropic"` extensible later
3. **Token refresh:** Re-read from keychain on 401 (Claude Code auto-refreshes tokens)
4. **Cache file:** Extend existing `usage-cache.json` with v1→v2 migration

---

## References

- [CodexBar](https://github.com/steipete/CodexBar) — Swift, 6.3k stars, `docs/claude.md`
- [openclaw](https://github.com/openclaw/openclaw) — TypeScript, `src/infra/provider-usage.fetch.claude.ts`
- [Claude-Usage-Tracker](https://github.com/hamed-elfayome/Claude-Usage-Tracker) — Swift, 1.3k stars
