#!/usr/bin/env python3
"""Runtime access to the Foundry VTT license key.

The key is NEVER stored in this repo, in a .env, or in any committed config.
It lives in Infisical (US cloud, app.infisical.com) and is read at runtime,
every time. There is no cache and no fallback to prompting or hardcoding.

Two supported paths, tried in this order:

1. **Already injected as an env var** — the preferred launch style, because
   the value never touches disk::

       infisical run --projectId <PROJECT_ID> --env dev -- make foundry-setup

2. **Fetched on demand** via the logged-in ``infisical`` CLI, for processes
   that can't control how they're launched.

Rules for anything importing this module:

- Never write the returned value to a file, a log, or stdout.
- Never pass it as a command-line argument (it shows up in ``ps``).
- Read it at the point of use; don't stash it in a module global.

Secret metadata (the key itself is the Foundry VTT license for
https://foundryvtt.com/, account ``atjoseph``; keys are viewable at
https://foundryvtt.com/community/atjoseph/licenses).
"""

from __future__ import annotations

import os
import re
import subprocess
import sys

# Infisical coordinates. These are identifiers, not secrets — safe to commit.
PROJECT_ID = "74f78c84-b0f0-45f9-8b7a-c3e54b0785b2"
ENVIRONMENT = "dev"
SECRET_PATH = "/"
SECRET_NAME = "FOUNDRY_VTT_LICENSE_KEY"

# Foundry keys look like XXXX-XXXX-XXXX-XXXX-XXXX-XXXX — six groups of four
# uppercase alphanumerics, 29 chars total.
# Advisory only — a format change upstream should not break retrieval.
KEY_PATTERN = re.compile(r"^[A-Z0-9]{4}(-[A-Z0-9]{4}){5}$")

_AUTH_HINT = (
    "Infisical could not authenticate. Run `infisical login` in a terminal, "
    "then retry. Do NOT hardcode the key or prompt for it."
)


class LicenseKeyUnavailable(RuntimeError):
    """The license key could not be resolved. Never carries the key itself."""


def _fetch_from_infisical() -> str:
    """Shell out to the logged-in infisical CLI. Returns the bare key."""
    try:
        proc = subprocess.run(
            [
                "infisical", "secrets", "get", SECRET_NAME,
                "--projectId", PROJECT_ID,
                "--env", ENVIRONMENT,
                "--path", SECRET_PATH,
                "--plain", "--silent",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError as exc:
        raise LicenseKeyUnavailable(
            "The `infisical` CLI is not installed. Install it with "
            "`brew install infisical/get-cli/infisical`."
        ) from exc
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        if re.search(r"auth|login|token|unauthor", stderr, re.IGNORECASE):
            raise LicenseKeyUnavailable(_AUTH_HINT) from exc
        raise LicenseKeyUnavailable(
            f"infisical exited {exc.returncode} fetching {SECRET_NAME}: {stderr}"
        ) from exc

    key = proc.stdout.strip()
    if not key:
        raise LicenseKeyUnavailable(
            f"{SECRET_NAME} resolved empty in project {PROJECT_ID} "
            f"(env={ENVIRONMENT}, path={SECRET_PATH})."
        )
    return key


def foundry_license_key() -> str:
    """Return the Foundry VTT license key.

    Prefers an already-injected ``FOUNDRY_VTT_LICENSE_KEY`` env var (set by
    ``infisical run``), otherwise fetches it via the infisical CLI.

    Raises:
        LicenseKeyUnavailable: if it cannot be resolved. The exception message
            is always safe to log — it never contains the key.
    """
    injected = os.environ.get(SECRET_NAME, "").strip()
    if injected:
        return injected
    return _fetch_from_infisical()


def check() -> int:
    """Verify retrieval works WITHOUT revealing the key. Returns an exit code."""
    source = "env var" if os.environ.get(SECRET_NAME, "").strip() else "infisical CLI"
    try:
        key = foundry_license_key()
    except LicenseKeyUnavailable as exc:
        print(f"✗ {SECRET_NAME}: {exc}", file=sys.stderr)
        return 1

    shape = "matches Foundry key format" if KEY_PATTERN.match(key) else (
        "UNEXPECTED format — check the secret value in Infisical"
    )
    # Length and shape only. The value is never printed.
    print(f"✓ {SECRET_NAME} resolved via {source} ({len(key)} chars, {shape})")
    return 0


if __name__ == "__main__":
    raise SystemExit(check())
