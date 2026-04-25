ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
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

add-dnd-mpc:
	claude mcp add dnd-scripts --scope local -- $(ROOT)/.venv/bin/python $(ROOT)/scripts/mcp/server.py

suggested-code-extensions:
	code --install-extension foam.foam-vscode \
		--install-extension mechatroner.rainbow-csv \
		--install-extension yzhang.markdown-all-in-one \
		--install-extension eliostruyf.vscode-front-matter \
		--install-extension tamasfe.even-better-toml \
		--install-extension gruntfuggly.todo-tree \
		--install-extension streetsidesoftware.code-spell-checker


alt-to-mactex:
	# MacTeX is a large download and installation, so we can use BasicTeX as an alternative for LaTeX support in the MCP.
	brew install --cask basictex

	sudo tlmgr update --self
	sudo tlmgr install \
		fontspec unicode-math \
		geometry setspace parskip \
		hyperref bookmark xurl \
		microtype upquote \
		fancyvrb framed \
		booktabs longtable \
		xcolor ulem \
		selnolig etoolbox

audio-setup:
	brew install azcopy 
	uv run python scripts/audio/setup_azure.py

ml-audio-setup:
	uv run scripts/audio/setup_azure_ml.py

audio-pipeline:
	uv run scripts/audio/orchestrator.py sessions/05