PY := $(shell if [ -x ./venv/bin/python ]; then echo ./venv/bin/python; elif [ -x ./.venv/bin/python ]; then echo ./.venv/bin/python; else echo python3; fi)

.PHONY: mcp
mcp:
	@$(PY) scripts/mcp/server.py

.PHONY: codex-config
codex-config:
	$(PY) scripts/mcp/manage_codex_config.py --install

.PHONY: codex-install
codex-install: codex-config

.PHONY: codex-uninstall
codex-uninstall:
	$(PY) scripts/mcp/manage_codex_config.py --uninstall


audio-setup:
	brew install azcopy 
	uv run python scripts/audio/setup_azure.py

ml-audio-setup:
	uv run scripts/audio/setup_azure_ml.py

audio-pipeline:
	uv run scripts/audio/orchestrator.py sessions/05