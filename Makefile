ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
PY := $(shell if [ -x ./.venv/bin/python ]; then echo ./.venv/bin/python; elif [ -x ./venv/bin/python ]; then echo ./venv/bin/python; else echo python3; fi)
# WORLD=<name> overrides which Foundry world the actor pipeline targets. Default and
# rationale live in scripts/foundry/ops/config.py; the pipeline prints the target on
# every run and refuses if the directory isn't there.
OPS := cd $(ROOT) && $(if $(WORLD),PENTARYN_FOUNDRY_WORLD=$(WORLD) ,)$(PY) -m scripts.foundry.ops
# Short names for `make help`, from the module folders (a test proves each is registered).
MODULE_NAMES = $(sort $(patsubst pentaryn-%,%,$(notdir $(patsubst %/module.json,%,$(wildcard $(ROOT)/foundry/module/*/module.json)))))

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
	@echo "                           FROM=latest|local|<snapshot> decides the boot choice"
	@echo "                           (default: asks when the cloud is newer, at a terminal)"
	@echo "    make login             pick a campaign + user, land in the world logged in"
	@echo "    make vtt-down          tear both down, snapshot the world (~45 MB) + changed modules;"
	@echo "                           upload in background (WAIT=1 waits)"
	@echo "    make vtt               status: app, tunnel, public reachability"
	@echo ""
	@echo "  Content"
	@echo "    make foundry-import    build actors -> stage -> import -> delete -> verify"
	@echo "    make foundry-importer-install  check + install the importer's code only (no actors.json)"
	@echo "    make foundry-<m>-check prove one module (parse, imports, i18n, tests, kit, conformance)"
	@echo "    make foundry-<m>-sync  check, then install it into Foundry's Data/modules"
	@echo "      <m>: $(MODULE_NAMES)   (importer: -check only; install with foundry-importer-install)"
	@echo "    make foundry-modules-check  every module, keeps going (JSON=1 for --json)"
	@echo ""
	@echo "  Building modules (context/foundry/addon-blueprint.md)"
	@echo "    make foundry-module-new M=<short> TITLE=\"Pentaryn <Title>\" [TIER=small]"
	@echo "    make foundry-conformance [M=<short>] [MD=1]   score against the blueprint"
	@echo "    make foundry-lib-check  the shared kit's tests; foundry-lib-vendor re-vendors it"
	@echo ""
	@echo "  Housekeeping"
	@echo "    make foundry-backup    snapshot the world (~45 MB) + changed modules to OneDrive"
	@echo "    make foundry-restore   list snapshots, every host (SNAP=<id> to restore one)"
	@echo "    make foundry-boot      just the boot choice: newest cloud snapshot or local (FROM=)"
	@echo "    make foundry-cloud     what is where: storage, host, role, based-on, per host"
	@echo "    make foundry-prune-untagged  list pre-2026-10-11 snapshots, delete on confirm"
	@echo "    make foundry-bundles      local modules/systems, their fingerprints, what the cloud has"
	@echo "    make foundry-bundles-gc   list unreferenced bundles older than 7 days (YES=1 deletes)"
	@echo "    make vtt-update-dry    what a Saturday run WOULD change"
	@echo "    make check-context     CLAUDE.md + context/ integrity"
	@echo "    make check-lore        wikilinks + frontmatter across the lore trees"
	@echo "    make test              the Python suites (pytest)"
	@echo "    make check-all         all of the above checks + kit + every module"
	@echo ""
	@echo "  Everything else: make -pRrq | grep '^[a-z]' | sort, or read this file."
	@echo ""

# ─── Instruction surface ────────────────────────────────────────────────
.PHONY: check-context check-lore check-all test
check-context:
	@cd $(ROOT) && $(PY) scripts/check_context.py

# The lore trees use wikilinks, which check_context.py and fix_md_links cannot
# see. This is what watches them.
check-lore:
	@cd $(ROOT) && $(PY) scripts/check_lore_links.py

# Everything provable offline: docs, lore, the Python suites, the kit, every module.
check-all: check-context check-lore test foundry-lib-check foundry-modules-check

# The Python suites (pyproject testpaths: scripts/tests + scripts/foundry/blueprint/tests).
test:
	@cd $(ROOT) && $(PY) -m pytest -q

# ─── Table lifecycle ────────────────────────────────────────────────────
TUNNEL_HOST := vtt.atjoseph.com
FOUNDRY_URL := http://localhost:30000
# FROM=latest | local | <snapshot name> — the boot choice (scripts/foundry/boot.py).
# Exported so `make login FROM=…` reaches service.up()'s own boot step too.
export FROM

.PHONY: vtt-up vtt-down vtt vtt-status vtt-lock-check vtt-login login

vtt-lock-check:
	@$(OPS) lock-check

# foundry-boot comes BEFORE the pre-launch backup: when the cloud's newest is taken, the
# restore has already archived the local world, and the backup then digest-skips rather
# than uploading a world that was just replaced. On the alt host tunnel-up is a loud no-op.
vtt-up: vtt-lock-check foundry-boot foundry-backup-safe foundry-assets-safe foundry-up tunnel-up
	@echo ""
	@if [ "$$(cd $(ROOT) && $(PY) -m scripts.foundry.host role 2>/dev/null)" = primary ] || [ "$$PENTARYN_ROLE_OVERRIDE" = primary ]; then \
	  echo "  ▸ players:  https://$(TUNNEL_HOST)"; \
	else echo "  ▸ players:  none — this is the alt host (no tunnel)"; fi
	@echo "  ▸ local:    $(FOUNDRY_URL)"
	@echo "  ▸ teardown: make vtt-down"

# The shutdown snapshot comes from foundry-down (below), once: vtt-down does not take a second.
vtt-down: vtt-lock-check tunnel-down foundry-down
	@echo "  ▸ all down"

# Start the app, launch the world, and land in it as GM — no dropdown, no password.
# Not folded into vtt-up: that one runs unattended from the updater, where popping a
# browser window open would be wrong. See scripts/foundry/ops/login.py.
# A player tab beside the GM's: make login USER_NAME=Talo LOGIN_HOST=zz1.localhost (or 127.0.0.1; NO_OPEN=1 prints the URL).
vtt-login login:
	@$(OPS) login $(if $(USER_NAME),--user "$(USER_NAME)") $(if $(WORLD),--world "$(WORLD)") $(if $(LOGIN_HOST),--host "$(LOGIN_HOST)") $(if $(NO_OPEN),--no-open)

vtt: vtt-status
vtt-status:
	@$(OPS) status

# ─── The pieces: application, tunnel ────────────────────────────────────
.PHONY: foundry-up foundry-down tunnel-up tunnel-down tunnel-logs tunnel-setup foundry-boot
.PHONY: foundry-bridge-status foundry-bridge-clean foundry-eval-report

# The boot choice: newest cloud snapshot (any host) or the local world. Asks only at a
# terminal and only when the cloud is newer than what this world is based on.
foundry-boot:
	@cd $(ROOT) && $(PY) -m scripts.foundry.boot choose $(if $(FROM),--from $(FROM),)
# PENTARYN_BOOT_DONE: foundry-boot already ran, so service.up() does not ask again.
foundry-up: foundry-boot ; @export PENTARYN_BOOT_DONE=1; $(OPS) up
# Stop the app, then the shutdown snapshot: its tar is built here (Foundry stopped), its upload
# runs in the background and `make foundry-cloud` shows it. WAIT=1: upload before returning.
# So every stop backs up — vtt-down, and a restart (foundry-down then foundry-up) — once.
foundry-down:
	@$(OPS) down
	@$(MAKE) --no-print-directory foundry-backup REASON=shutdown $(if $(WAIT),,BACKGROUND=1)
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
# What the MCP action logs show (eval-js outcomes, game.pentaryn paths, per-tool counts).
# Read-only. SINCE=2026-10-01 narrows it; JSON=1 for --json.
foundry-eval-report:   ; @$(OPS) eval-report $(if $(SINCE),--since $(SINCE),) $(if $(JSON),--json,)

# ─── Secrets ────────────────────────────────────────────────────────────
# Both live in Infisical and are read at the point of use. The checks print length
# and source only, never the value. See scripts/foundry/README.md.
.PHONY: foundry-check foundry-key foundry-admin-push foundry-admin-check
.PHONY: foundry-admin-configure foundry-admin-key

foundry-check:
	@cd $(ROOT) && $(PY) -m scripts.foundry.license_key

# host.clipboard: pbcopy (Mac), clip.exe (WSL), xclip — the value goes through a pipe, never argv.
foundry-key:
	@cd $(ROOT) && infisical run --silent -- \
	  sh -c 'printf "%s" "$$FOUNDRY_VTT_LICENSE_KEY" | $(PY) -m scripts.foundry.host clipboard' 2>/dev/null
	@echo "  ✓ license key copied to clipboard — paste into Foundry, then clear the clipboard"

foundry-admin-push:
	@$(ROOT)/automation/bin/foundry-admin-push.sh

foundry-admin-check:
	@cd $(ROOT) && $(PY) -m scripts.foundry.admin_password

# Tells Foundry itself to use it. The world must be stopped.
foundry-admin-configure:
	@cd $(ROOT) && $(PY) -m scripts.foundry.update.cli admin-configure

foundry-admin-key:
	@cd $(ROOT) && $(PY) -c "import sys; from scripts.foundry.admin_password import foundry_admin_password; from scripts.foundry import host; sys.exit(0 if host.clipboard(foundry_admin_password()) else 1)"
	@echo "  ✓ admin password copied to clipboard — paste it, then clear the clipboard"

# ─── Actor pipeline ─────────────────────────────────────────────────────
# `foundry-import` is the one to use — it stages, waits while you run the import in
# Foundry's console, then deletes the staged JSON and proves it is no longer served.
# Data/ is public with no auth while the tunnel is up, which is why deletion is a
# required step rather than tidying. See context/foundry/ops.md.
.PHONY: foundry-actors foundry-sync foundry-import foundry-clean foundry-clean-only foundry-verify
.PHONY: foundry-importer-install

foundry-actors:     ; @$(OPS) actors
foundry-sync:       ; @$(OPS) stage
foundry-import:     ; @$(OPS) import
foundry-clean:      ; @$(OPS) clean
foundry-clean-only: ; @$(OPS) clean-only
foundry-verify:     ; @$(OPS) verify
# The importer's code alone (module-check + install, nothing staged): module-sync refuses it, and
# foundry-sync stages actors.json with it. There is no foundry-importer-sync.
foundry-importer-install: ; @$(OPS) importer-install

# ─── Foundry ⇄ OneDrive ─────────────────────────────────────────────────
# One direction each way so the two can never fight over a file: assets flow DOWN,
# the world flows UP. Restore is never silent: foundry-boot offers the newest snapshot at
# a terminal; see scripts/foundry/cloud.py and context/foundry/ops.md §3.
.PHONY: foundry-assets foundry-assets-safe foundry-backup foundry-backup-safe foundry-restore foundry-cloud
.PHONY: foundry-prune-untagged foundry-bundles foundry-bundles-gc

foundry-assets:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud assets

# Lifecycle variant: a cloud that is down is a warning, not a stop — `make vtt-up` never
# blocks on the cloud (ops.md §3). A badly named or edited pack still fails.
foundry-assets-safe:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud assets --if-reachable

# BACKGROUND=1 (what foundry-down passes, so vtt-down too): build the tar, upload it from a detached process.
foundry-backup:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud backup --reason $(or $(REASON),manual)$(if $(BACKGROUND), --background,)

# Lifecycle variant: skips quietly when the server is already up, so `make vtt-up`
# on a running server does not abort before starting the tunnel; a cloud that is down
# is a warning, so it does not stop the start either.
foundry-backup-safe:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud backup --reason prelaunch --if-stopped

# Lists snapshots when given no SNAP; restores that one when given it.
foundry-restore:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud restore $(if $(SNAP),--snapshot $(SNAP),)

foundry-cloud:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud status

# Untagged (pre-2026-10-11) snapshots belong to no host, so nothing prunes them. Interactive.
foundry-prune-untagged:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud prune-untagged

# Modules and systems travel as content-addressed bundles in bundles/ (ops.md §3).
foundry-bundles:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud bundles

# The sweep that runs after every uploading backup, by hand. A dry run unless YES=1.
foundry-bundles-gc:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud bundles-gc $(if $(YES),--yes,)

# ─── In-house modules ───────────────────────────────────────────────────
# The check step is not optional politeness: a parse error in an esmodule fails
# silently at load and the module simply never registers. Nothing reaches Data/
# unproved. Copy, never symlink — a stale copy must be a visible failure.
#
# Pattern rules, not a line per module: a ModuleSpec in scripts/foundry/ops/config.py
# is all a new module needs to get foundry-<m>-check and foundry-<m>-sync (ops rejects
# an unregistered name). Pattern targets cannot be .PHONY, and need not be.
foundry-%-check: ; @$(OPS) module-check $*
foundry-%-sync:  ; @$(OPS) module-sync $*

.PHONY: foundry-modules-check foundry-walls-test foundry-walls-wasm foundry-walls-bench
# Every registered module through every gate; keeps going past a failure. JSON=1 for --json.
foundry-modules-check: ; @$(OPS) module-check --all $(if $(JSON),--json,)
foundry-walls-test:  foundry-walls-check   # the old name of walls' check
foundry-walls-wasm:  ; @$(OPS) walls-wasm
foundry-walls-bench: ; @$(OPS) walls-bench $(N)

# ─── Addon blueprint: the shared kit, the generator, the scorer ──────────
# Playbook: context/foundry/addon-blueprint.md. M=<short> picks one module.
.PHONY: foundry-lib-check foundry-lib-vendor foundry-module-new foundry-conformance foundry-module-index
# The kit's own suite (foundry/lib).
foundry-lib-check:  ; @cd $(ROOT) && node foundry/lib/test/run.mjs
# Re-vendor the kit into every migrated module (those with lib/kit.lock.json), or M=<short>.
foundry-lib-vendor: ; @$(OPS) module-vendor sync $(if $(M),$(M),--all)
# make foundry-module-new M=<short> TITLE="Pentaryn <Title>" [TIER=small] [ARGS="--kit perf"]
foundry-module-new:
	@$(if $(M),,$(error M=<short> is required))$(if $(TITLE),,$(error TITLE="Pentaryn <Title>" is required))
	@$(OPS) module-new $(M) --title "$(TITLE)" --tier $(if $(TIER),$(TIER),full) $(ARGS)
# Regenerate the Module APIs table in context/foundry/README.md (check-context fails when stale).
# `--check` (or CHECK=1) only reports a stale table. GNU make reads `--check` as its own
# --check-symlink-times (-L, by unambiguous prefix), so it reaches us as an L in MAKEFLAGS' flag word.
INDEX_CHECK = $(if $(or $(CHECK),$(findstring L,$(filter-out -%,$(firstword $(MAKEFLAGS))))),--check,)
foundry-module-index: ; @$(OPS) module-index $(INDEX_CHECK)
# Score against rules C01–C62: every module, or M=<short>; MD=1 for the markdown table.
foundry-conformance: ; @$(OPS) module-conformance $(if $(M),--module $(M),) $(if $(MD),--markdown,)

# ─── Auto-update (Saturdays 04:06, watchdog 06:12) ──────────────────────
# Design and one-time setup: automation/README.md
VTT_UPDATE_PAUSE := $(ROOT)/.state/vtt-update.pause
LAUNCH_AGENTS := $(HOME)/Library/LaunchAgents
UPDATE_CLI := cd $(ROOT) && $(PY) -m scripts.foundry.update.cli

.PHONY: vtt-update-dry vtt-update-scan vtt-update-now vtt-update-status foundry-adjustments-check
.PHONY: vtt-update-install vtt-update-uninstall vtt-update-pause vtt-update-resume vtt-notifier

vtt-update-dry:    ; @$(UPDATE_CLI) scan --notes --escalation
# The adjustments registry (foundry/adjustments.yml) still matches the code it names.
foundry-adjustments-check: ; @cd $(ROOT) && $(PY) -m scripts.foundry.update.adjustments --exposure
vtt-update-scan:   ; @$(UPDATE_CLI) scan
vtt-update-status: ; @$(UPDATE_CLI) status

vtt-update-now:
	@cd $(ROOT) && ./automation/bin/vtt-update.sh --force
	@echo "  ▸ log: .state/logs/vtt-update-$$(date +%F).log"

# launchd is macOS; the updater is the primary host's job (design §8).
vtt-update-install: vtt-update-host-check vtt-notifier
	@mkdir -p $(ROOT)/.state/logs
	@cp $(ROOT)/automation/launchd/com.pentaryn.vtt-update.plist $(LAUNCH_AGENTS)/
	@cp $(ROOT)/automation/launchd/com.pentaryn.vtt-update-watchdog.plist $(LAUNCH_AGENTS)/
	@launchctl bootout gui/$$(id -u)/com.pentaryn.vtt-update 2>/dev/null || true
	@launchctl bootout gui/$$(id -u)/com.pentaryn.vtt-update-watchdog 2>/dev/null || true
	@launchctl bootstrap gui/$$(id -u) $(LAUNCH_AGENTS)/com.pentaryn.vtt-update.plist
	@launchctl bootstrap gui/$$(id -u) $(LAUNCH_AGENTS)/com.pentaryn.vtt-update-watchdog.plist
	@echo "  ✓ installed — Saturdays 04:06, watchdog 06:12"
	@echo "  ▸ verify: launchctl list | grep pentaryn.vtt"

.PHONY: vtt-update-host-check
vtt-update-host-check:
	@[ "$$(uname -s)" = Darwin ] || { echo "  ✗ the auto-updater schedule is a launchd job — macOS only"; exit 1; }
	@cd $(ROOT) && $(PY) -m scripts.foundry.host require-primary "the auto-updater"

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
