ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
PY := $(shell if [ -x ./.venv/bin/python ]; then echo ./.venv/bin/python; elif [ -x ./venv/bin/python ]; then echo ./venv/bin/python; else echo python3; fi)
# WORLD=<name> overrides which Foundry world the actor pipeline targets. Default and
# rationale live in scripts/foundry/ops/config.py; the pipeline prints the target on
# every run and refuses if the directory isn't there.
OPS := cd $(ROOT) && $(if $(WORLD),PENTARYN_FOUNDRY_WORLD=$(WORLD) ,)$(PY) -m scripts.foundry.ops
# Short names for `make help`, from the module folders (a test proves each is registered).
MODULE_NAMES = $(sort $(patsubst pentaryn-%,%,$(notdir $(patsubst %/module.json,%,$(wildcard $(ROOT)/foundry/module/*/module.json)))))
# Retired modules (ModuleSpec.retired in scripts/foundry/ops/config.py; a test keeps the two equal):
# their source stays and -check still runs, but module-sync refuses them, so help offers no -sync.
# None today: walls was removed from the repo instead (context/foundry/retired.md).
RETIRED_MODULES :=
RETIRED_NOTE = $(if $(strip $(RETIRED_MODULES)),; retired$(,) -check only: $(RETIRED_MODULES))
, := ,

# This file is a list of the commands worth remembering. The logic behind them lives
# in Python — `scripts/foundry/ops/` for the server and pipeline, `scripts/foundry/
# update/` for the updater, `scripts/foundry/cloud.py` for OneDrive. Why each command
# behaves the way it does is in context/foundry/ops.md, not in comments here.
#
# Three layers, and they are not the same thing:
#   vtt-*      the composite — lock check, then foundry-up/-down, with the tunnel around it.
#   foundry-*  one piece: the application (its up/down take the backups), its data, its modules.
#   tunnel-*   one piece: the Cloudflare tunnel.
# `make vtt-up` is what you want at the table. The pieces are what you reach for when
# one of them is the thing that's wrong.

.PHONY: help
help:
	@echo ""
	@echo "  At the table"
	@echo "    make vtt-up            foundry-up + the tunnel, players can connect"
	@echo "                           FROM=latest|local|<snapshot> decides the boot choice"
	@echo "                           (default: asks when the cloud is newer, at a terminal)"
	@echo "    make login             pick a campaign + user, land in the world logged in"
	@echo "    make vtt-down          the tunnel down, then foundry-down: snapshot the world (~45 MB)"
	@echo "                           + changed modules; upload in background (WAIT=1 waits)"
	@echo "    make vtt               status: app, tunnel, public reachability"
	@echo ""
	@echo "  Content"
	@echo "    make foundry-import    build actors -> stage -> import -> delete -> verify"
	@echo "    make foundry-importer-install  check + install the importer's code only (no actors.json)"
	@echo "    make foundry-<m>-check prove one module (parse, imports, i18n, tests, kit, conformance)"
	@echo "    make foundry-<m>-sync  check, then install it into Foundry's Data/modules"
	@echo "      <m>: $(filter-out $(RETIRED_MODULES),$(MODULE_NAMES))   (importer: -check only; install with foundry-importer-install$(RETIRED_NOTE))"
	@echo "    make foundry-modules-check  every module, keeps going (JSON=1 for --json)"
	@echo ""
	@echo "  Building modules (context/foundry/addon-blueprint.md)"
	@echo "    make foundry-module-new M=<short> TITLE=\"Pentaryn <Title>\" [TIER=small]"
	@echo "    make foundry-conformance [M=<short>] [MD=1]   score against the blueprint"
	@echo "    make foundry-lib-check  the shared kit's tests; foundry-lib-vendor re-vendors it"
	@echo ""
	@echo "  Housekeeping"
	@echo "    make foundry-up        the app alone: boot choice, pre-launch backup, assets, start"
	@echo "    make foundry-down      the app alone: stop, then the shutdown snapshot (WAIT=1 waits)"
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

# The backups live in foundry-up (pre-launch) and foundry-down (shutdown); vtt-up/vtt-down add
# only the lock check and the tunnel around them, so each takes exactly one. On the alt host
# tunnel-up is a loud no-op.
vtt-up: vtt-lock-check foundry-up tunnel-up
	@echo ""
	@if [ "$$(cd $(ROOT) && $(PY) -m scripts.foundry.host role 2>/dev/null)" = primary ] || [ "$$PENTARYN_ROLE_OVERRIDE" = primary ]; then \
	  echo "  ▸ players:  https://$(TUNNEL_HOST)"; \
	else echo "  ▸ players:  none — this is the alt host (no tunnel)"; fi
	@echo "  ▸ local:    $(FOUNDRY_URL)"
	@echo "  ▸ teardown: make vtt-down"

vtt-down: vtt-lock-check tunnel-down foundry-down
	@echo "  ▸ all down"

# Start the app, launch the world, and land in it as GM — no dropdown, no password.
# Not folded into vtt-up: that one must stay safe to run unattended (no terminal), where
# popping a browser window open would be wrong. See scripts/foundry/ops/login.py.
# A player tab beside the GM's: make login USER_NAME=Talo LOGIN_HOST=zz1.localhost (or 127.0.0.1; NO_OPEN=1 prints the URL).
vtt-login login:
	@$(OPS) login $(if $(USER_NAME),--user "$(USER_NAME)") $(if $(WORLD),--world "$(WORLD)") $(if $(LOGIN_HOST),--host "$(LOGIN_HOST)") $(if $(NO_OPEN),--no-open)

vtt: vtt-status
vtt-status:
	@$(OPS) status

# The 03:00 nightly (Windows Task Scheduler → wsl.exe → automation/bin/vtt-nightly.sh): stop,
# snapshot + upload, start, relaunch the world. Log: .state/logs/vtt-nightly-YYYY-MM.log.
.PHONY: vtt-nightly vtt-nightly-dry vtt-nightly-log vtt-nightly-register vtt-nightly-unregister
.PHONY: vtt-nightly-host-check
NIGHTLY_PS1 = $(shell wslpath -w $(ROOT)/automation/windows/register-vtt-nightly.ps1 2>/dev/null)
POWERSHELL = /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe
vtt-nightly: vtt-nightly-host-check ; @$(ROOT)/automation/bin/vtt-nightly.sh; rc=$$?; tail -n 25 $(ROOT)/.state/logs/vtt-nightly-$$(date +%Y-%m).log; exit $$rc
vtt-nightly-dry: vtt-nightly-host-check ; @DRY=1 $(ROOT)/automation/bin/vtt-nightly.sh; tail -n 25 $(ROOT)/.state/logs/vtt-nightly-$$(date +%Y-%m).log
vtt-nightly-log:        ; @tail -n $(or $(N),60) $(ROOT)/.state/logs/vtt-nightly-$$(date +%Y-%m).log
vtt-nightly-register: vtt-nightly-host-check ; @$(POWERSHELL) -NoProfile -ExecutionPolicy Bypass -File "$(NIGHTLY_PS1)" $(if $(WSL_DISTRO_NAME),-Distro "$(WSL_DISTRO_NAME)")
vtt-nightly-unregister: vtt-nightly-host-check ; @$(POWERSHELL) -NoProfile -ExecutionPolicy Bypass -File "$(NIGHTLY_PS1)" -Unregister
vtt-nightly-host-check:
	@[ -x "$(POWERSHELL)" ] && command -v wslpath >/dev/null || { echo "  ✗ the nightly is a Windows Task Scheduler job — BOSS/WSL only"; exit 1; }

# ─── The pieces: application, tunnel ────────────────────────────────────
.PHONY: foundry-up foundry-down tunnel-up tunnel-down tunnel-logs tunnel-setup foundry-boot
.PHONY: foundry-bridge-status foundry-bridge-clean foundry-eval-report
.PHONY: foundry-headless-install foundry-headless-start foundry-headless-stop foundry-headless-restart
.PHONY: foundry-headless-status foundry-headless-logs foundry-headless-ensure foundry-headless-test

# The boot choice: newest cloud snapshot (any host) or the local world. Asks only at a
# terminal and only when the cloud is newer than what this world is based on.
foundry-boot:
	@cd $(ROOT) && $(PY) -m scripts.foundry.boot choose $(if $(FROM),--from $(FROM),)
# The boot choice, then the pre-launch backup, the asset unpack, then the app. foundry-boot
# comes BEFORE the backup: when the cloud's newest is taken, the restore has already archived
# the local world, and the backup then digest-skips rather than uploading a world that was just
# replaced. Both cloud steps are the -safe variants: an unreachable cloud warns, never stops;
# the backup skips while the server is already up or a shutdown upload is still running.
# PENTARYN_BOOT_DONE: foundry-boot already ran, so service.up() does not ask again.
foundry-up: foundry-boot foundry-backup-safe foundry-assets-safe ; @export PENTARYN_BOOT_DONE=1; $(OPS) up
# Stop the app, then the shutdown snapshot: its tar is built here (Foundry stopped), its upload
# runs in the background and `make foundry-cloud` shows it. WAIT=1: upload before returning.
# So every stop backs up once (vtt-down through it), and every start once (foundry-up above).
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

# The headless Assistant-GM bot "Claude" (context/foundry/headless-gm.md): an always-on
# headless Chrome on this host that keeps the MCP bridge connected for every Claude session.
# install: node deps, chrome-headless-shell, Chrome's libs (no sudo; APT=1 = apt-get them),
# env keys, the systemd --user unit (NO_START=1: enable only). ensure: create the bot user in
# the active world if it is missing. status: JSON=1 for --json.
HEADLESS_UNIT := foundry-headless-gm
HEADLESS_NODE = "$$($(PY) -c 'from scripts.foundry import host; print(host.node())')"
foundry-headless-install: ; @cd $(ROOT) && $(if $(APT),APT=1 ,)$(if $(NO_START),NO_START=1 ,)automation/headless-gm/install.sh
foundry-headless-start:   ; @systemctl --user start $(HEADLESS_UNIT)
foundry-headless-stop:    ; @systemctl --user stop $(HEADLESS_UNIT)
foundry-headless-restart: ; @systemctl --user restart $(HEADLESS_UNIT)
foundry-headless-status:  ; @$(OPS) headless-gm status $(if $(JSON),--json,)
foundry-headless-logs:    ; @journalctl --user -u $(HEADLESS_UNIT) -n $(or $(N),60) --no-pager
foundry-headless-ensure:  ; @cd $(ROOT) && $(HEADLESS_NODE) automation/headless-gm/watchdog.mjs --bootstrap-only
foundry-headless-test:    ; @cd $(ROOT) && $(HEADLESS_NODE) --test automation/headless-gm/state.test.mjs

# ─── Secrets ────────────────────────────────────────────────────────────
# Both live in Infisical and are read at the point of use. The checks print length
# and source only, never the value. See scripts/foundry/README.md.
.PHONY: foundry-check foundry-key foundry-admin-push foundry-admin-check
.PHONY: foundry-admin-configure foundry-admin-key

foundry-check:
	@cd $(ROOT) && $(PY) -m scripts.foundry.license_key

# host.clipboard: pbcopy (Mac), clip.exe (WSL, by full path when System32 is off PATH), xclip —
# the value goes through a pipe, never argv. The ✓ prints only when the copy succeeded; a
# failure (no clipboard tool, Infisical auth) keeps its stderr and fails the target.
foundry-key:
	@cd $(ROOT) && infisical run --silent -- \
	  sh -c 'printf "%s" "$$FOUNDRY_VTT_LICENSE_KEY" | $(PY) -m scripts.foundry.host clipboard' \
	  && echo "  ✓ license key copied to clipboard — paste into Foundry, then clear the clipboard"

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
# The importer's code alone (module-check + install, nothing staged). foundry-sync stages actors.json
# with it; foundry-importer-sync (the foundry-%-sync pattern below) only prints module-sync's refusal.
foundry-importer-install: ; @$(OPS) importer-install

# ─── Foundry ⇄ OneDrive ─────────────────────────────────────────────────
# One direction each way so the two can never fight over a file: assets flow DOWN,
# the world flows UP. Restore is never silent: foundry-boot offers the newest snapshot at
# a terminal; see scripts/foundry/cloud.py and context/foundry/ops.md §3.
.PHONY: foundry-assets foundry-assets-safe foundry-backup foundry-backup-safe foundry-restore foundry-cloud
.PHONY: foundry-prune-untagged foundry-bundles foundry-bundles-gc

foundry-assets:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud assets

# Lifecycle variant (foundry-up's): a cloud that is down is a warning, not a stop — `make
# foundry-up`/`vtt-up` never block on the cloud (ops.md §3). A badly named or edited pack still fails.
foundry-assets-safe:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud assets --if-reachable

# BACKGROUND=1 (what foundry-down passes, so vtt-down too): build the tar, upload it from a detached process.
foundry-backup:
	@cd $(ROOT) && $(PY) -m scripts.foundry.cloud backup --reason $(or $(REASON),manual)$(if $(BACKGROUND), --background,)

# Lifecycle variant (foundry-up's pre-launch backup): skips quietly when the server is already
# up, so `make vtt-up` on a running server does not abort before starting the tunnel; a cloud
# that is down is a warning, so it does not stop the start either.
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

.PHONY: foundry-modules-check
# Every registered module through every gate; keeps going past a failure. JSON=1 for --json.
foundry-modules-check: ; @$(OPS) module-check --all $(if $(JSON),--json,)

# ─── Addon blueprint: the shared kit, the generator, the scorer ──────────
# Playbook: context/foundry/addon-blueprint.md. M=<short> picks one module.
.PHONY: foundry-lib-check foundry-lib-vendor foundry-module-new foundry-conformance foundry-module-index
# The kit's own suite (foundry/lib).
# host.node() / host.foundry_app_root(): nvm's node and this host's app even where neither is
# on PATH or exported (systemd --user, non-login shells) — else the stub silently uses shims.
foundry-lib-check:
	@cd $(ROOT) && FOUNDRY_APP_ROOT="$${FOUNDRY_APP_ROOT:-$$($(PY) -c 'from scripts.foundry import host; print(host.foundry_app_root())')}" \
	  "$$($(PY) -c 'from scripts.foundry import host; print(host.node())')" foundry/lib/test/run.mjs
# Re-vendor the kit into every migrated module (those with lib/kit.lock.json), or M=<short>.
foundry-lib-vendor: ; @$(OPS) module-vendor sync $(if $(M),$(M),--all)
# make foundry-module-new M=<short> TITLE="Pentaryn <Title>" [TIER=small] [ARGS="--kit perf"]
foundry-module-new:
	@$(if $(M),,$(error M=<short> is required))$(if $(TITLE),,$(error TITLE="Pentaryn <Title>" is required))
	@$(OPS) module-new $(M) --title "$(TITLE)" --tier $(if $(TIER),$(TIER),full) $(ARGS)
# Regenerate the Module APIs table in context/foundry/README.md (check-context fails when stale).
# `--check` (or CHECK=1) only reports a stale table. GNU make reads `--check` as its own
# --check-symlink-times (-L, by unambiguous prefix), so it reaches us only as an L among MAKEFLAGS'
# short flags. MAKEFLAGS has no one shape (make 3.81: `L`, `nL`, ` --no-print-directory -sL`,
# `L -- M=x`, a bare `WORLD=x` with no flags at all; 4.x: `L --no-print-directory -- M=x`), so:
# drop the command-line assignments (they are exactly MAKEOVERRIDES), then look for the L in the
# short-flag words alone — the first word when it has no dash, and every single-dash word. Long
# options (--x, --x=y, the bare --) and option arguments (`-I Lib` -> `I Lib` on 3.81, one word
# `-ILib` on 4.4, like `-Oline`) never count.
MAKEFLAGS_NO_VARS = $(subst $(MAKEOVERRIDES),,$(MAKEFLAGS))
MAKE_SHORT_FLAGS = $(filter-out -%,$(firstword $(MAKEFLAGS_NO_VARS))) $(filter-out --% -I% -W% -O%,$(filter -%,$(MAKEFLAGS_NO_VARS)))
INDEX_CHECK = $(if $(or $(CHECK),$(findstring L,$(MAKE_SHORT_FLAGS))),--check,)
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
