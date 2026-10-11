---
created: 2026-10-11
last_modified: 2026-10-11
tags: ["playbook", "foundry", "vtt", "cloudflare", "access", "security"]
status: active
---

# Cloudflare Access — the Google login in front of vtt.atjoseph.com

**Read this when:** adding or removing a player's Gmail, changing how long logins last, or
working out why someone can't get past the Google sign-in to `vtt.atjoseph.com`.
**Not this file:** starting/stopping the tunnel, the `Data/` exposure gate → [`ops.md`](ops.md) ·
`medical.atjoseph.com` is a separate Access app with its own policy — never edit it from here.

> Foundry is not hardened for the open internet, and the server is meant to stay up. So the
> front door is Cloudflare: nobody reaches Foundry without first signing in with a Google
> account that is on the whitelist. Players need **no Cloudflare account** — they see a normal
> "Sign in with Google" screen, then Foundry's `/join`.

> ⚠️ **Adding a person = TWO lists, every time.** Their Gmail must go on **(1) Google's test
> users** *and* **(2) Cloudflare's `vtt-players` policy**. Either one alone and they're locked
> out, with an error that doesn't say which list is missing. Removing a person = take them off
> both. Steps: [Whitelist a player](#whitelist-a-player-two-places-both-required).

## How the pieces fit

```
player ──▶ vtt.atjoseph.com ──▶ Cloudflare Access app "vtt"
                                   │  instant auth → Google sign-in (OAuth client in Google Cloud)
                                   │  policy "vtt-players": Emails ∈ whitelist  AND  login method = Google
                                   ▼  (1-month app session cookie)
                                cloudflared tunnel "ardenhaven" ── access.required: true ──▶ localhost:30000
```

| Piece | Where | Value |
| ----- | ----- | ----- |
| Zero Trust team domain | Cloudflare One → Settings | `broad-smoke-7112.cloudflareaccess.com` |
| Google OAuth client | console.cloud.google.com → project "My First Project" → Google Auth Platform → Clients | `Cloudflare Access - vtt` (Web application) |
| Google app ("consent screen") | Google Auth Platform → Branding / Audience | "atjoseph VTT", **External**, publishing status **Testing** |
| Identity provider | Cloudflare One → Integrations → Identity providers | `Google` (PKCE on) |
| Access application | Cloudflare One → Access controls → Applications | `vtt` → `vtt.atjoseph.com`, IdP = Google only, instant auth on, session **1 month** |
| Access policy | same app, Access policies | `vtt-players` (Allow) — Include: Emails · Require: Login Methods = Google |
| Tunnel-side check | [`foundry/cloudflared/config.yml`](../../foundry/cloudflared/config.yml) `originRequest.access` | `teamName` + the app's `audTag` |

Account dashboard root: `https://dash.cloudflare.com/12adef34e89439dc7242351870ec8a0d/one/`.

## Whitelist a player (two places, both required)

The Google app is in **Testing**, so Google itself only lets listed test users sign in. That
makes the whitelist two locks: Google's test-user list and Cloudflare's policy. An email on only
one of them **cannot get in**.

1. **Google** — console.cloud.google.com → (project "My First Project") → **Google Auth
   Platform → Audience** → *Test users* → **+ Add users** → type the Gmail, Enter → **Save**.
   Cap: 100 users, counted over the app's lifetime. **Save often needs a second click** — the
   first only takes focus off the email box and the panel stays open. Check the email shows in
   the *Test users* table and the "N users (N test…)" count went up before moving on. If the
   second click pops **"Ineligible accounts not added"** naming the same email but the count
   still went up, it's harmless — the first click saved it and the second re-submitted a
   duplicate. Trust the table, not the popup.
2. **Cloudflare** — Cloudflare One → **Access controls → Policies** → `vtt-players` → *Include:
   Emails* → add the Gmail → **Save**. (Or: Applications → `vtt` → Edit → click the policy.)
   Once the chips fill a row, the empty email box wraps to a new line below them — click
   *that*, or the typing goes nowhere. Enter lowercase; confirm the chip appears before saving,
   then re-open the policy and check *Policy details → Include Emails* lists it.

Remove a player: delete the email from **both** lists. Their existing session cookie can live
up to a month — to cut them off now, Cloudflare One → **Team & Resources → Users** → the user →
**Revoke sessions**.

Never add an `Everyone`, `Emails ending in @gmail.com`, or any other wide rule to `vtt-players`.

### Doing step 2 by API instead

Needs a Cloudflare API token with *Access: Apps and Policies Edit* (Infisical, never a file).
The policy is reusable, so it lives at the account level:

```
GET  /accounts/12adef34e89439dc7242351870ec8a0d/access/policies          → find "vtt-players"
PUT  /accounts/12adef34e89439dc7242351870ec8a0d/access/policies/<id>
     body: the whole policy, with include: [{ "email": { "email": "a@gmail.com" } }, …]
```

`PUT` replaces the rule set — `GET` it first and send every existing email back. Step 1 (Google
test users) has no supported public API; do it in the console.

## Why it's built this way

- **Testing, not Published.** Publishing needs a public home page, a privacy-policy link, and
  a verified authorized domain. Not worth it for a handful of friends, and the test-user list is
  a second whitelist for free. Google's 7-day token expiry in Testing does not matter — Access
  only uses Google at sign-in; after that the Cloudflare session cookie governs.
- **Require login method = Google.** The account also has One-time PIN (used by medical). The
  rule stops anyone using a whitelisted address via email PIN instead of Google.
- **1 month on the app, global session left alone.** The app session is what makes players
  re-sign-in; 1 month is Cloudflare's maximum. The *global* session (Cloudflare One → Access
  controls → Access settings) is shared with medical, so it was deliberately not raised.
