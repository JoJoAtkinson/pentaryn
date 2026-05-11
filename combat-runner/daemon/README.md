# Build daemon

Hourly automation that keeps the dnd-combat GUI project advancing while you're not at the keyboard. Reads `combat-runner/.build-state.md` + the spec, picks the next pending task, builds, tests, and updates state. Self-unloads when the build is shipped.

## Two layers (one survives a Claude Code restart)

1. **Session cron** (`CronCreate` in this Claude Code session) — fires hourly while Claude Code is open. Job id is in `.build-state.md` frontmatter.
2. **launchd job** (this directory) — survives Claude Code closing, restarts, even sleep/wake. Recommended for overnight runs.

## Enable the launchd job (recommended for overnight)

```bash
chmod +x combat-runner/daemon/build-daemon.sh
launchctl bootstrap "gui/$(id -u)" combat-runner/daemon/com.dnd.combat-build-daemon.plist
```

That immediately fires once (RunAtLoad=true) and then schedules an hourly fire at minute :07.

To verify it's loaded:

```bash
launchctl print "gui/$(id -u)/com.dnd.combat-build-daemon" | head -30
```

To disable:

```bash
launchctl bootout "gui/$(id -u)" com.dnd.combat-build-daemon
```

## Manual fire (testing)

```bash
bash combat-runner/daemon/build-daemon.sh
```

Outputs land in `combat-runner/daemon/logs/build-<timestamp>.log`. Each fire is one Claude API session — see the daemon prompt in `combat-runner/daemon/prompt.txt`.

## How it knows to stop

When the build is fully shipped (all slices ✓, all tests passing, both review passes clean), the daemon writes `combat-runner/daemon/shipped.flag` and calls `launchctl bootout` on itself. Subsequent fires are no-ops until you delete the flag (`rm combat-runner/daemon/shipped.flag`).

## Hard rules the daemon obeys

- **No git commits or pushes.** The user reviews diffs by hand.
- **Always runs the test suite** after a code change. Fails the fire if anything regresses.
- **Never modifies files outside `combat-runner/`, `docs/superpowers/specs/`, `pyproject.toml`, `Makefile`, or `.gitignore`** unless the spec explicitly requires it.

## Cost note

Each fire invokes `claude --print` for a daemon session that may dispatch subagents. With prompt caching and the bounded scope, expect well under $1 per fire on Haiku/Sonnet pricing. The daemon prompt explicitly asks for time-bounded fires (~30 min of useful work).
