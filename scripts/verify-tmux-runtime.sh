#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
OUTPUT_DIR="${1:-$ROOT_DIR/artifacts/tmux-runtime/$TIMESTAMP}"
SESSION_NAME="hud-verify-$TIMESTAMP"
LOG_DIR="$HOME/.local/share/opencode/log"
LIVE_MODE="${HUD_TMUX_LIVE:-0}"

mkdir -p "$OUTPUT_DIR"

REPORT_TXT="$OUTPUT_DIR/report.txt"
PANE_ANSI="$OUTPUT_DIR/pane.ansi.txt"
PANE_TEXT="$OUTPUT_DIR/pane.txt"
SUMMARY_JSON="$OUTPUT_DIR/summary.json"
SCENARIO_SH="$OUTPUT_DIR/scenario.sh"
TMP_CONFIG="$OUTPUT_DIR/opencode.tmux.json"
TMP_CONFIG_DIR="$OUTPUT_DIR/opencode-config"
TMP_PLUGIN_DIR="$TMP_CONFIG_DIR/plugins"
TMP_LOCAL_HUD_PLUGIN="$TMP_PLUGIN_DIR/opencode-status-hud.js"
DEBUG_CONFIG_JSON="$OUTPUT_DIR/debug-config.json"
RUN_STDOUT="$OUTPUT_DIR/run.stdout.txt"
RUN_STDERR="$OUTPUT_DIR/run.stderr.txt"
LOG_EXCERPT="$OUTPUT_DIR/runtime.log.excerpt.txt"

: > "$REPORT_TXT"
: > "$RUN_STDOUT"
: > "$RUN_STDERR"
: > "$LOG_EXCERPT"
mkdir -p "$TMP_PLUGIN_DIR"

if ! command -v tmux >/dev/null 2>&1; then
  printf "tmux is not installed in this environment.\n" > "$REPORT_TXT"
  printf '{"status":"skipped","reason":"tmux_not_installed"}\n' > "$SUMMARY_JSON"
  exit 0
fi

