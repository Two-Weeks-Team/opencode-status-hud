# OpenCode HUD Version Pin Policy

## Purpose

Define safe version pinning for implementation and release validation.

## Policy

- During Phase 0-2, pin tooling and runtime dependencies to explicit versions.
- Any OpenCode-facing behavior claim must reference a concrete OpenCode version.
- Compatibility updates require matrix update in `docs/COMPATIBILITY_MATRIX_TEMPLATE.md`.

## Change Control

- Version upgrades must include:
  - reason for upgrade
  - regression test results
  - compatibility matrix update

## Initial Pin Set

- TypeScript: `5.8.2`
- Vitest: `3.0.9`
- Node types: `22.13.10`
