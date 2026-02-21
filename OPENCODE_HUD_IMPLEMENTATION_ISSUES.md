# OpenCode HUD vNext Issue Breakdown

## Goal

This document converts `OPENCODE_HUD_UNIVERSAL_PLAN_VNEXT.md` into execution-ready issues grouped by phase.

Rules:

- Each issue is atomic and independently reviewable
- Dependencies are explicit
- Definition of Done (DoD) is testable
- Baseline path excludes optional external viewer

## Phase Map

- Phase 0: Feasibility and initial setup
- Phase 1: HUD core MVP
- Phase 2: Fallback and robustness
- Phase 3: Installer and uninstaller
- Phase 4: Optional external viewer spike

---

## Phase 0 - Feasibility and Initial Setup

### P0-1 Event contract inventory and allowlist draft
- Objective: define known supported event contracts before reducer implementation
- Tasks:
  - inspect stable event/hook sources and enumerate candidate event names
  - classify `required` / `supported` / `ignored`
  - write allowlist draft and unknown-event handling policy
- DoD:
  - allowlist document committed
  - each event has rationale and sample payload shape
- Labels: `phase:0`, `type:design`, `priority:high`
- Depends on: none

### P0-2 Output channel behavior matrix (`showToast` / `appendPrompt`)
- Objective: validate channel behavior and constraints in target runtime
- Tasks:
  - test output visibility, timing, and interruption behavior
  - compare toast-only vs prompt fallback scenarios
  - record channel limitations and recommended defaults
- DoD:
  - behavior matrix published
  - default channel policy documented (`toast` primary, conservative prompt fallback)
- Labels: `phase:0`, `type:research`, `priority:high`
- Depends on: P0-1

### P0-3 Project bootstrap for implementation package
- Objective: complete initial implementation skeleton to start coding
- Tasks:
  - create package structure for runtime, reducer, channels, config, tests
  - add minimal typecheck/lint/test scripts
  - add compatibility matrix template and version pin policy
- DoD:
  - package skeleton compiles
  - CI-ready scripts are runnable locally
- Labels: `phase:0`, `type:setup`, `priority:high`
- Depends on: P0-1

---

## Phase 1 - HUD Core MVP

### P1-1 Guarded event intake and schema-safe parsing
- Objective: prevent crashes from payload drift and missing fields
- Tasks:
  - implement guarded parser by event allowlist
  - implement silent drop for unknown/malformed events
  - add structured debug logging for dropped events (optional)
- DoD:
  - no throw on malformed payload tests
  - unknown events are ignored consistently
- Labels: `phase:1`, `type:backend`, `priority:high`
- Depends on: P0-1, P0-3

### P1-2 Session reducer with bounded state model
- Objective: aggregate HUD snapshot from tool/event lifecycle
- Tasks:
  - implement session-scoped state model
  - include active tool, last result, duration, transition
  - enforce memory bounds and pruning strategy
- DoD:
  - reducer unit tests pass
  - long-session simulation stays within configured memory cap
- Labels: `phase:1`, `type:backend`, `priority:high`
- Depends on: P1-1

### P1-3 Toast emit controller (cooldown + dedupe)
- Objective: produce readable HUD updates without spam
- Tasks:
  - implement transition-only emission rule
  - add cooldown window and dedupe key strategy
  - wire reducer output to `client.tui.showToast`
- DoD:
  - burst simulation does not exceed rate cap
  - repetitive events do not duplicate output lines
- Labels: `phase:1`, `type:runtime`, `priority:high`
- Depends on: P1-2

### P1-4 Baseline validation suite
- Objective: prove MVP works in plain OpenCode
- Tasks:
  - add tests for missing events, partial payloads, burst traffic
  - add smoke test for plain OpenCode runtime (without `oh-my-opencode`)
  - capture known caveats in docs
- DoD:
  - test suite green
  - MVP acceptance checklist complete
- Labels: `phase:1`, `type:test`, `priority:high`
- Depends on: P1-3

---

## Phase 2 - Fallback and Robustness

### P2-1 Prompt fallback channel (conservative mode)
- Objective: add secondary channel without degrading UX
- Tasks:
  - implement `appendPrompt` fallback path
  - gate prompt emission by strict profile and transition rules
  - expose profile options: `minimal` / `balanced` / `verbose`
- DoD:
  - default profile remains low-noise
  - prompt output stays readable in long session test
- Labels: `phase:2`, `type:runtime`, `priority:medium`
- Depends on: P1-3

