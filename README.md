# OpenCode Status HUD

[![Repo](https://img.shields.io/badge/repo-opencode--status--hud-0A66C2)](https://github.com/Two-Weeks-Team/opencode-status-hud)
[![Open Issues](https://img.shields.io/badge/issues-18_open-orange)](https://github.com/Two-Weeks-Team/opencode-status-hud/issues)
[![Open Milestones](https://img.shields.io/badge/milestones-7_open-orange)](https://github.com/Two-Weeks-Team/opencode-status-hud/milestones)
[![Branch](https://img.shields.io/badge/branch-master-6f42c1)](https://github.com/Two-Weeks-Team/opencode-status-hud/tree/master)
[![Status](https://img.shields.io/badge/status-planning-blue)](https://github.com/Two-Weeks-Team/opencode-status-hud/milestones)

Documentation-first repository for planning and executing a universal OpenCode HUD.

> Note: This repository is private, so GitHub API-based Shields badges may render `repo not found`. Static badges are used for reliable display.

## Installation

### For Humans

Read and follow the installation guide:

- `docs/guide/installation.md`

Or run directly after install:

```bash
npm install -g opencode-status-hud
opencode-status-hud install
```

### For LLM

Provide this to your agent:

```text
Install and configure opencode-status-hud by following:
https://raw.githubusercontent.com/Two-Weeks-Team/opencode-status-hud/refs/heads/master/docs/guide/installation.md
```

## Release

- Maintainers can publish via GitHub Actions: `.github/workflows/publish.yml`
- Required secret: `NPM_TOKEN`

## Quick Links

- Roadmap milestones: `https://github.com/Two-Weeks-Team/opencode-status-hud/milestones`
- Task issues: `https://github.com/Two-Weeks-Team/opencode-status-hud/issues`
- Phase 0 board slice: `https://github.com/Two-Weeks-Team/opencode-status-hud/issues?q=is%3Aopen+label%3Aphase%3A0`
- Phase 1 board slice: `https://github.com/Two-Weeks-Team/opencode-status-hud/issues?q=is%3Aopen+label%3Aphase%3A1`
- Phase 2 board slice: `https://github.com/Two-Weeks-Team/opencode-status-hud/issues?q=is%3Aopen+label%3Aphase%3A2`
- Phase 3 board slice: `https://github.com/Two-Weeks-Team/opencode-status-hud/issues?q=is%3Aopen+label%3Aphase%3A3`
- Phase 4 board slice: `https://github.com/Two-Weeks-Team/opencode-status-hud/issues?q=is%3Aopen+label%3Aphase%3A4`

## Core Documents

- `OPENCODE_ARCHITECTURE_ANALYSIS.md`: OpenCode plugin and TUI constraints
- `OH_MY_OPENCODE_ARCHITECTURE_ANALYSIS.md`: reusable patterns from oh-my-opencode
- `OPENCODE_HUD_UNIVERSAL_PLAN.md`: baseline delivery plan
- `OPENCODE_HUD_UNIVERSAL_PLAN_VNEXT.md`: strengthened vNext plan (gates/risk controls)
- `OPENCODE_HUD_IMPLEMENTATION_ISSUES.md`: phase-grouped task issue breakdown

## GitHub Setup

- Repository: `https://github.com/Two-Weeks-Team/opencode-status-hud`
- Milestones:
  - Phase 0: `https://github.com/Two-Weeks-Team/opencode-status-hud/milestone/1`
  - Phase 1: `https://github.com/Two-Weeks-Team/opencode-status-hud/milestone/2`
  - Phase 2: `https://github.com/Two-Weeks-Team/opencode-status-hud/milestone/3`
  - Phase 3: `https://github.com/Two-Weeks-Team/opencode-status-hud/milestone/4`
  - Phase 4: `https://github.com/Two-Weeks-Team/opencode-status-hud/milestone/5`
  - Release Alpha: `https://github.com/Two-Weeks-Team/opencode-status-hud/milestone/6`
  - Release Beta: `https://github.com/Two-Weeks-Team/opencode-status-hud/milestone/7`

## Phase Snapshot

- Phase 0: 3 issues (`#1`, `#2`, `#3`)
- Phase 1: 4 issues (`#4`, `#5`, `#6`, `#7`)
- Phase 2: 3 issues (`#8`, `#9`, `#10`)
- Phase 3: 4 issues (`#11`, `#12`, `#13`, `#14`)
- Phase 4: 2 issues (`#15`, `#16`, conditional)
- Release: 2 issues (`#17`, `#18`)

## Next Execution Order

1. Phase 0 (`#1`, `#2`, `#3`)
2. Phase 1 (`#4`, `#5`, `#6`, `#7`)
3. Phase 2 (`#8`, `#9`, `#10`)
4. Phase 3 (`#11`, `#12`, `#13`, `#14`)
5. Phase 4 (`#15`, `#16`, conditional)
6. Release bundles (`#17`, `#18`)
