# Coexistence Behavior Guide

This document defines coexistence behavior for OpenCode HUD runtime with other plugins (including `oh-my-opencode`).

## Core Rules

1. No hard dependency on other plugins
   - HUD runtime must run with or without `oh-my-opencode`.

2. Configurable channel controls
   - `channelMode: toast-only | prompt-only | both`
   - `verbosity: low | normal | high`
   - prompt profile stays configurable via `minimal | balanced | verbose`

3. Low-noise default
   - default mode is `toast-only` + `low` verbosity
   - prompt channel remains optional and conservative

## Loader-Order Variance Policy

- Runtime dispatch is state-local and order-independent.
- No global mutable singleton shared across plugins.
- Each plugin instance keeps separate controller/fallback state.

## Verification Scope

- Channel-mode behavior verified in `tests/coexistence.test.ts`
- Loader-order variance simulation verified in `tests/coexistence.test.ts`
- No-hard-dependency behavior validated by optional client wiring in `dispatchHudTransition`
