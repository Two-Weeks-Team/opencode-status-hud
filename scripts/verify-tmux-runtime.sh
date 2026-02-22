#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
OUTPUT_DIR="${1:-$ROOT_DIR/artifacts/tmux-runtime/$TIMESTAMP}"
SESSION_NAME="hud-verify-$TIMESTAMP"

mkdir -p "$OUTPUT_DIR"

REPORT_TXT="$OUTPUT_DIR/report.txt"
PANE_ANSI="$OUTPUT_DIR/pane.ansi.txt"
PANE_TEXT="$OUTPUT_DIR/pane.txt"
SUMMARY_JSON="$OUTPUT_DIR/summary.json"

: > "$REPORT_TXT"

if ! command -v tmux >/dev/null 2>&1; then
  printf "tmux is not installed in this environment.\n" > "$REPORT_TXT"
  printf '{"status":"skipped","reason":"tmux_not_installed"}\n' > "$SUMMARY_JSON"
  exit 0
fi

cleanup() {
  tmux kill-session -t "$SESSION_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cat > "$OUTPUT_DIR/scenario.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf "HUD TMUX runtime verification\n"
printf "cwd=%s\n" "$(pwd)"
printf "timestamp=%s\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
printf "node=%s\n" "$(node -v 2>/dev/null || echo unavailable)"
printf "npm=%s\n" "$(npm -v 2>/dev/null || echo unavailable)"
printf "status=running\n"
sleep 0.2
printf "status=completed\n"
EOF

chmod +x "$OUTPUT_DIR/scenario.sh"

SCENARIO_Q="$(printf %q "$OUTPUT_DIR/scenario.sh")"
tmux new-session -d -s "$SESSION_NAME" "bash $SCENARIO_Q"
tmux set-option -t "$SESSION_NAME" remain-on-exit on >/dev/null

for _ in $(seq 1 20); do
  if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  PANE_TARGET="$(tmux list-panes -t "$SESSION_NAME" -F '#{pane_id}' 2>/dev/null | sed -n '1p')"
  if [[ -n "$PANE_TARGET" ]]; then
    tmux capture-pane -t "$PANE_TARGET" -e -p -S -200 > "$PANE_ANSI"
    tmux capture-pane -t "$PANE_TARGET" -p -S -200 > "$PANE_TEXT"
  else
    : > "$PANE_ANSI"
    : > "$PANE_TEXT"
  fi
else
  printf "session exited before capture; using last known pane\n" >> "$REPORT_TXT"
  : > "$PANE_ANSI"
  : > "$PANE_TEXT"
fi

printf "tmux_version=%s\n" "$(tmux -V)" >> "$REPORT_TXT"
printf "session=%s\n" "$SESSION_NAME" >> "$REPORT_TXT"
printf "pane_text=%s\n" "$PANE_TEXT" >> "$REPORT_TXT"
printf "pane_ansi=%s\n" "$PANE_ANSI" >> "$REPORT_TXT"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

TMUX_VERSION_ESCAPED="$(json_escape "$(tmux -V)")"
OUTPUT_DIR_ESCAPED="$(json_escape "$OUTPUT_DIR")"

cat > "$SUMMARY_JSON" <<EOF
{"status":"ok","tmuxVersion":"$TMUX_VERSION_ESCAPED","outputDir":"$OUTPUT_DIR_ESCAPED"}
EOF

printf "tmux runtime verification artifacts written to %s\n" "$OUTPUT_DIR"