### P2-2 Payload truncation and formatting safety
- Objective: handle large or irregular payloads safely
- Tasks:
  - truncate oversized content by policy
  - sanitize and normalize display formatting
  - verify no output corruption on edge cases
- DoD:
  - edge-case tests for oversized/malformed payloads pass
- Labels: `phase:2`, `type:backend`, `priority:medium`
- Depends on: P1-1

### P2-3 Coexistence hardening with other plugins
- Objective: avoid takeover/conflict in multi-plugin environments
- Tasks:
  - add configurable channel/verbosity controls
  - document coexistence behavior with `oh-my-opencode`
  - verify stable operation under loader-order variance
- DoD:
  - coexistence scenario checks pass
  - no hard dependency introduced
- Labels: `phase:2`, `type:integration`, `priority:medium`
- Depends on: P2-1

---

## Phase 3 - Installer and Uninstaller

### P3-1 Config path detection and schema validation
- Objective: reliably find and validate target config before write
- Tasks:
  - implement config path discovery strategy
  - validate target JSON schema compatibility
  - fail safely with actionable messages
- DoD:
  - discovery works on supported environments
  - invalid schema path fails without side effects
- Labels: `phase:3`, `type:cli`, `priority:high`
- Depends on: P0-3

### P3-2 Idempotent install transaction
- Objective: safe one-command install with backup and rollback
- Tasks:
  - backup once policy
  - transaction flow: validate -> temp write -> atomic rename
  - preserve plugin order and avoid duplicate entries
- DoD:
  - repeated install produces identical valid config
  - rollback procedure verified
- Labels: `phase:3`, `type:cli`, `priority:high`
- Depends on: P3-1

### P3-3 Safe uninstall transaction
- Objective: remove plugin entry only with zero destructive side effects
- Tasks:
  - implement targeted plugin removal
  - keep unrelated config untouched
  - verify reinstall after uninstall remains clean
- DoD:
  - repeated uninstall is idempotent
  - config remains valid after uninstall/install cycles
- Labels: `phase:3`, `type:cli`, `priority:high`
- Depends on: P3-2

### P3-4 Installer regression and recovery tests
- Objective: guarantee install lifecycle safety before release
- Tasks:
  - add matrix tests: clean install, reinstall, uninstall, rollback
  - add corruption simulation and recovery path checks
  - publish operator troubleshooting section
- DoD:
  - lifecycle test suite green
  - recovery doc published
- Labels: `phase:3`, `type:test`, `priority:high`
- Depends on: P3-3

---

## Phase 4 - Optional External Viewer (Spike)

### P4-1 Transport feasibility spike
- Objective: prove officially supported external publishing path
- Tasks:
  - verify transport/event path supportability
  - define payload contract and backpressure strategy
  - document go/no-go recommendation
- DoD:
  - spike report with explicit go/no-go conclusion
- Labels: `phase:4`, `type:research`, `priority:medium`
- Depends on: P1-4

### P4-2 Feature-flagged publisher (only if P4-1 Go)
- Objective: add optional publisher without baseline coupling
- Tasks:
  - implement disabled-by-default publisher
  - ensure zero baseline behavior change when disabled
  - add integration tests for enabled/disabled modes
- DoD:
  - baseline regression tests pass with feature disabled
  - publish mode passes integration checks
- Labels: `phase:4`, `type:optional`, `priority:low`
- Depends on: P4-1 (Go)

---

## Release Bundle Issues

### R-1 vNext alpha release checklist
- Objective: ship phase 1-2 validated alpha
- Tasks:
  - lock known limitations
  - publish quickstart and config defaults
  - gather alpha feedback channels
- DoD:
  - alpha checklist complete
- Labels: `release`, `alpha`, `priority:medium`
- Depends on: P2-3

### R-2 vNext beta release checklist
- Objective: ship installer-enabled beta
- Tasks:
  - include installer lifecycle docs
  - execute rollback drill
  - finalize compatibility matrix
- DoD:
  - beta checklist complete
- Labels: `release`, `beta`, `priority:medium`
- Depends on: P3-4

## Recommended Issue Order

1. P0-1 -> P0-2 -> P0-3
2. P1-1 -> P1-2 -> P1-3 -> P1-4
3. P2-1 -> P2-2 -> P2-3
4. P3-1 -> P3-2 -> P3-3 -> P3-4
5. P4-1 -> P4-2 (conditional)
6. R-1 -> R-2