cleanup() {
  tmux kill-session -t "$SESSION_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! command -v opencode >/dev/null 2>&1; then
  printf "opencode is not installed in this environment.\n" > "$REPORT_TXT"
  printf '{"status":"skipped","reason":"opencode_not_installed"}\n' > "$SUMMARY_JSON"
  exit 0
fi

HUD_PLUGIN_PATH="$ROOT_DIR/dist/src/index.js"
if [[ ! -f "$HUD_PLUGIN_PATH" ]]; then
  npm --prefix "$ROOT_DIR" run build >/dev/null
fi

if [[ ! -f "$HUD_PLUGIN_PATH" ]]; then
  printf "HUD plugin build artifact missing: %s\n" "$HUD_PLUGIN_PATH" > "$REPORT_TXT"
  printf '{"status":"failed","reason":"hud_plugin_missing"}\n' > "$SUMMARY_JSON"
  exit 1
fi

OH_PLUGIN_FILE="$HOME/node_modules/oh-my-opencode/dist/index.js"
EXPECT_OH=0
if [[ -f "$OH_PLUGIN_FILE" ]]; then
  EXPECT_OH=1
fi

HUD_URI="file://$HUD_PLUGIN_PATH"
cat > "$TMP_LOCAL_HUD_PLUGIN" <<EOF
export { default } from "$HUD_URI"
EOF

if [[ "$EXPECT_OH" -eq 1 ]]; then
  OH_URI="file://$OH_PLUGIN_FILE"
  cat > "$TMP_CONFIG" <<EOF
{
  "plugin": [
    "$OH_URI"
  ]
}
EOF
else
  cat > "$TMP_CONFIG" <<EOF
{
  "plugin": []
}
EOF
fi

OPENCODE_CONFIG_DIR="$TMP_CONFIG_DIR" OPENCODE_CONFIG="$TMP_CONFIG" opencode debug config > "$DEBUG_CONFIG_JSON"

cat > "$SCENARIO_SH" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf "HUD TMUX runtime verification (opencode)\n"
printf "cwd=%s\n" "${HUD_ROOT_DIR}"
printf "timestamp=%s\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
printf "node=%s\n" "$(node -v 2>/dev/null || echo unavailable)"
printf "npm=%s\n" "$(npm -v 2>/dev/null || echo unavailable)"
printf "live_mode=%s\n" "${HUD_LIVE_MODE}"
printf "config=%s\n" "${HUD_TMP_CONFIG}"
printf "config_dir=%s\n" "${HUD_TMP_CONFIG_DIR}"
printf "status=running\n"

OPENCODE_CONFIG_DIR="${HUD_TMP_CONFIG_DIR}" OPENCODE_CONFIG="${HUD_TMP_CONFIG}" opencode debug config > "${HUD_DEBUG_CONFIG_JSON}"

if [[ "${HUD_LIVE_MODE}" == "1" ]]; then
  OPENCODE_CONFIG_DIR="${HUD_TMP_CONFIG_DIR}" OPENCODE_CONFIG="${HUD_TMP_CONFIG}" opencode run "Use the bash tool once and run command: pwd. After that, reply with exactly: done" --print-logs --log-level INFO > "${HUD_RUN_STDOUT}" 2> "${HUD_RUN_STDERR}" || true
fi

printf "status=completed\n"
EOF

chmod +x "$SCENARIO_SH"

SCENARIO_Q="$(printf %q "$SCENARIO_SH")"
tmux new-session -d -s "$SESSION_NAME" "HUD_ROOT_DIR=$(printf %q "$ROOT_DIR") HUD_TMP_CONFIG=$(printf %q "$TMP_CONFIG") HUD_TMP_CONFIG_DIR=$(printf %q "$TMP_CONFIG_DIR") HUD_DEBUG_CONFIG_JSON=$(printf %q "$DEBUG_CONFIG_JSON") HUD_RUN_STDOUT=$(printf %q "$RUN_STDOUT") HUD_RUN_STDERR=$(printf %q "$RUN_STDERR") HUD_LIVE_MODE=$(printf %q "$LIVE_MODE") bash $SCENARIO_Q"
tmux set-option -t "$SESSION_NAME" remain-on-exit on >/dev/null

for _ in $(seq 1 120); do
  if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    break
  fi

  PANE_TARGET="$(tmux list-panes -t "$SESSION_NAME" -F '#{pane_id}' 2>/dev/null | sed -n '1p')"
  if [[ -n "$PANE_TARGET" ]]; then
    PANE_DEAD="$(tmux display-message -p -t "$PANE_TARGET" '#{pane_dead}' 2>/dev/null || printf '0')"
    if [[ "$PANE_DEAD" == "1" ]]; then
      break
    fi
  fi

  sleep 0.25
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

if [[ -d "$LOG_DIR" ]]; then
  LATEST_LOG="$(ls -1t "$LOG_DIR"/*.log 2>/dev/null | sed -n '1p' || true)"
  if [[ -n "$LATEST_LOG" ]]; then
    grep -E "show-toast|showToast|append-prompt|appendPrompt|tui.prompt.append|\[HUD\]|opencode-status-hud|plugin" "$LATEST_LOG" > "$LOG_EXCERPT" || true
  fi
fi

HUD_IN_CONFIG=0
OH_IN_CONFIG=0
TOAST_IN_EVIDENCE=0
PROMPT_IN_EVIDENCE=0
UI_IN_EVIDENCE=0

if grep -q "opencode-status-hud" "$DEBUG_CONFIG_JSON" || grep -q "opencode-status-hud" "$RUN_STDERR" || grep -q "opencode-status-hud" "$LOG_EXCERPT"; then
  HUD_IN_CONFIG=1
fi

if [[ "$EXPECT_OH" -eq 1 ]] && grep -q "oh-my-opencode" "$DEBUG_CONFIG_JSON"; then
  OH_IN_CONFIG=1
elif [[ "$EXPECT_OH" -eq 0 ]]; then
  OH_IN_CONFIG=1
fi

if grep -q "show-toast" "$RUN_STDERR" || grep -q "showToast" "$RUN_STDERR" || grep -q "show-toast" "$LOG_EXCERPT"; then
  TOAST_IN_EVIDENCE=1
fi

if grep -q -E "append-prompt|appendPrompt|tui.prompt.append|\[HUD\]" "$RUN_STDERR" || grep -q -E "append-prompt|appendPrompt|tui.prompt.append|\[HUD\]" "$RUN_STDOUT" || grep -q -E "append-prompt|appendPrompt|tui.prompt.append|\[HUD\]" "$LOG_EXCERPT" || grep -q "\[HUD\]" "$PANE_TEXT"; then
  PROMPT_IN_EVIDENCE=1
fi

if [[ "$TOAST_IN_EVIDENCE" -eq 1 || "$PROMPT_IN_EVIDENCE" -eq 1 ]]; then
  UI_IN_EVIDENCE=1
fi

FINAL_STATUS="ok"
FAIL_REASON=""

if [[ "$HUD_IN_CONFIG" -ne 1 ]]; then
  FINAL_STATUS="failed"
  FAIL_REASON="hud_not_loaded_in_effective_config"
elif [[ "$LIVE_MODE" == "1" && "$UI_IN_EVIDENCE" -ne 1 ]]; then
  FINAL_STATUS="failed"
  FAIL_REASON="no_ui_evidence_in_live_mode"
fi

OH_WARNING=""
if [[ "$OH_IN_CONFIG" -ne 1 ]]; then
  OH_WARNING="oh_my_opencode_not_visible_in_effective_config"
fi

printf "tmux_version=%s\n" "$(tmux -V)" >> "$REPORT_TXT"
printf "session=%s\n" "$SESSION_NAME" >> "$REPORT_TXT"
printf "live_mode=%s\n" "$LIVE_MODE" >> "$REPORT_TXT"
printf "tmp_config=%s\n" "$TMP_CONFIG" >> "$REPORT_TXT"
printf "tmp_config_dir=%s\n" "$TMP_CONFIG_DIR" >> "$REPORT_TXT"
printf "tmp_local_hud_plugin=%s\n" "$TMP_LOCAL_HUD_PLUGIN" >> "$REPORT_TXT"
printf "debug_config=%s\n" "$DEBUG_CONFIG_JSON" >> "$REPORT_TXT"
printf "run_stdout=%s\n" "$RUN_STDOUT" >> "$REPORT_TXT"
printf "run_stderr=%s\n" "$RUN_STDERR" >> "$REPORT_TXT"
printf "log_excerpt=%s\n" "$LOG_EXCERPT" >> "$REPORT_TXT"
printf "hud_in_config=%s\n" "$HUD_IN_CONFIG" >> "$REPORT_TXT"
printf "oh_in_config=%s\n" "$OH_IN_CONFIG" >> "$REPORT_TXT"
printf "toast_in_evidence=%s\n" "$TOAST_IN_EVIDENCE" >> "$REPORT_TXT"
printf "prompt_in_evidence=%s\n" "$PROMPT_IN_EVIDENCE" >> "$REPORT_TXT"
printf "ui_in_evidence=%s\n" "$UI_IN_EVIDENCE" >> "$REPORT_TXT"
printf "status=%s\n" "$FINAL_STATUS" >> "$REPORT_TXT"
if [[ -n "$FAIL_REASON" ]]; then
  printf "reason=%s\n" "$FAIL_REASON" >> "$REPORT_TXT"
fi
if [[ -n "$OH_WARNING" ]]; then
  printf "warning=%s\n" "$OH_WARNING" >> "$REPORT_TXT"
fi
printf "pane_text=%s\n" "$PANE_TEXT" >> "$REPORT_TXT"
printf "pane_ansi=%s\n" "$PANE_ANSI" >> "$REPORT_TXT"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

TMUX_VERSION_ESCAPED="$(json_escape "$(tmux -V)")"
OUTPUT_DIR_ESCAPED="$(json_escape "$OUTPUT_DIR")"
FAIL_REASON_ESCAPED="$(json_escape "$FAIL_REASON")"
OH_WARNING_ESCAPED="$(json_escape "$OH_WARNING")"

cat > "$SUMMARY_JSON" <<EOF
{"status":"$FINAL_STATUS","reason":"$FAIL_REASON_ESCAPED","warning":"$OH_WARNING_ESCAPED","tmuxVersion":"$TMUX_VERSION_ESCAPED","outputDir":"$OUTPUT_DIR_ESCAPED","liveMode":"$LIVE_MODE","hudInConfig":$HUD_IN_CONFIG,"ohInConfig":$OH_IN_CONFIG,"toastEvidence":$TOAST_IN_EVIDENCE,"promptEvidence":$PROMPT_IN_EVIDENCE,"uiEvidence":$UI_IN_EVIDENCE}
EOF

printf "tmux runtime verification artifacts written to %s\n" "$OUTPUT_DIR"

if [[ "$FINAL_STATUS" != "ok" ]]; then
  exit 1
fi
