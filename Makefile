ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
PY := $(shell if [ -x ./.venv/bin/python ]; then echo ./.venv/bin/python; elif [ -x ./venv/bin/python ]; then echo ./venv/bin/python; else echo python3; fi)

# ─── Party rosters ──────────────────────────────────────────────────────
# One target per party, named after the party. Adding a new table = add a
# roster path here and a target below; nothing else silently changes.
#
# `id` in each roster MUST be a repeated-digit string ("1", "22", "333") or
# the GUI's `<who> <stream>` command grammar can't address that PC.
# Grant Gang == the Ardenford Underdogs. Same table, two names: Grant Gang is
# the players, Ardenford Underdogs is the crew they play in
# campaigns/ardenford-underdogs/. One roster, two aliases.
PARTY_GANG    := world/party/grant-gang/combat-roster.yml
PARTY_COMPASS := world/party/the-compass-edge/combat-roster.yml
PARTY_LEDGER  := world/party/black-ledger/combat-roster.yml

# ─── Combat-runner GUI (PySide6 + qt-material) ──────────────────────────
# Opens the encounter picker, lets you pick mob counts, then launches the
# multi-tab combat window. Discovers NPCs by the #combat-runner tag and reads
# the shared actions DB. This is the at-table default.
#
# The old CLI launcher (combat-runner/launch.py) is no longer wired to a make
# target. If you need the NPC-only fallback, run it directly:
#     ./.venv/bin/python combat-runner/launch.py
.PHONY: combat
combat:
	@cd $(ROOT) && PYTHONPATH=combat-runner $(PY) -m gui.app

# Alias — kept so `make combat-gui` (and docs that reference it) still work.
.PHONY: combat-gui
combat-gui: combat

# ─── Launch with a party preloaded ──────────────────────────────────────
# Each PC gets its own tab and a directed-command id.

# Grant Gang — the level-1 campaign in campaigns/ardenford-underdogs/
.PHONY: grant-gang
grant-gang:
	@cd $(ROOT) && ./scripts/check-roster.sh $(PARTY_GANG)
	@cd $(ROOT) && PYTHONPATH=combat-runner $(PY) -m gui.app --party $(PARTY_GANG)

# Aliases — same party, whichever name is in your head at the time.
.PHONY: underdogs gang
underdogs: grant-gang
gang: grant-gang

# The Compass Edge
.PHONY: compass
compass:
	@cd $(ROOT) && ./scripts/check-roster.sh $(PARTY_COMPASS)
	@cd $(ROOT) && PYTHONPATH=combat-runner $(PY) -m gui.app --party $(PARTY_COMPASS)

# Alias — `make prime` historically meant The Compass Edge. Kept for muscle
# memory and any docs that still say `prime`.
.PHONY: prime
prime: compass

# The Black Ledger
.PHONY: ledger
ledger:
	@cd $(ROOT) && ./scripts/check-roster.sh $(PARTY_LEDGER)
	@cd $(ROOT) && PYTHONPATH=combat-runner $(PY) -m gui.app --party $(PARTY_LEDGER)

# List the rosters make knows about, and whether each is table-ready.
.PHONY: parties
parties:
	@cd $(ROOT) && for f in $(PARTY_GANG) $(PARTY_COMPASS) $(PARTY_LEDGER); do \
		./scripts/check-roster.sh "$$f" --report; \
	done

# ─── Foundry VTT + Cloudflare Tunnel ────────────────────────────────────
# `make vtt-up`   → Foundry server + tunnel, players can reach $(TUNNEL_HOST)
# `make vtt-down` → tears both down
# `make vtt`      → status of both
#
# The license key is NEVER stored in this repo — it lives in Infisical.
# Note it is only needed ONCE, at Foundry's first-run activation screen;
# Foundry stores it afterwards. `make foundry-key` puts it on the clipboard
# without ever displaying it. See scripts/foundry/README.md.
FOUNDRY_APP  := Foundry Virtual Tabletop
FOUNDRY_URL  := http://localhost:30000
TUNNEL_NAME  := ardenhaven
TUNNEL_HOST  := vtt.atjoseph.com
RUN_DIR      := $(ROOT)/.run
CF_PID       := $(RUN_DIR)/cloudflared.pid
CF_LOG       := $(RUN_DIR)/cloudflared.log

