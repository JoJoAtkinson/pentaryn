ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
PY := $(shell if [ -x ./.venv/bin/python ]; then echo ./.venv/bin/python; elif [ -x ./venv/bin/python ]; then echo ./venv/bin/python; else echo python3; fi)

# Prime party — The Compass Edge — preloaded by `make prime`.
PARTY_PRIME := world/party/the-compass-edge/combat-roster.yml

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

# Launch the GUI with the prime party (The Compass Edge) preloaded — each PC
# gets a tab and a directed-command id. Roster: $(PARTY_PRIME)
.PHONY: prime
prime:
	@cd $(ROOT) && PYTHONPATH=combat-runner $(PY) -m gui.app --party $(PARTY_PRIME)

# Run the test suite for the GUI (skips scenarios by default for speed; use
# `make combat-test-all` for the full ring including scenarios).
.PHONY: combat-test
combat-test:
	@cd $(ROOT) && QT_QPA_PLATFORM=offscreen $(PY) -m pytest combat-runner/tests/ -v -m 'not scenario'

.PHONY: combat-test-all
combat-test-all:
	@cd $(ROOT) && QT_QPA_PLATFORM=offscreen $(PY) -m pytest combat-runner/tests/ -v
