# PROJECT KNOWLEDGE BASE

**Updated:** 2026-02-25
**Version:** 0.1.1 (npm published)
**Branch:** master

## OVERVIEW
Real-time usage HUD plugin for OpenCode CLI. Shows provider API utilization, context tokens, cost, and agent info as a dim blockquote appended to assistant output.

## STRUCTURE
```text
./
├── src/
│   ├── plugin.ts                    # Main plugin — hooks, usage line builder, output augmentation
│   ├── index.ts                     # Default export
│   ├── api.ts                       # Public API re-exports
│   ├── config/index.ts              # HUD profiles and config types
│   ├── model-registry.ts            # Model metadata, context limits, cost rates
│   ├── cost-calculator.ts           # Per-message cost resolution
│   ├── usage-aggregator.ts          # Rolling usage sample accumulator
│   ├── disk-cache.ts                # Persistent cache for provider snapshots
│   ├── polling-manager.ts           # Background API polling orchestrator
│   ├── fetch-claude.ts              # Anthropic usage API client
│   ├── fetch-openai.ts              # OpenAI Codex usage API client
│   ├── fetch-utils.ts               # Shared HTTP utilities
│   ├── auth-resolver.ts             # Anthropic credential auto-detection
│   ├── auth-resolver-openai.ts      # OpenAI credential auto-detection
│   ├── provider-usage.types.ts      # Provider usage snapshot types
│   ├── runtime/
│   │   ├── reducer.ts               # HUD state machine (tool transitions)
│   │   ├── intake.ts                # Raw event parser
│   │   ├── event-allowlist.ts       # Allowed event types
│   │   ├── formatting.ts            # Display text sanitization
│   │   ├── coexistence.ts           # Multi-channel dispatch (prompt + publisher)
│   │   ├── prompt-fallback.ts       # Prompt channel with rate limiting
│   │   ├── publisher.ts             # Optional snapshot publisher
│   │   └── channels/
│   │       ├── index.ts             # Channel exports
│   │       └── prompt.ts            # Prompt message formatter
│   └── cli/
│       ├── index.ts                 # CLI entry point (install/uninstall)
│       ├── config-manager.ts        # opencode.json config resolution
│       ├── install-transaction.ts   # Atomic install operations
│       ├── uninstall-transaction.ts # Atomic uninstall operations
│       └── local-plugin-transaction.ts # Local plugin shim management
├── tests/                           # vitest
├── bin/opencode-status-hud.js       # CLI binary
├── docs/guide/installation.md       # Installation guide (published to npm)
├── docs/QUICKSTART.md               # Quick start reference
├── docs/CONFIG_DEFAULTS.md          # Config defaults reference
└── dist/                            # Built output (tsc)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| HUD line format and output augmentation | `src/plugin.ts` | `buildAssistantUsageLine`, `appendUsageLineToOutputText` |
| Provider API polling | `src/polling-manager.ts` | Creates per-provider pollers |
| Anthropic usage fetch | `src/fetch-claude.ts` | Rate limit window parsing |
| OpenAI Codex usage fetch | `src/fetch-openai.ts` | Codex API billing/usage |
| Credential auto-detection | `src/auth-resolver.ts`, `src/auth-resolver-openai.ts` | Reads from env, config files |
| Model metadata and context limits | `src/model-registry.ts` | Dynamic via chat.params hook |
| Plugin install/uninstall CLI | `src/cli/` | Local shim or config-array mode |
| State machine for tool transitions | `src/runtime/reducer.ts` | HudState, transitions |
| Multi-channel dispatch | `src/runtime/coexistence.ts` | Prompt + publisher coordination |

## CONVENTIONS
- Zero external env setup required — credentials auto-detected from existing provider configs
- Output channel is primary: blockquote (`> usage line`) appended to assistant text
- No ANSI escape codes in output text (stripped before blockquote wrapping)
- All source uses strict TypeScript — no `as any`, no `@ts-ignore`
- Tests use vitest, no mocking of external services (polling manager injectable)

## ANTI-PATTERNS (THIS PROJECT)
- Do not modify OpenCode CLI core or oh-my-opencode
- Do not require tmux for baseline HUD behavior
- Do not use ANSI codes in output text (TUI renders markdown, not raw ANSI)
- Do not suppress type errors with `as any` or `@ts-ignore`

## COMMANDS
```bash
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run build        # tsc -p tsconfig.build.json
npm run ci           # typecheck + test + build (prepublishOnly)
```
