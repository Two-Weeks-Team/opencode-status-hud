# Beta Rollback Drill Record

Issue link: `#18 (R-2)`

## Objective

Verify installer rollback procedure restores configuration safely and preserves reinstall path.

## Drill Procedure

1. Start from config containing HUD plugin entry.
2. Simulate failure/corruption scenario.
3. Restore config from backup (`*.bak`).
4. Re-run install transaction.
5. Re-run lifecycle regression tests.

## Verification Commands

```bash
npx vitest run tests/installer-lifecycle.test.ts tests/install-transaction.test.ts tests/uninstall-transaction.test.ts
npm run ci
```

## Expected Outcomes

- Backup restore recreates readable valid config.
- Reinstall adds HUD plugin once (no duplicates).
- Unrelated config values remain unchanged.
- Quality gate remains green after rollback cycle.

## Result

- Status: pass
- Evidence: regression suites and CI pass on beta branch changes.
