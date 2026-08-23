ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
PY := $(shell if [ -x ./.venv/bin/python ]; then echo ./.venv/bin/python; elif [ -x ./venv/bin/python ]; then echo ./venv/bin/python; else echo python3; fi)
# WORLD=<name> overrides which Foundry world the actor pipeline targets. Default and
# rationale live in scripts/foundry/ops/config.py; the pipeline prints the target on
# every run and refuses if the directory isn't there.
OPS := cd $(ROOT) && $(if $(WORLD),PENTARYN_FOUNDRY_WORLD=$(WORLD) ,)$(PY) -m scripts.foundry.ops

# This file is a list of the commands worth remembering. The logic behind them lives
# in Python — `scripts/foundry/ops/` for the server and pipeline, `scripts/foundry/
# update/` for the updater, `scripts/foundry/cloud.py` for OneDrive. Why each command
# behaves the way it does is in context/foundry/ops.md, not in comments here.
#
# Three layers, and they are not the same thing:
#   vtt-*      the composite — lock check, backup, assets, app, tunnel. Table-facing.
#   foundry-*  one piece: the application, its data, its modules.
#   tunnel-*   one piece: the Cloudflare tunnel.
# `make vtt-up` is what you want at the table. The pieces are what you reach for when
# one of them is the thing that's wrong.

.PHONY: help
help:
	@echo ""
	@echo "  At the table"
	@echo "    make vtt-up            Foundry + tunnel, players can connect"
	@echo "    make login             pick a campaign + user, land in the world logged in"
	@echo "    make vtt-down          tear both down, snapshot the world"
	@echo "    make vtt               status: app, tunnel, public reachability"
	@echo ""
	@echo "  Content"
	@echo "    make foundry-import    build actors -> stage -> import -> delete -> verify"
	@echo "    make foundry-ties-sync install the NPC Ties module"
	@echo "    make foundry-walls-sync install the Wall Autocomplete module"
	@echo "    make foundry-attunement-sync install the Attunement Slots module"
	@echo ""
	@echo "  Housekeeping"
	@echo "    make foundry-backup    snapshot the world to OneDrive"
	@echo "    make foundry-restore   list snapshots (SNAP=<id> to restore one)"
	@echo "    make vtt-update-dry    what a Saturday run WOULD change"
	@echo "    make check-context     CLAUDE.md + context/ integrity"
	@echo ""
	@echo "  Everything else: make -pRrq | grep '^[a-z]' | sort, or read this file."
	@echo ""

# ─── Instruction surface ────────────────────────────────────────────────
.PHONY: check-context
check-context:
	@cd $(ROOT) && $(PY) scripts/check_context.py

# ─── Table lifecycle ────────────────────────────────────────────────────
TUNNEL_HOST := vtt.atjoseph.com
FOUNDRY_URL := http://localhost:30000

.PHONY: vtt-up vtt-down vtt vtt-status vtt-lock-check vtt-login login

vtt-lock-check:
	@$(OPS) lock-check

vtt-up: vtt-lock-check foundry-backup-safe foundry-assets foundry-up tunnel-up
	@echo ""
	@echo "  ▸ players:  https://$(TUNNEL_HOST)"
	@echo "  ▸ local:    $(FOUNDRY_URL)"
	@echo "  ▸ teardown: make vtt-down"

vtt-down: vtt-lock-check tunnel-down foundry-down
	@$(MAKE) --no-print-directory foundry-backup REASON=shutdown
	@echo "  ▸ all down"

# Start the app, launch the world, and land in it as GM — no dropdown, no password.
# Not folded into vtt-up: that one runs unattended from the updater, where popping a
# browser window open would be wrong. See scripts/foundry/ops/login.py.
vtt-login login:
	@$(OPS) login $(if $(USER_NAME),--user "$(USER_NAME)") $(if $(WORLD),--world "$(WORLD)")

vtt: vtt-status
vtt-status:
	@$(OPS) status

# ─── The pieces: application, tunnel ────────────────────────────────────
.PHONY: foundry-up foundry-down tunnel-up tunnel-down tunnel-logs tunnel-setup
.PHONY: foundry-bridge-status foundry-bridge-clean