# ── Combined up / down ──
.PHONY: vtt-up
vtt-up: foundry-up tunnel-up
	@echo ""
	@echo "  ▸ players:  https://$(TUNNEL_HOST)"
	@echo "  ▸ local:    $(FOUNDRY_URL)"
	@echo "  ▸ teardown: make vtt-down"

.PHONY: vtt-down
vtt-down: tunnel-down foundry-down
	@echo "  ▸ all down"

# ── Status ──
.PHONY: vtt vtt-status
vtt: vtt-status
vtt-status:
	@printf '  %-10s ' "foundry:"; \
	  curl -sf -o /dev/null --max-time 3 $(FOUNDRY_URL) \
	    && echo "UP   ($(FOUNDRY_URL))" || echo "down"
	@printf '  %-10s ' "tunnel:"; \
	  if [ -f $(CF_PID) ] && kill -0 "$$(cat $(CF_PID))" 2>/dev/null; then \
	    echo "UP   (pid $$(cat $(CF_PID)), https://$(TUNNEL_HOST))"; \
	  else echo "down"; fi
	@printf '  %-10s ' "public:"; \
	  code=$$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://$(TUNNEL_HOST) 2>/dev/null); \
	  if [ "$$code" = "200" ] || [ "$$code" = "302" ]; then echo "reachable (HTTP $$code)"; \
	  else echo "not reachable (HTTP $$code)"; fi

# ── Foundry ──
.PHONY: foundry-up
foundry-up:
	@if curl -sf -o /dev/null --max-time 2 $(FOUNDRY_URL); then \
	  echo "  ▸ foundry already up"; \
	else \
	  echo "  ▸ starting Foundry..."; \
	  open -a "$(FOUNDRY_APP)" || { echo "  ✗ can't launch '$(FOUNDRY_APP)' — is it in /Applications?"; exit 1; }; \
	  for i in $$(seq 1 40); do \
	    curl -sf -o /dev/null --max-time 2 $(FOUNDRY_URL) && break; sleep 1; \
	  done; \
	  curl -sf -o /dev/null --max-time 2 $(FOUNDRY_URL) \
	    && echo "  ✓ foundry up on $(FOUNDRY_URL)" \
	    || { echo "  ✗ foundry didn't answer after 40s (first run? finish activation in the window)"; exit 1; }; \
	fi

.PHONY: foundry-down
foundry-down:
	@if pgrep -f "$(FOUNDRY_APP)" >/dev/null 2>&1; then \
	  osascript -e 'quit app "$(FOUNDRY_APP)"' 2>/dev/null || pkill -f "$(FOUNDRY_APP)" 2>/dev/null; \
	  echo "  ✓ foundry stopped"; \
	else echo "  ▸ foundry already down"; fi

# ── Tunnel ──
.PHONY: tunnel-up
tunnel-up:
	@mkdir -p $(RUN_DIR)
	@if [ -f $(CF_PID) ] && kill -0 "$$(cat $(CF_PID))" 2>/dev/null; then \
	  echo "  ▸ tunnel already up (pid $$(cat $(CF_PID)))"; exit 0; fi
	@if [ ! -f "$$HOME/.cloudflared/cert.pem" ]; then \
	  echo "  ✗ cloudflared not authenticated — run: make tunnel-setup"; exit 1; fi
	@if ! cloudflared tunnel list 2>/dev/null | grep -q "$(TUNNEL_NAME)"; then \
	  echo "  ✗ tunnel '$(TUNNEL_NAME)' doesn't exist — run: make tunnel-setup"; exit 1; fi
	@echo "  ▸ starting tunnel..."
	@nohup cloudflared tunnel run --url $(FOUNDRY_URL) $(TUNNEL_NAME) \
	  >> $(CF_LOG) 2>&1 & echo $$! > $(CF_PID)
	@sleep 3
	@if kill -0 "$$(cat $(CF_PID))" 2>/dev/null; then \
	  echo "  ✓ tunnel up → https://$(TUNNEL_HOST)"; \
	else \
	  echo "  ✗ tunnel died on startup — see $(CF_LOG)"; rm -f $(CF_PID); exit 1; fi

