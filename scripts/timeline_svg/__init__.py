from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PreflightResult:
    ok: bool
    message: str


def preflight_pillow_raqm(*, setup_script: str = "scripts/setup_pillow_raqm.sh") -> PreflightResult:
    try:
        from PIL import features  # type: ignore
    except Exception:
        return PreflightResult(
            ok=False,
            message=(
                "ERROR: Pillow is not installed in this environment.\n"
                f"Run: `{setup_script}` (or reinstall your environment via uv) and try again."
            ),
        )

    if not features.check("raqm"):
        return PreflightResult(
            ok=False,
            message=(
                "ERROR: Pillow was built without RAQM (`features.check('raqm')` is false).\n"
                f"Run: `{setup_script}` to install native deps and rebuild Pillow from source."
            ),
        )

    return PreflightResult(ok=True, message="ok")
