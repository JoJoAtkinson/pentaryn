#!/usr/bin/env python3
"""Runtime access to the Foundry server's administrator password.

Same contract as :mod:`scripts.foundry.license_key`: the value lives in Infisical and
is read at the point of use, never committed, never logged, never passed as an argv.

**Why this secret exists at all.** Foundry's ``sessions.authenticateAdmin`` returns
*success* when no admin password is configured — but it never sets ``session.admin`` in
that branch::

    authenticateAdmin(req, res) {
      const session = this.getOrCreate(req, res), pw = config.adminPassword;
      if (session.admin || !pw) return {success: true, session};   // admin stays false
      ...
      session.admin = ok;  return {success: ok, session};
    }

Most of the setup API only checks the returned ``success``, so it works fine with no
password. But two things check ``session.admin`` directly, and both are load-bearing here:

* ``sessions.loginAsUser`` — logging the smoke-test browser in as the Gamemaster
  *without that user's password*. Without an admin password this 403s
  (``USERS.LoginAsGMRequired``), which was verified against the running server.
* ``POST /join {action: "shutdown"}`` — deactivating a world gracefully instead of
  hard-quitting the app. It also refuses outright unless an admin password is set.

So the admin password is what buys a smoke test that needs no *user* credential
anywhere, and a clean world shutdown. It is also defence in depth for ``/setup``, which
is otherwise protected only by the Cloudflare ingress rules in
``foundry/cloudflared/config.yml``.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys

# Identifiers, not secrets — same project as the license key.
PROJECT_ID = "74f78c84-b0f0-45f9-8b7a-c3e54b0785b2"
ENVIRONMENT = "dev"
SECRET_PATH = "/"
SECRET_NAME = "FOUNDRY_VTT_GRANDMASTER_PW"

# Login-keychain service name for the unattended fallback copy. An identifier, not a
# secret. Refreshed FROM Infisical by `make foundry-admin-push`.
KEYCHAIN_SERVICE = "pentaryn-foundry-admin"

_AUTH_HINT = (
    "Infisical could not authenticate. Run `infisical login` in a terminal, then "
    "retry. Do NOT hardcode the password or prompt for it."
)


class AdminPasswordUnavailable(RuntimeError):
    """The admin password could not be resolved. Never carries the value itself."""


def _fetch_from_infisical() -> str:
    try:
        proc = subprocess.run(
            [
                "infisical", "secrets", "get", SECRET_NAME,
                "--projectId", PROJECT_ID,
                "--env", ENVIRONMENT,
                "--path", SECRET_PATH,
                "--plain", "--silent",
            ],
            capture_output=True, text=True, check=True,
            # Both of these are load-bearing for an unattended run. Without
            # stdin=DEVNULL the CLI drops into an interactive domain-selection prompt
            # when its session has lapsed and waitsForEver on a terminal that is not
            # there — observed hanging a run indefinitely rather than failing. The
            # timeout is the backstop for every other way a network call can stall.
            stdin=subprocess.DEVNULL, timeout=30,
        )
    except subprocess.TimeoutExpired as exc:
        raise AdminPasswordUnavailable(
            "the infisical CLI did not respond within 30s (an expired session makes it "
            "prompt, which an unattended job cannot answer). Run `infisical login`."
        ) from exc
    except FileNotFoundError as exc:
        raise AdminPasswordUnavailable(
            "The `infisical` CLI is not installed. Install it with "
            "`brew install infisical/get-cli/infisical`."
        ) from exc
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        if re.search(r"auth|login|token|unauthor", stderr, re.IGNORECASE):
            raise AdminPasswordUnavailable(_AUTH_HINT) from exc
        raise AdminPasswordUnavailable(
            f"infisical exited {exc.returncode} fetching {SECRET_NAME}: {stderr}"
        ) from exc

    value = proc.stdout.strip()
    if not value:
        raise AdminPasswordUnavailable(
            f"{SECRET_NAME} resolved empty in project {PROJECT_ID} "
            f"(env={ENVIRONMENT}, path={SECRET_PATH}). Set it in Infisical — this "
            "repo has no other source."
        )
    return value


def _fetch_from_keychain() -> str | None:
    """The macOS login keychain, as an unattended fallback.

    This tier exists because of how the secret is actually consumed: a launchd
    LaunchAgent firing at 06:00 on a Saturday. The ``infisical`` CLI's session is an
    interactive login that expires — it was *already* expired on this machine while
    this was being built — and a weekly job that silently stops working the first time
    a token lapses is not automation, it is a trap.

    The login keychain is unlocked for the whole of Joe's GUI session, which is the
    session a LaunchAgent runs in, so ``security find-generic-password`` succeeds
    unattended. Infisical stays the source of truth and the cross-machine store;
    this is the copy that survives a lapsed token. ``make foundry-admin-push`` copies
    Infisical's value down into it, so the mirror cannot drift from the source.
    """
    try:
        proc = subprocess.run(
            ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
            capture_output=True, text=True, check=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    return proc.stdout.strip() or None


def foundry_admin_password(required: bool = True) -> str | None:
    """Return the admin password, or ``None`` when ``required`` is False and it is
    not configured.

    Order: an injected env var (``infisical run``), then Infisical proper, then the
    macOS keychain. The optional mode exists because the updater must still run — with
    a reduced feature set, and saying so — before this secret has been set up.
    """
    injected = os.environ.get(SECRET_NAME, "").strip()
    if injected:
        return injected
    try:
        return _fetch_from_infisical()
    except AdminPasswordUnavailable:
        fallback = _fetch_from_keychain()
        if fallback:
            return fallback
        if required:
            raise
        return None


def source_of_record() -> str:
    """Which tier answered, for the run report — never the value itself."""
    if os.environ.get(SECRET_NAME, "").strip():
        return "env var"
    try:
        _fetch_from_infisical()
        return "infisical"
    except AdminPasswordUnavailable:
        return "macOS keychain" if _fetch_from_keychain() else "unavailable"


def check() -> int:
    """Verify retrieval WITHOUT revealing the value."""
    try:
        value = foundry_admin_password()
    except AdminPasswordUnavailable as exc:
        print(f"✗ {SECRET_NAME}: {exc}", file=sys.stderr)
        return 1
    source = source_of_record()
    weak = " — SHORT, consider a longer one" if len(value) < 12 else ""
    print(f"✓ {SECRET_NAME} resolved via {source} ({len(value)} chars{weak})")
    if source == "macOS keychain":
        print("  ▸ Infisical did not answer — run `infisical login` to refresh it. "
              "The unattended job still works from the keychain copy meanwhile.")
    return 0


if __name__ == "__main__":
    raise SystemExit(check())
