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

3. Install HUD plugin into your OpenCode config:

```bash
opencode-status-hud install
```

4. Optional: confirm which config file is being targeted:

```bash
opencode-status-hud resolve-config
```

5. Optional: uninstall safely:

```bash
opencode-status-hud uninstall
```

### Flags

- `--config <path>`: override target config path
- `--backup <path>`: override backup file path
- `--plugin <name>`: override plugin name (default: `opencode-status-hud`)

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
