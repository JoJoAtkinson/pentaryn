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
