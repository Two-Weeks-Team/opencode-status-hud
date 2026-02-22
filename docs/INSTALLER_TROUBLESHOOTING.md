# Installer Lifecycle Troubleshooting

Issue link: [#14](https://github.com/Two-Weeks-Team/opencode-status-hud/issues/14) (P3-4)

## Lifecycle Validation Commands

Run the full quality gate:

```bash
npm run ci
```

Run only installer lifecycle regression coverage:

```bash
npx vitest run tests/installer-lifecycle.test.ts tests/install-transaction.test.ts tests/uninstall-transaction.test.ts
```

## Coverage Matrix

- Clean install from missing config path
- Reinstall idempotence (no duplicate HUD plugin entries)
- Uninstall idempotence (targeted removal only)
- Uninstall then reinstall cycle with unrelated config preserved
- Corrupted config failure without side-effect writes
- Backup restore and recovery path verification

## Operator Recovery Steps

1. Identify active config path (`OPENCODE_CONFIG`, `opencode.jsonc` / `opencode.json`, or global config path).
2. Validate whether a matching backup exists (`opencode.jsonc.bak` or `opencode.json.bak`).
3. If `opencode.jsonc` or `opencode.json` is corrupted, restore from backup:

```bash
# For a JSON config file:
cp "opencode.json.bak" "opencode.json"

# For a JSONC config file:
cp "opencode.jsonc.bak" "opencode.jsonc"
```

4. Re-run installer transaction and confirm plugin entry appears once.
5. Re-run `npm run ci` to confirm lifecycle checks stay green.

## Failure Signatures

- `invalid_config`: input JSON/JSONC is malformed or schema-incompatible.
- `write_failed`: temp write/rename transaction failed; config should remain unchanged or recoverable.
- `rollback_failed`: failure during rollback restore path; manual backup restore required.

## Safety Notes

- Keep backup path distinct from config path.
- Keep rollback backups (`opencode.json.bak` / `opencode.jsonc.bak`) until install/uninstall validation is complete.
- Use transaction APIs that write to temporary file first, then atomic rename.
