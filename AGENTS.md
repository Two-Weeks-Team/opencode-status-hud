# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-21 21:18:51 UTC+09:00
**Commit:** N/A (repository has no commits yet)
**Branch:** master (unborn)

## OVERVIEW
Reference-only repository for OpenCode HUD architecture/planning. Contains analysis docs for OpenCode plugin surfaces, oh-my-opencode layering, and a phased universal HUD implementation plan.

## STRUCTURE
```text
./
├── OPENCODE_ARCHITECTURE_ANALYSIS.md      # OpenCode internals, hook/event/output constraints
├── OH_MY_OPENCODE_ARCHITECTURE_ANALYSIS.md # oh-my-opencode composition and reusable patterns
├── OPENCODE_HUD_UNIVERSAL_PLAN.md          # original universal HUD plan (baseline)
├── OPENCODE_HUD_UNIVERSAL_PLAN_VNEXT.md    # strengthened vNext plan with gates/controls
└── OPENCODE_HUD_IMPLEMENTATION_ISSUES.md   # phase-grouped issue breakdown (task-level)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Understand OpenCode plugin limits | `OPENCODE_ARCHITECTURE_ANALYSIS.md` | Evidence-backed limits: no core patching, hook/TUI boundaries |
| Reuse composition/install patterns | `OH_MY_OPENCODE_ARCHITECTURE_ANALYSIS.md` | Bootstrap pipeline, hook tiering, installer idempotency |
| Track baseline plan assumptions | `OPENCODE_HUD_UNIVERSAL_PLAN.md` | Scope, phased milestones, verification, rollout |
| Execute strengthened implementation plan | `OPENCODE_HUD_UNIVERSAL_PLAN_VNEXT.md` | go/no-go gates, risk controls, verification strategy |
| Register work as granular tasks/issues | `OPENCODE_HUD_IMPLEMENTATION_ISSUES.md` | phase-grouped atomic issue definitions and dependency order |

## CODE MAP
No local source code in this repository. All symbol/file references inside docs point to external repositories (`opencode/...`, `oh-my-opencode/...`).

## CONVENTIONS
- This repo is documentation-first; keep additions evidence-based and concise.
- Preserve explicit distinction between:
  - OpenCode-native capabilities
  - oh-my-opencode-specific behavior
  - proposed universal HUD implementation details
- Prefer stable, known event contracts and avoid undocumented assumptions.

## ANTI-PATTERNS (THIS PROJECT)
- Do not require tmux for baseline HUD behavior (`OPENCODE_HUD_UNIVERSAL_PLAN.md`).
- Do not modify OpenCode core (`OPENCODE_HUD_UNIVERSAL_PLAN.md`, `OPENCODE_ARCHITECTURE_ANALYSIS.md`).
- Do not assume unknown web reducer events will render (`OPENCODE_ARCHITECTURE_ANALYSIS.md`).
- Do not introduce hard dependency on `oh-my-opencode` (`OPENCODE_HUD_UNIVERSAL_PLAN.md`).

## UNIQUE STYLES
- Architecture docs are constraint-driven: each claim should tie back to concrete runtime/plugin surfaces.
- Implementation guidance is phased and testable (success criteria per phase).
- Keep practical "what to reuse / what not to inherit" framing when adding comparative analysis.

## COMMANDS
```bash
# This repository currently has no local build/test scripts.
# Use standard documentation hygiene when editing:
markdownlint "*.md"        # if markdownlint is available
```

## NOTES
- There are no subdirectories at present; only root-level AGENTS.md is warranted.
- If code or packages are later added, create nested AGENTS.md only for directories with distinct ownership, conventions, or high complexity.
