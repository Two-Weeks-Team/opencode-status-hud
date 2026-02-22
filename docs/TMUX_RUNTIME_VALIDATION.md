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

Custom output directory:

```bash
bash scripts/verify-tmux-runtime.sh artifacts/tmux-runtime/manual-run
```

## Artifact Outputs

- `report.txt`: run metadata and artifact paths
- `pane.ansi.txt`: ANSI-preserved pane capture
- `pane.txt`: normalized plain-text pane capture
- `summary.json`: machine-readable run summary

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
