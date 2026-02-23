# tmux Runtime Validation and Artifacts

Issue link: `#30 (R-3)`

## Goals

- Produce deterministic textual tmux runtime evidence on local and CI runs.
- Optionally capture real terminal UI screenshots on local GUI environments.
- Keep baseline runtime independent from tmux requirement.

## Local Validation

Generate tmux artifacts:

```bash
bash scripts/verify-tmux-runtime.sh
```

Live OpenCode + HUD evidence mode (recommended on local macOS):

```bash
HUD_TMUX_LIVE=1 bash scripts/verify-tmux-runtime.sh
```

Custom output directory:

```bash
bash scripts/verify-tmux-runtime.sh artifacts/tmux-runtime/manual-run
```

## Artifact Outputs

- `report.txt`: run metadata and artifact paths
- `pane.ansi.txt`: ANSI-preserved pane capture
- `pane.txt`: normalized plain-text pane capture
- `summary.json`: machine-readable run summary
- `debug-config.json`: effective OpenCode config resolved under temporary test config
- `run.stdout.txt` / `run.stderr.txt`: live-mode `opencode run` outputs
- `runtime.log.excerpt.txt`: filtered runtime log evidence (`show-toast`, `append-prompt`, `[HUD]`, plugin load lines)

`summary.json` fields:

- `status`: `ok` or `failed`
- `reason`: failure reason (empty when `ok`)
- `warning`: non-fatal warning (for example `oh_my_opencode_not_visible_in_effective_config`)
- `liveMode`: `0` or `1`
- `hudInConfig`: HUD plugin resolved in effective config (`0`/`1`)
- `ohInConfig`: `oh-my-opencode` resolved when local installation exists (`0`/`1`)
- `toastEvidence`: toast evidence found in live mode (`0`/`1`)
- `promptEvidence`: prompt or output HUD text evidence found in live mode (`0`/`1`)
- `uiEvidence`: combined UI evidence (`toastEvidence || promptEvidence`)

## Optional GUI Screenshot Capture (macOS)

Display capture:

```bash
bash scripts/capture-terminal-ui.sh artifacts/tmux-runtime/screen.png
```

Window-specific capture:

```bash
bash scripts/capture-terminal-ui.sh artifacts/tmux-runtime/window.png <window-id>
```

## Screen Recording Permission Bootstrap/Reset (macOS)

- Open **System Settings > Privacy & Security > Screen Recording**.
- Enable permission for your terminal app (Terminal/iTerm/other shell host).
- If permission state is stale, reset and re-grant:

```bash
tccutil reset ScreenCapture com.apple.Terminal
```

Replace bundle identifier when using other terminal applications.

## CI Behavior

- Workflow job `tmux-runtime-validation` runs after `quality`.
- CI ensures tmux availability and runs `scripts/verify-tmux-runtime.sh`.
- Artifacts are uploaded with `actions/upload-artifact` under `tmux-runtime-<run-id>-<attempt>`.
- Screenshot capture is optional and intentionally excluded from required CI gate.

## Policy Notes

- tmux remains a verification artifact path, not a production runtime dependency.
- If screenshot capture fails in headless/permission-limited environments, textual artifacts remain the required evidence source.
- CI uses non-live mode (`HUD_TMUX_LIVE=0`) to avoid external model/auth dependency.
