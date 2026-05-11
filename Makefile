ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
PY := $(shell if [ -x ./.venv/bin/python ]; then echo ./.venv/bin/python; elif [ -x ./venv/bin/python ]; then echo ./venv/bin/python; else echo python3; fi)

# Launch the focused Haiku combat-runner Claude session for at-table play.
# The Python launcher (combat-runner/launch.py) discovers encounters by scanning
# for #combat-runner-tagged NPC files, walks up past any npcs/ dir to find the
# encounter root, presents a recency-sorted picker, then exec's claude with that
# encounter's full context pre-loaded.
#
# Per-machine workspace at ~/dnd-combat (outside the repo) is auto-bootstrapped
# on first run and contains the MCP config + symlinks back to this repo.
#
# NOTE: `make combat -p "..."` does NOT work — `make` consumes -p as its own
# "print database" flag. For scripted/non-interactive use, call the launcher
# directly:    ./.venv/bin/python combat-runner/launch.py -p "<prompt>"
.PHONY: combat
combat:
	@$(PY) combat-runner/launch.py

# ─── GUI app (PySide6 + qt-material) ────────────────────────────────────
# Opens the encounter picker, lets you pick mob counts, then launches the
# multi-tab combat window. Same NPC discovery as `make combat` (#combat-runner
# tag) and same actions DB. The CLI is still available as a fallback.
.PHONY: combat-gui
combat-gui:
	@cd $(ROOT) && PYTHONPATH=combat-runner $(PY) -m gui.app

# Run the test suite for the GUI (skips scenarios by default for speed; use
# `make combat-test-all` for the full ring including scenarios).
.PHONY: combat-test
combat-test:
	@cd $(ROOT) && QT_QPA_PLATFORM=offscreen $(PY) -m pytest combat-runner/tests/ -v -m 'not scenario'

.PHONY: combat-test-all
combat-test-all:
	@cd $(ROOT) && QT_QPA_PLATFORM=offscreen $(PY) -m pytest combat-runner/tests/ -v