foundry-up:      ; @$(OPS) up
foundry-down:    ; @$(OPS) down
tunnel-up:       ; @$(OPS) tunnel-up
tunnel-down:     ; @$(OPS) tunnel-down
tunnel-logs:     ; @$(OPS) tunnel-logs
tunnel-setup:    ; @$(OPS) tunnel-setup

# Every Claude Code session spawns its own MCP server, and the first one also spawns the
# singleton broker that owns the bridge's websocket ports. Nothing cleans them up. A
# broker left behind by a finished session keeps the ports, Foundry's browser reconnects
# to it after a restart, and every bridge tool times out with nothing logged. `clean`
# kills orphans only — never a server whose parent is a live Claude session.
foundry-bridge-status: ; @$(OPS) bridge-status
foundry-bridge-clean:  ; @$(OPS) bridge-clean $(if $(DRY),--dry-run,)

# ─── Secrets ────────────────────────────────────────────────────────────
# Both live in Infisical and are read at the point of use. The checks print length
# and source only, never the value. See scripts/foundry/README.md.
.PHONY: foundry-check foundry-key foundry-admin-push foundry-admin-check
.PHONY: foundry-admin-configure foundry-admin-key

foundry-check:
	@cd $(ROOT) && $(PY) -m scripts.foundry.license_key

foundry-key:
	@cd $(ROOT) && infisical run --silent -- \
	  sh -c 'printf "%s" "$$FOUNDRY_VTT_LICENSE_KEY" | pbcopy' 2>/dev/null
	@echo "  ✓ license key copied to clipboard — paste into Foundry, then run: pbcopy </dev/null"

foundry-admin-push:
	@$(ROOT)/automation/bin/foundry-admin-push.sh

foundry-admin-check:
	@cd $(ROOT) && $(PY) -m scripts.foundry.admin_password

# Tells Foundry itself to use it. The world must be stopped.
foundry-admin-configure:
	@cd $(ROOT) && $(PY) -m scripts.foundry.update.cli admin-configure

foundry-admin-key:
	@cd $(ROOT) && $(PY) -c "from scripts.foundry.admin_password import foundry_admin_password; import subprocess; subprocess.run(['pbcopy'], input=foundry_admin_password(), text=True)"
	@echo "  ✓ admin password copied to clipboard — paste it, then: pbcopy </dev/null"

# ─── Actor pipeline ─────────────────────────────────────────────────────
# `foundry-import` is the one to use — it stages, waits while you run the import in
# Foundry's console, then deletes the staged JSON and proves it is no longer served.
# Data/ is public with no auth while the tunnel is up, which is why deletion is a
# required step rather than tidying. See context/foundry/ops.md.
.PHONY: foundry-actors foundry-sync foundry-import foundry-clean foundry-clean-only foundry-verify

foundry-actors:     ; @$(OPS) actors
foundry-sync:       ; @$(OPS) stage
foundry-import:     ; @$(OPS) import
foundry-clean:      ; @$(OPS) clean
foundry-clean-only: ; @$(OPS) clean-only
foundry-verify:     ; @$(OPS) verify

# ─── Foundry ⇄ OneDrive ─────────────────────────────────────────────────
# One direction each way so the two can never fight over a file: assets flow DOWN,
# the world flows UP. Restore is deliberately manual — see scripts/foundry/cloud.py.
.PHONY: foundry-assets foundry-backup foundry-backup-safe foundry-restore foundry-cloud

foundry-assets:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud assets

foundry-backup:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud backup --reason $(or $(REASON),manual)

# Lifecycle variant: skips quietly when the server is already up, so `make vtt-up`
# on a running server does not abort before starting the tunnel.
foundry-backup-safe:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud backup --reason prelaunch --if-stopped

# Lists snapshots when given no SNAP; restores that one when given it.
foundry-restore:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud restore $(if $(SNAP),--snapshot $(SNAP),)

foundry-cloud:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud status