.PHONY: tunnel-down
tunnel-down:
	@if [ -f $(CF_PID) ] && kill -0 "$$(cat $(CF_PID))" 2>/dev/null; then \
	  kill "$$(cat $(CF_PID))" 2>/dev/null; rm -f $(CF_PID); echo "  ✓ tunnel stopped"; \
	else rm -f $(CF_PID); echo "  ▸ tunnel already down"; fi

.PHONY: tunnel-logs
tunnel-logs:
	@tail -40 $(CF_LOG) 2>/dev/null || echo "  no log yet ($(CF_LOG))"

# One-time: authenticate, create the named tunnel, point DNS at it.
.PHONY: tunnel-setup
tunnel-setup:
	@[ -f "$$HOME/.cloudflared/cert.pem" ] || cloudflared tunnel login
	@cloudflared tunnel list 2>/dev/null | grep -q "$(TUNNEL_NAME)" \
	  || cloudflared tunnel create $(TUNNEL_NAME)
	@cloudflared tunnel route dns $(TUNNEL_NAME) $(TUNNEL_HOST) \
	  || echo "  ▸ DNS route already exists (fine)"
	@echo "  ✓ setup complete — now: make vtt-up"

# ── License key ──
# Verifies retrieval; prints length and format only, never the value.
.PHONY: foundry-check
foundry-check:
	@cd $(ROOT) && $(PY) -m scripts.foundry.license_key

# Puts the key on the clipboard for Foundry's first-run activation screen.
# The value never appears on screen or in shell history.
.PHONY: foundry-key
foundry-key:
	@cd $(ROOT) && infisical run --silent -- \
	  sh -c 'printf "%s" "$$FOUNDRY_VTT_LICENSE_KEY" | pbcopy' 2>/dev/null
	@echo "  ✓ license key copied to clipboard — paste into Foundry, then run: pbcopy </dev/null"

# ─── Foundry pipeline (actors) ──────────────────────────────────────────
# See playbooks/foundry-vtt.md for the full pipeline (Stages 1-2, Gate 2).
# `foundry-actors` : regenerate the committed golden file, foundry/build/actors.json
#                    (Stage 1; the generator reads combat-runner/actions.jsonl + the
#                    #combat-runner markdown — see D8, generated JSON IS committed).
# `foundry-sync`   : regenerate, then COPY (never symlink, D8) the importer module and
#                    actors.json into the live Foundry Data/ dir, ready to import.
# `foundry-import` : the whole Stage 2 loop — sync, wait while you run
#                    `game.pentaryn.import()` in Foundry's console, then clean + verify.
#                    THIS is the agent that deletes actors.json. The module cannot: Foundry's
#                    client API has no file-delete (FilePicker exposes browse, upload,
#                    createDirectory, configurePath — and nothing else), so the module warns
#                    and this target does the removal. Use this rather than the pieces.
# `foundry-clean`  : delete the staged actors.json from Data/ — Data/ is served over
#                    HTTP with NO AUTH while the tunnel is up (see the red box at the
#                    top of the playbook), so this is a required step, not cleanup.
# `foundry-verify` : Gate 2's check — assert the staged actors.json 404s publicly.
#                    Probes the site root first, so "tunnel down" can't masquerade as a pass.
FOUNDRY_DATA          := $(HOME)/Library/Application Support/FoundryVTT/Data
FOUNDRY_MODULE_NAME   := pentaryn-importer
FOUNDRY_MODULE_SRC    := $(ROOT)/foundry/module/$(FOUNDRY_MODULE_NAME)
FOUNDRY_MODULE_DST    := $(FOUNDRY_DATA)/modules/$(FOUNDRY_MODULE_NAME)
FOUNDRY_WORLD_DIR     := $(FOUNDRY_DATA)/worlds/ardenhaven
FOUNDRY_ACTORS_JSON   := $(ROOT)/foundry/build/actors.json
FOUNDRY_ACTORS_STAGED := $(FOUNDRY_WORLD_DIR)/actors.json
FOUNDRY_ACTORS_URL    := https://$(TUNNEL_HOST)/worlds/ardenhaven/actors.json

.PHONY: foundry-actors
foundry-actors:
	@cd $(ROOT) && $(PY) -m scripts.foundry.build_actors
	@echo "  ✓ $(FOUNDRY_ACTORS_JSON) regenerated"

