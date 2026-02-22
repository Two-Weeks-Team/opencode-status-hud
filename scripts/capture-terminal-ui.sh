#!/usr/bin/env bash

set -euo pipefail

OUTPUT_PATH="${1:-}"
WINDOW_ID="${2:-}"

if [[ -z "$OUTPUT_PATH" ]]; then
  echo "usage: scripts/capture-terminal-ui.sh <output-path> [window-id]" >&2
  exit 2
fi

if ! command -v screencapture >/dev/null 2>&1; then
  echo "screencapture is unavailable on this system." >&2
  exit 3
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

if [[ -n "$WINDOW_ID" ]]; then
  if screencapture -x -l"$WINDOW_ID" "$OUTPUT_PATH"; then
    echo "captured terminal window image: $OUTPUT_PATH"
    exit 0
  fi

  echo "window capture failed. Verify Screen Recording permission and valid window id." >&2
  exit 4
fi

if screencapture -x "$OUTPUT_PATH"; then
  echo "captured display image: $OUTPUT_PATH"
  exit 0
fi

echo "display capture failed. On macOS, grant Screen Recording permission for your terminal and retry." >&2
echo "if running headless/CI, skip screenshot capture and rely on tmux textual artifacts." >&2
exit 5
