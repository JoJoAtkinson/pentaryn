#!/usr/bin/env python3
"""What is installed, read straight off disk.

Driven entirely by the contents of ``Data/modules`` and ``Data/systems``, so a module
Joe installs by hand next month is picked up on the next run with no config change —
that was an explicit requirement, and it rules out any hardcoded package list.

Four kinds of package come out of this:

``tracked``    a manifest URL we can resolve upstream. The normal case (22 of 28 here).
``protected``  premium content — resolvable for *version* via its public manifest, but
               the download is licence-gated. Foundry handles that itself through
               ``getProtectedDownloadURL``; we just note it.
``local``      the ``pentaryn-*`` modules built in this repo. No manifest, never
               updated from upstream — but drift against ``foundry/module/`` is worth
               reporting, because a stale copy in ``Data/`` is a real failure mode.
``forked``     a git checkout living in ``Data/modules``. None exist today; the check
               is here so that the day one does, it is not silently treated as local.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from scripts.foundry.ops.digest import tree_digest
from scripts.foundry.update.admin import MANIFEST_NAME, PACKAGE_DIR

REPO_ROOT = Path(__file__).resolve().parents[3]
REPO_MODULE_SRC = REPO_ROOT / "foundry" / "module"

# Modules built in this repo. Their source of truth is `foundry/module/`, never upstream.
LOCAL_PREFIX = "pentaryn-"

# The game system this tooling runs. Chosen by id, never "the first system installed":
# scan() sorts by id, so a second system (a5e, say) would otherwise be stashed,
# version-compared and recovered in dnd5e's place (EC-2).
SYSTEM_ID = "dnd5e"


def sync_hint(pkg_id: str) -> str:
    """The make target that puts a repo module into Data/ (python-tooling-9).

    `make foundry-<short>-sync` for every module except the importer, which ships with the actor
    pipeline (`make foundry-sync`, which also stages actors.json — so it names the world)."""
    if pkg_id == "pentaryn-importer":
        return "make foundry-sync WORLD=<world> (then make foundry-clean)"
    short = pkg_id.removeprefix(LOCAL_PREFIX)
    return f"make foundry-{short}-sync"


@dataclass
class Package:
    type: str                      # "module" | "system"
    id: str
    title: str
    version: str
    path: Path
    manifest: str | None = None    # upstream manifest URL, if the package declares one
    download: str | None = None
    changelog: str | None = None
    url: str | None = None
    protected: bool = False
    compatibility: dict = field(default_factory=dict)
    relationships: dict = field(default_factory=dict)
    git_remote: str | None = None  # set when the install dir is a git checkout

    @property
    def kind(self) -> str:
        if self.git_remote:
            return "forked"
        if self.is_local:
            return "local"
        if self.protected:
            return "protected"
        return "tracked" if self.manifest else "untracked"

    @property
    def is_local(self) -> bool:
        return self.id.startswith(LOCAL_PREFIX)

    def to_json(self) -> dict:
        return {
            "type": self.type, "id": self.id, "title": self.title,
            "version": self.version, "kind": self.kind, "manifest": self.manifest,
            "changelog": self.changelog, "url": self.url, "protected": self.protected,
            "compatibility": self.compatibility, "relationships": self.relationships,
            "git_remote": self.git_remote,
        }


def _git_remote(path: Path) -> str | None:
    """A module directory that is a git checkout is a fork Joe is maintaining by hand."""
    if not (path / ".git").exists():
        return None
    r = subprocess.run(["git", "-C", str(path), "remote", "get-url", "origin"],
                       capture_output=True, text=True)
    return r.stdout.strip() or None if r.returncode == 0 else None


def _read_package(pkg_type: str, path: Path) -> Package | None:
    manifest_file = path / MANIFEST_NAME[pkg_type]
    try:
        m = json.loads(manifest_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return Package(
        type=pkg_type,
        id=m.get("id") or path.name,
        title=m.get("title") or path.name,
        version=str(m.get("version", "")),
        path=path,
        manifest=m.get("manifest") or None,
        download=m.get("download") or None,
        changelog=m.get("changelog") or None,
        url=m.get("url") or None,
        protected=bool(m.get("protected")),
        compatibility=m.get("compatibility") or {},
        relationships=m.get("relationships") or {},
        git_remote=_git_remote(path),
    )


def scan(types: tuple[str, ...] = ("system", "module")) -> list[Package]:
    """Every installed package, sorted by type then id."""
    out: list[Package] = []
    for pkg_type in types:
        root = PACKAGE_DIR[pkg_type]
        if not root.is_dir():
            continue
        for child in sorted(root.iterdir()):
            if not child.is_dir() or child.name.startswith("."):
                continue
            pkg = _read_package(pkg_type, child)
            if pkg:
                out.append(pkg)
    return out


def local_drift(packages: list[Package]) -> list[dict]:
    """Compare the installed ``pentaryn-*`` modules against this repo's copies.

    Module sync copies rather than symlinks (deliberately — D8), so the two can and do
    diverge. A stale module in ``Data/`` looks exactly like a working one until something
    silently uses the old code, so it is worth a line in the report. A different version is
    one entry; the SAME version with different files is one too, marked ``content_drift``
    (the digest is module-sync's own, which ignores its sync stamp).
    """
    drift = []
    for pkg in packages:
        if not pkg.is_local:
            continue
        src = REPO_MODULE_SRC / pkg.id / MANIFEST_NAME[pkg.type]
        if not src.exists():
            drift.append({"id": pkg.id, "installed": pkg.version, "repo": None,
                          "note": "installed but not present in foundry/module/"})
            continue
        try:
            repo_version = json.loads(src.read_text(encoding="utf-8")).get("version")
        except (OSError, json.JSONDecodeError):
            continue
        if repo_version != pkg.version:
            drift.append({"id": pkg.id, "installed": pkg.version, "repo": repo_version,
                          "note": f"Data/ copy differs from the repo — run {sync_hint(pkg.id)}"})
            continue
        try:
            same = tree_digest(src.parent) == tree_digest(pkg.path)
        except OSError:
            continue
        if not same:
            drift.append({"id": pkg.id, "installed": pkg.version, "repo": repo_version,
                          "note": f"same version, different files in Data/ — run {sync_hint(pkg.id)}",
                          "content_drift": True})
    return drift


def worlds() -> list[dict]:
    """Installed worlds and the system version each was last migrated to.

    ``systemVersion`` in world.json is what ``migrateSystem`` stamps, so comparing it
    to the installed system tells you which worlds a system bump will migrate — and
    both worlds here migrate independently, at whatever moment each is next launched.
    """
    out = []
    root = PACKAGE_DIR["world"]
    if not root.is_dir():
        return out
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        try:
            w = json.loads((child / "world.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        out.append({
            "id": w.get("id", child.name), "title": w.get("title", child.name),
            "system": w.get("system"), "system_version": w.get("systemVersion"),
            "core_version": w.get("coreVersion"), "last_played": w.get("lastPlayed"),
        })
    return out


def summary() -> dict:
    pkgs = scan()
    return {
        "packages": [p.to_json() for p in pkgs],
        "counts": {k: sum(1 for p in pkgs if p.kind == k)
                   for k in ("tracked", "protected", "local", "forked", "untracked")},
        "local_drift": local_drift(pkgs),
        "worlds": worlds(),
    }


if __name__ == "__main__":  # pragma: no cover - manual inspection aid
    print(json.dumps(summary(), indent=2))
