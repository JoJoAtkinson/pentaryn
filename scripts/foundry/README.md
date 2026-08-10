# `scripts/foundry` — Foundry VTT tooling

Helpers for the Foundry Virtual Tabletop side of the campaign.

## License key — how it's stored

**The Foundry license key is not in this repo, and must never be.** It is not in
a `.env`, not in a committed config, not in the Makefile. It lives in
[Infisical](https://app.infisical.com) and is read at runtime, every time.

| | |
|---|---|
| **Project** | `project-joe` — `74f78c84-b0f0-45f9-8b7a-c3e54b0785b2` |
| **Environment** | `dev` |
| **Secret path** | `/` |
| **Secret name** | `FOUNDRY_VTT_LICENSE_KEY` |
| **Auth** | the homebrew `infisical` CLI, already logged in as Joe. No token is passed. |

The key is the Foundry VTT license for account `atjoseph`; licenses are
viewable at <https://foundryvtt.com/community/atjoseph/licenses>.

## Make targets

| Target | Does |
|---|---|
| `make vtt-up` | Start Foundry **and** the Cloudflare tunnel |
| `make vtt-down` | Stop both |
| `make vtt` | Status of Foundry, tunnel, and public reachability |
| `make tunnel-setup` | **One-time** — cloudflared login, create tunnel, route DNS |
| `make tunnel-logs` | Tail the tunnel log |
| `make foundry-key` | Copy the license key to the clipboard (first-run activation only) |
| `make foundry-check` | Verify key retrieval; prints length/format, never the value |
| `make foundry-actors` | Regenerate `foundry/build/actors.json` from `combat-runner/actions.jsonl` + `#combat-runner` markdown |
| `make foundry-sync` | `foundry-actors`, then **copy** (never symlink) the importer module + `actors.json` into the live Foundry `Data/` dir |
| `make foundry-clean` | Delete the staged `actors.json` from `Data/`, then run `foundry-verify` |
| `make foundry-verify` | Assert `actors.json` 404s over the public tunnel (Gate 2). Reports, doesn't fail, if the tunnel itself is down |

Players connect to **<https://vtt.atjoseph.com>**. `cloudflared` runs from a
pidfile in `.run/` (gitignored); the tunnel is only up while you're running.

**The license key is needed exactly once**, at Foundry's first-run activation
screen. Foundry stores it afterwards — `make vtt-up` never needs it.

## Actor pipeline (`foundry-actors` / `foundry-sync` / `foundry-clean`)

See [`playbooks/foundry-vtt.md`](../../playbooks/foundry-vtt.md) (Stages 1-2, Gate 2)
for the full pipeline and its decision log.

`foundry/build/actors.json` is **committed** — it's the golden-file surface for
pytest and the diffable record of what was imported (D8). It is *not* the same
thing as the file staged under Foundry's `Data/` dir during a sync, which
**must not** linger there: `Data/` is served over HTTP with no auth while the
tunnel is up, so anything under it is world-readable by anyone who can reach
`https://vtt.atjoseph.com`.

```bash
make foundry-sync   # regenerate + stage module and actors.json into Data/
# ... run the import inside Foundry ...
make foundry-clean  # delete the staged actors.json, then verify it's gone
```

## Verify it resolves

```bash
make foundry-check
```

Prints length and format only — **never the value**:

```
✓ FOUNDRY_VTT_LICENSE_KEY resolved via infisical CLI (29 chars, matches Foundry key format)
```

## Using it from Python

Preferred — inject as an env var so the value never touches disk:

```bash
infisical run --projectId 74f78c84-b0f0-45f9-8b7a-c3e54b0785b2 --env dev -- \
    ./.venv/bin/python -m scripts.foundry.some_tool
```

Either way, the same call works — it checks the env var first, then falls back
to fetching via the CLI:

```python
from scripts.foundry.license_key import foundry_license_key, LicenseKeyUnavailable

try:
    key = foundry_license_key()
except LicenseKeyUnavailable as exc:
    # Safe to log — the message never contains the key.
    sys.exit(f"Foundry license unavailable: {exc}")
```

## Rules

- Never write the value to a file, a log, or stdout.
- Never pass it as a command-line argument — it would be visible in `ps`.
- Read it at the point of use; don't stash it in a module global or cache it.
- If the CLI reports an auth failure, **stop** and run `infisical login`.
  Do not fall back to prompting for the key or hardcoding it.

## Files

| File | Purpose |
|---|---|
| `license_key.py` | Runtime license-key retrieval. `python -m scripts.foundry.license_key` self-checks. |
