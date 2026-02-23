# Installation

## For Humans

1. Install package:

```bash
npm install -g opencode-status-hud
```

2. Verify CLI:

```bash
opencode-status-hud --help
```

3. Install HUD plugin:

```bash
opencode-status-hud install
```

By default, the installer writes a local plugin shim to `~/.config/opencode/plugins/opencode-status-hud.js`.
This avoids `opencode.json` plugin-array rewrites and is the recommended coexistence mode with `oh-my-opencode`.

4. Start OpenCode normally (plugin autoload):

```bash
opencode
```

5. Optional: confirm which config file is being targeted:

```bash
opencode-status-hud resolve-config
```

6. Optional: uninstall safely:

```bash
opencode-status-hud uninstall
```

### Flags

- `--config <path>`: override target config path
- `--backup <path>`: override backup file path
- `--plugin <name>`: override plugin name (default: `opencode-status-hud`)
- `--mode <local|config>`: choose install strategy (`local` is default and coexistence-safe)
- `--plugin-dir <path>`: override local plugin directory when `--mode local`

### Runtime display modes

OpenCode does not expose an API to paint the native right-side status area directly.
HUD defaults to appending usage text to the assistant output message body, so no extra env setup is required:

```bash
opencode
```

Default output strip example:

```text
BOT Opus | ######...... | 65% | 131K/200K | $87.41 | 5h:6% (3h 53m) | 7d:75%
```

Prompt mode is still available, but it writes into the prompt area.

Use env values only when you want to override defaults.

Supported runtime env values:

- `OPENCODE_STATUS_HUD_CHANNEL_MODE`: `toast-only` | `prompt-only` | `both`
- `OPENCODE_STATUS_HUD_VERBOSITY`: `low` | `normal` | `high`
- `OPENCODE_STATUS_HUD_PROMPT_PROFILE`: `minimal` | `balanced` | `verbose`
- `OPENCODE_STATUS_HUD_USAGE_DISPLAY`: `output` (default) | `toast` | `prompt` | `both` (toast+prompt) | `output+toast` | `all`
- `OPENCODE_STATUS_HUD_USAGE_PROMPT_INTERVAL_MS`: `0` (disable) or `>=1000` (default: `10000`)

### Legacy mode (config array)

If you explicitly need npm plugin-array installation behavior:

```bash
opencode-status-hud install --mode config
```

This updates `opencode.json` and can be affected by other plugins that rewrite the `plugin` array.

## For LLM

Use this instruction in your coding agent:

```text
Install and configure opencode-status-hud by following this guide:
https://raw.githubusercontent.com/Two-Weeks-Team/opencode-status-hud/refs/heads/master/docs/guide/installation.md
```

If the user requests non-interactive setup, run:

```bash
npm install -g opencode-status-hud
opencode-status-hud install
```

If `OPENCODE_CONFIG` is set, the installer uses that path first.
