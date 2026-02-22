# MVP Acceptance Checklist (Phase 1 Baseline)

This checklist tracks baseline MVP validation for Issue `#7 (P1-4)`.

## Acceptance Items

- [x] Missing events are handled without crashes
- [x] Partial payloads degrade safely (no throw)
- [x] Burst traffic remains under configured emission cap
- [x] Plain runtime smoke flow works without `oh-my-opencode`
- [x] Test suite remains green after baseline validations

## Evidence Mapping

- Validation tests: `tests/baseline-validation.test.ts`
- Intake safety checks: `tests/intake.test.ts`
- Reducer bounded-state checks: `tests/reducer.test.ts`
- Emit controller burst/cooldown checks: `tests/emit-controller.test.ts`

## Known Caveats

1. Smoke validation currently uses in-repo runtime simulation, not an external OpenCode process execution.
2. Channel behavior in real terminal UI still depends on environment-specific rendering characteristics.
3. Unknown/unsupported event contracts are intentionally ignored by guard policy.