# ─── In-house modules ───────────────────────────────────────────────────
# The check step is not optional politeness: a parse error in an esmodule fails
# silently at load and the module simply never registers. Nothing reaches Data/
# unproved. Copy, never symlink — a stale copy must be a visible failure.
.PHONY: foundry-lookup-check foundry-lookup-sync
.PHONY: foundry-ties-check foundry-ties-sync
.PHONY: foundry-walls-test foundry-walls-sync foundry-walls-wasm foundry-walls-bench
.PHONY: foundry-attunement-check foundry-attunement-sync

foundry-lookup-check: ; @$(OPS) module-check lookup
foundry-lookup-sync:  ; @$(OPS) module-sync lookup
foundry-ties-check:  ; @$(OPS) module-check ties
foundry-ties-sync:   ; @$(OPS) module-sync ties
foundry-attunement-check: ; @$(OPS) module-check attunement
foundry-attunement-sync:  ; @$(OPS) module-sync attunement
foundry-walls-test:  ; @$(OPS) module-check walls
foundry-walls-sync:  ; @$(OPS) module-sync walls
foundry-walls-wasm:  ; @$(OPS) walls-wasm
foundry-walls-bench: ; @$(OPS) walls-bench $(N)

# ─── Auto-update (Saturdays 04:06, watchdog 06:12) ──────────────────────
# Design and one-time setup: automation/README.md
VTT_UPDATE_PAUSE := $(ROOT)/.state/vtt-update.pause
LAUNCH_AGENTS := $(HOME)/Library/LaunchAgents
UPDATE_CLI := cd $(ROOT) && $(PY) -m scripts.foundry.update.cli

.PHONY: vtt-update-dry vtt-update-scan vtt-update-now vtt-update-status
.PHONY: vtt-update-install vtt-update-uninstall vtt-update-pause vtt-update-resume vtt-notifier

vtt-update-dry:    ; @$(UPDATE_CLI) scan --notes
vtt-update-scan:   ; @$(UPDATE_CLI) scan
vtt-update-status: ; @$(UPDATE_CLI) status

vtt-update-now:
	@cd $(ROOT) && ./automation/bin/vtt-update.sh --force
	@echo "  ▸ log: .state/logs/vtt-update-$$(date +%F).log"

vtt-update-install: vtt-notifier
	@mkdir -p $(ROOT)/.state/logs
	@cp $(ROOT)/automation/launchd/com.pentaryn.vtt-update.plist $(LAUNCH_AGENTS)/
	@cp $(ROOT)/automation/launchd/com.pentaryn.vtt-update-watchdog.plist $(LAUNCH_AGENTS)/
	@launchctl bootout gui/$$(id -u)/com.pentaryn.vtt-update 2>/dev/null || true
	@launchctl bootout gui/$$(id -u)/com.pentaryn.vtt-update-watchdog 2>/dev/null || true
	@launchctl bootstrap gui/$$(id -u) $(LAUNCH_AGENTS)/com.pentaryn.vtt-update.plist
	@launchctl bootstrap gui/$$(id -u) $(LAUNCH_AGENTS)/com.pentaryn.vtt-update-watchdog.plist
	@echo "  ✓ installed — Saturdays 04:06, watchdog 06:12"
	@echo "  ▸ verify: launchctl list | grep pentaryn.vtt"

vtt-update-uninstall:
	@launchctl bootout gui/$$(id -u)/com.pentaryn.vtt-update 2>/dev/null || true
	@launchctl bootout gui/$$(id -u)/com.pentaryn.vtt-update-watchdog 2>/dev/null || true
	@rm -f $(LAUNCH_AGENTS)/com.pentaryn.vtt-update.plist
	@rm -f $(LAUNCH_AGENTS)/com.pentaryn.vtt-update-watchdog.plist
	@echo "  ✓ removed"

vtt-update-pause:
	@mkdir -p $(ROOT)/.state && touch $(VTT_UPDATE_PAUSE)
	@echo "  ✓ paused — scheduled runs will decline until: make vtt-update-resume"

vtt-update-resume:
	@rm -f $(VTT_UPDATE_PAUSE)
	@echo "  ✓ resumed"

# Builds "Ardenhaven VTT.app", the identity notifications are posted under.
vtt-notifier:
	@$(ROOT)/automation/notifier/build-notifier.sh