.PHONY: foundry-sync
foundry-sync: foundry-actors
	@if [ ! -d "$(FOUNDRY_MODULE_SRC)" ]; then \
	  echo "  ✗ no module at $(FOUNDRY_MODULE_SRC) — Stage 2 not built yet"; exit 1; fi
	@mkdir -p "$(FOUNDRY_DATA)/modules" "$(FOUNDRY_WORLD_DIR)"
	@rm -rf "$(FOUNDRY_MODULE_DST)"
	@cp -R "$(FOUNDRY_MODULE_SRC)" "$(FOUNDRY_MODULE_DST)"
	@echo "  ✓ module → $(FOUNDRY_MODULE_DST)"
	@cp "$(FOUNDRY_ACTORS_JSON)" "$(FOUNDRY_ACTORS_STAGED)"
	@echo "  ✓ actors.json staged → $(FOUNDRY_ACTORS_STAGED)"
	@echo "  ⚠ Data/ is public with no auth while the tunnel is up — import now, then: make foundry-clean"

# ── The Stage 2 loop: copy in → import → delete ──
# CONTRACT.md §12 requires actors.json to be deleted from Data/ on success. The importer
# module CANNOT do it — Foundry's client-side API has no file-delete — so this target is the
# deleting agent, and the module's permanent toast is the fallback for anyone who ran the
# import by hand. Deletion happens whatever you answer; answering "n" only skips the 404
# assertion, it never leaves the file behind.
#
# Interactive by design: the import runs in Foundry's browser console, which make cannot
# drive. Reads from the terminal (/dev/tty) so a piped stdin can't silently auto-answer.
#
# THREE ways out of the prompt, and all three delete — a target whose whole job is "don't
# leave a public file lying around" must not have an exit path that leaves it lying around:
#   answered      → delete (+ verify on y)
#   no terminal   → skip the prompt, delete anyway
#   Ctrl-C / TERM → trap deletes, then re-raises
.PHONY: foundry-import
foundry-import: foundry-sync
	@echo ""
	@echo "  ── Stage 2 — run the import ──────────────────────────────────────────"
	@echo "  1. Foundry → world 'ardenhaven' → F12 console"
	@echo "  2. Dry run first:   await game.pentaryn.import({ dryRun: true })"
	@echo "  3. Then for real:   await game.pentaryn.import()"
	@echo "     One NPC only:    await game.pentaryn.import({ only: ['<slug>'] })"
	@echo ""
	@echo "  The module ABORTS the run on any readback-assertion failure. If it does, fix the"
	@echo "  generator and start over — do not import the rest."
	@echo ""
	@trap 'echo; echo "  ▸ interrupted — deleting the staged JSON"; \
	       rm -f "$(FOUNDRY_ACTORS_STAGED)"; exit 130' INT TERM; \
	  printf "  Import finished (ok / assertion failure / didn't run)? [y/N] "; \
	  ans=""; \
	  if { read -r ans < /dev/tty; } 2>/dev/null; then :; else \
	    ans=""; echo ""; \
	    echo "  ▸ no terminal to prompt on — assuming the import did not run"; fi; \
	  trap - INT TERM; \
	  case "$$ans" in \
	    [yY]*) echo "  ▸ deleting the staged JSON, then asserting it 404s publicly..."; \
	           $(MAKE) --no-print-directory foundry-clean ;; \
	    *)     echo "  ▸ deleting the staged JSON anyway — it must not linger in a public dir."; \
	           $(MAKE) --no-print-directory foundry-clean-only; \
	           echo "  ▸ skipped the public 404 assertion; re-run it with: make foundry-verify"; \
	           echo "  ▸ re-stage when you're ready with: make foundry-import" ;; \
	  esac

# Delete without verifying. `foundry-clean` is the one you want — it also proves the
# deletion took effect from the players' side.
.PHONY: foundry-clean-only
foundry-clean-only:
	@rm -f "$(FOUNDRY_ACTORS_STAGED)"
	@if [ -f "$(FOUNDRY_ACTORS_STAGED)" ]; then \
	  echo "  ✗ $(FOUNDRY_ACTORS_STAGED) still on disk — check permissions"; exit 1; \
	else echo "  ✓ $(FOUNDRY_ACTORS_STAGED) deleted"; fi

.PHONY: foundry-clean
foundry-clean: foundry-clean-only
	@$(MAKE) --no-print-directory foundry-verify

