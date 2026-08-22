# `scripts/foundry` — Foundry VTT tooling

Helpers for the Foundry Virtual Tabletop side of the campaign.

## Secrets — how they're stored

**Nothing sensitive is in this repo, and nothing may be.** Not in a `.env` (there
isn't one), not in a committed config, not in the Makefile. Both secrets live in
[Infisical](https://app.infisical.com) and are read at runtime, every time.

| | |
|---|---|
| **Project** | `project-joe` — `74f78c84-b0f0-45f9-8b7a-c3e54b0785b2` |
| **Environment** | `dev` |
| **Secret path** | `/` |
| **Auth** | the homebrew `infisical` CLI, logged in as Joe. No token is passed. |

| Secret | Read by | What it's for |
|---|---|---|
| `FOUNDRY_VTT_LICENSE_KEY` | `license_key.py` | First-run activation. Needed once; Foundry stores it afterwards. `make foundry-key` puts it on the clipboard without displaying it. |
| `FOUNDRY_VTT_GRANDMASTER_PW` | `admin_password.py` | The server administrator password. Buys `loginAsUser` for the smoke test and a graceful `POST /join {shutdown}` — both refuse unless an admin password is set. |

The license key is for account `atjoseph`; licenses are viewable at
<https://foundryvtt.com/community/atjoseph/licenses>.

### The grandmaster password has a second tier

`admin_password.py` resolves **env → Infisical → macOS login keychain**. The keychain
copy exists because the consumer is a launchd job firing at 04:06 on a Saturday, and
the Infisical CLI's session is an interactive login that expires — a weekly job that
stops the first time a token lapses is a trap.

`make foundry-admin-push` copies Infisical's value down into the keychain, so the
mirror cannot drift from the source. It has no other source: if the secret is not in
Infisical, set it there. `make foundry-admin-check` prints the length and which tier
answered, never the value.

## Make targets

| Target | Does |
|---|---|
| `make vtt-up` | Start Foundry **and** the Cloudflare tunnel |
| `make login` | Pick a campaign and a user from an arrow-key menu, land in the world logged in — no dropdown, no password. Alias: `make vtt-login`. Needs the admin password configured; see [`ops.md`](../../context/foundry/ops.md) §2 |
| `make vtt-down` | Stop both |
| `make vtt` | Status of Foundry, tunnel, and public reachability |
| `make tunnel-setup` | **One-time** — cloudflared login, create tunnel, route DNS |
| `make tunnel-logs` | Tail the tunnel log |
| `make foundry-key` | Copy the license key to the clipboard (first-run activation only) |
| `make foundry-check` | Verify key retrieval; prints length/format, never the value |
| `make foundry-actors` | Regenerate `foundry/build/actors.json` from `foundry/actions.jsonl` + `#combat-runner` markdown |
| `make foundry-sync` | `foundry-actors`, then **copy** (never symlink) the importer module + `actors.json` into the live Foundry `Data/` dir |
| `make foundry-import` | **The one to run.** `foundry-sync`, wait while you run `game.pentaryn.import()` in Foundry's console, then `foundry-clean` |
| `make foundry-clean-only` | Delete the staged `actors.json` from `Data/`. No verification |
| `make foundry-clean` | `foundry-clean-only`, then `foundry-verify` |
| `make foundry-verify` | Gate 2 — probe the site root, then assert `actors.json` 404s over the public tunnel. Skips (exit 0) only when the root itself is unreachable |

Players connect to **<https://vtt.atjoseph.com>**. `cloudflared` runs from a
pidfile in `.run/` (gitignored); the tunnel is only up while you're running.

**The license key is needed exactly once**, at Foundry's first-run activation
screen. Foundry stores it afterwards — `make vtt-up` never needs it.

## Actor pipeline (`foundry-actors` / `foundry-import`)

See [`context/plans/foundry-content-pipeline.md`](../../context/plans/foundry-content-pipeline.md) (Stages 1-2, Gate 2)
for the full pipeline and its decision log.

`foundry/build/actors.json` is **committed** — it's the golden-file surface for
pytest and the diffable record of what was imported (D8). It is *not* the same
thing as the file staged under Foundry's `Data/` dir during a sync, which
**must not** linger there: `Data/` is served over HTTP with no auth while the
tunnel is up, so anything under it is world-readable by anyone who can reach
`https://vtt.atjoseph.com`.

```bash
make foundry-import   # sync → prompt → delete → verify. One command, whole loop.
```

It stages the module and `actors.json`, prints the console commands, waits, and then
**deletes the staged file whatever you answer** — answering "n" only skips the public
404 assertion, never the deletion. The importer module *cannot* delete it (Foundry's
client API has no file-delete); it only warns. `make foundry-import` is the agent that
actually removes the file — see CONTRACT.md §12, *"Deleting `actors.json` — who
actually does it"*.

The pieces, if you need them separately:

```bash
make foundry-sync        # regenerate + stage module and actors.json into Data/
# ... run the import inside Foundry ...
make foundry-clean       # delete the staged actors.json, then verify it's gone
make foundry-verify      # verify only — probes the site root first, so a down tunnel
                         # can't masquerade as a pass. Tunnel up + not-404 → exit 1.
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
| `admin_password.py` | Runtime grandmaster-password retrieval (env → Infisical → keychain). `python -m scripts.foundry.admin_password` self-checks. |
| `ring_subject.py` | Build a dynamic-ring **subject** texture from round token art. Read the next section before re-arting any ringed token. |

## Re-arting a token that has a dynamic ring

> ⚠️ **`texture.src` is not what a ringed token draws.** With the dynamic ring on,
> the canvas draws `ring.subject.texture`. Change only the art and the token keeps
> showing the old picture — the document says one thing, the canvas another, and
> nothing anywhere reports an error. It looks exactly like a stale client.

Every PC and named NPC in `ardenhaven` has a ring, so this is the normal case, not the
exception. Four fields move together:

| Field | Set to |
|---|---|
| `img` | the art (sheet portrait) |
| `prototypeToken.texture.src` | the art |
| `prototypeToken.ring.subject.texture` | the **subject** built from that art |
| each placed token's `texture.src` + `ring.subject.texture` | the same pair |

Placed tokens do **not** inherit a prototype change — update the scene copies explicitly
or the players keep seeing the old token on the map.

```bash
./.venv/bin/python scripts/foundry/ring_subject.py \
  "$HOME/Library/Application Support/FoundryVTT/Data/assets/tokens/tokens-01/halflings/halfling-explorer.png"
# -> assets/tokens/custom/ring-subjects/halfling-explorer-28c04d.webp
```

The spec is 512×512 RGBA, source art scaled into the centred two-thirds safe area
(341×341 at offset 85) — measured off the subjects already in the world, which are
byte-for-byte consistent. Verify with `await canvas.draw()` and then read
`token.mesh.texture.baseTexture.resource.src`; reading the document only tells you what
you asked for, not what is on screen.

### Ringless crowd tokens need the subject in `texture.src`

The rule inverts when `ring.enabled` is `false` — a ringless token draws `texture.src`
and ignores `ring.subject.texture` entirely. Point `texture.src` at the raw art and the
crowd renders at the **full** grid square while every ringed NPC beside it renders at
two-thirds: a 1.5× size mismatch, no error, and the correctly-built subject file sitting
there unused. That is exactly what happened to the 103 crowd tokens across the Opera
House, Fairfield Market and Port of Inglesford scenes on 2026-08-16.

So for crowd art, **both** fields get the subject webp:

| `ring.enabled` | `texture.src` | `ring.subject.texture` |
|---|---|---|
| `true` (PCs, named NPCs) | the raw art | the subject |
| `false` (crowd, mobs, clumps) | **the subject** | the subject |

One sweep fixes any that drift, prototypes and placed tokens alike:

```js
for (const a of game.actors) {
  const p = a.prototypeToken, subj = p.ring?.subject?.texture;
  if (!p.ring?.enabled && subj && p.texture.src !== subj)
    await a.update({"prototypeToken.texture.src": subj});
}
for (const sc of game.scenes) {
  const u = sc.tokens.filter(t => !t.ring?.enabled && t.ring?.subject?.texture
                                  && t.texture.src !== t.ring.subject.texture)
                     .map(t => ({_id: t.id, "texture.src": t.ring.subject.texture}));
  if (u.length) await sc.updateEmbeddedDocuments("Token", u);
}
```

Read `_source`, not the derived doc, when auditing right after a write — derived token
data goes stale and will report the change as missing when it landed.
