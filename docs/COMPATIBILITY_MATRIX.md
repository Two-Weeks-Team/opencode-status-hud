# OpenCode HUD Compatibility Matrix (Beta)

Last updated: 2026-02-22

| OpenCode Version | Plugin Runtime | `showToast` | `appendPrompt` | Installer | Notes |
|---|---|---|---|---|---|
| planning-repo harness (`master`) | in-repo runtime simulation | pass | pass | pass | validated via `npm run ci` and installer lifecycle tests |

## Evidence Sources

- Runtime channel behavior baseline: `OPENCODE_HUD_OUTPUT_CHANNEL_BEHAVIOR_MATRIX.md`
- Installer lifecycle and recovery checks: `tests/installer-lifecycle.test.ts`
- Install transaction tests: `tests/install-transaction.test.ts`
- Uninstall transaction tests: `tests/uninstall-transaction.test.ts`

## Update Rules

- Record exact OpenCode release once external runtime automation is introduced.
- Keep unsupported behavior explicit and scoped in release checklists.
- Do not relax baseline guardrails for optional features.