- **`access.required` in the tunnel config.** Without it, the only gate is Cloudflare's edge;
  with it, `cloudflared` also refuses any request lacking a valid token for the `vtt` app's AUD.
  The AUD is the `kid=` in the login redirect: `curl -sI https://vtt.atjoseph.com/`. If the
  `vtt` app is ever deleted and re-created, the AUD changes — update `config.yml` or every
  request is refused.

## Known side effects on our own tooling

Every unauthenticated request now gets a `302` to the Access login — including the repo's
own `curl` probes through the public hostname:

- `make vtt` (`scripts/foundry/ops/service.py` `status_report`) treats `302` as "reachable",
  so its *public* line reports reachable even when the tunnel is down.
- `make foundry-verify` (`scripts/foundry/ops/pipeline.py` `verify`) requires `actors.json` to
  return 404 through the tunnel; it now gets 302 and fails. The exposure it guards
  ([`ops.md`](ops.md) §6) is now limited to whitelisted players, but the gate needs updating
  (e.g. an Access service token for the probe) before it's trustworthy again.

## Troubleshooting

| Symptom | Cause |
| ------- | ----- |
| Google: "Access blocked: … has not completed the Google verification process" | Email not in Google's **test users** |
| Cloudflare "That account does not have access" | Email not in `vtt-players`, or they signed in with a different Google account |
| `Error 401: deleted_client` / `invalid_client` | OAuth client deleted or secret rotated — make a new client secret in Google, paste into the Cloudflare `Google` IdP (Edit) |
| Signed in, then a `403`/blank from the origin | `audTag`/`teamName` in `config.yml` don't match the `vtt` app |
| `redirect_uri_mismatch` | Google client's redirect URI must be exactly `https://broad-smoke-7112.cloudflareaccess.com/cdn-cgi/access/callback` |

Sources: Cloudflare docs — [Google IdP](https://developers.cloudflare.com/cloudflare-one/identity/idp-integration/google/),
[self-hosted public app](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/),
[session management](https://developers.cloudflare.com/cloudflare-one/identity/users/session-management/).