# Two probes, in order, because one code cannot distinguish "the file is gone" from "the
# request never reached Foundry" (D10: each gate must POSITIVELY confirm the thing it
# protects; "it didn't error" is worthless).
#
#   1. site root — establishes tunnel state. Same 200/302 test as vtt-status's "public:".
#   2. actors.json — only meaningful once the tunnel is demonstrably up.
#
# With the tunnel up, ONLY 404 passes. A 403 (Cloudflare bot-challenging curl's non-browser
# UA), a 302 (an interstitial), a 5xx — none of those prove the file is gone, and a player's
# browser sails past exactly the challenge curl trips over. Treat every one as a failure.
.PHONY: foundry-verify
foundry-verify:
	@root=$$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://$(TUNNEL_HOST)/ 2>/dev/null); \
	if [ "$$root" != "200" ] && [ "$$root" != "302" ]; then \
	  echo "  ▸ tunnel not reachable (site root HTTP $${root:-000}) — nothing is public, nothing to verify."; \
	  echo "    To confirm positively: make vtt-up, then: make foundry-verify"; \
	  exit 0; \
	fi; \
	code=$$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 $(FOUNDRY_ACTORS_URL) 2>/dev/null); \
	if [ "$$code" = "404" ]; then \
	  echo "  ✓ tunnel UP (root HTTP $$root) and actors.json is HTTP 404 — confirmed not served"; \
	elif [ "$$code" = "200" ]; then \
	  echo "  ✗ actors.json returned HTTP 200 — STILL EXPOSED to every connected player."; \
	  echo "    Run: make foundry-clean"; exit 1; \
	else \
	  echo "  ✗ tunnel is UP (root HTTP $$root) but actors.json returned HTTP $${code:-000}, not 404."; \
	  echo "    That does NOT prove the file is gone — a bot-challenge or interstitial answers curl"; \
	  echo "    differently than a player's browser. Run: make foundry-clean, then check by hand:"; \
	  echo "      $(FOUNDRY_ACTORS_URL)"; exit 1; \
	fi

# ─── Foundry pipeline (walls) ───────────────────────────────────────────
# Independent of the actor pipeline above — different module, no staged file, nothing
# public. See playbooks/foundry-wall-autocomplete.md.
FOUNDRY_WALLS_SRC := $(ROOT)/foundry/module/pentaryn-walls
FOUNDRY_WALLS_DST := $(FOUNDRY_DATA)/modules/pentaryn-walls

# The engine is pure geometry, so the whole suite runs with Foundry stopped.
.PHONY: foundry-walls-test
foundry-walls-test:
	@node $(FOUNDRY_WALLS_SRC)/test/run.mjs

# Scaling curve: at what map size does this stop being instant? Decides whether a compiled
# backend is worth building. Pass a grid size to extend the sweep, e.g. `make foundry-walls-bench N=20`.
.PHONY: foundry-walls-bench
foundry-walls-bench:
	@node $(FOUNDRY_WALLS_SRC)/test/bench.mjs $(N)

# Copy, not symlink (D8) — so a stale copy is a real failure mode. Tests gate the sync.
.PHONY: foundry-walls-sync
foundry-walls-sync: foundry-walls-test
	@mkdir -p "$(FOUNDRY_DATA)/modules"
	@rm -rf "$(FOUNDRY_WALLS_DST)"
	@cp -R "$(FOUNDRY_WALLS_SRC)" "$(FOUNDRY_WALLS_DST)"
	@echo "  ✓ module → $(FOUNDRY_WALLS_DST)"
	@echo "    Enable 'Pentaryn Wall Autocomplete' in Manage Modules, reload, then:"
	@echo "      await game.pentaryn.walls.preview()"

# ─── Tests ──────────────────────────────────────────────────────────────
# Run the test suite for the GUI (skips scenarios by default for speed; use
# `make combat-test-all` for the full ring including scenarios).
.PHONY: combat-test
combat-test:
	@cd $(ROOT) && QT_QPA_PLATFORM=offscreen $(PY) -m pytest combat-runner/tests/ -v -m 'not scenario'

.PHONY: combat-test-all
combat-test-all:
	@cd $(ROOT) && QT_QPA_PLATFORM=offscreen $(PY) -m pytest combat-runner/tests/ -v
