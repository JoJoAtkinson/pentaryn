#!/usr/bin/env python3
"""What each installed package looks like upstream, and what changed since.

Two jobs, deliberately separate:

**Version resolution** answers "is there a newer one?". The primary source is the
package's own ``manifest`` URL — the same thing Foundry fetches — because it also
carries the target's ``compatibility`` and ``relationships``, which the risk rules need.

There is one trap that a naive manifest fetch walks straight into: **some manifest URLs
are version-pinned**. ``multi-token-edit`` points at ``releases/download/3.2.5/module.json``
and ``scene-packer`` at ``releases/download/2.8.12/module.json``. Those URLs will report
the installed version forever, so the package looks permanently up to date. Wherever a
manifest is a pinned GitHub asset we also ask the GitHub API for the latest release and
prefer it.

**Release notes** answer "should we?". Almost nothing declares a ``changelog`` field
(4 of 28), so notes come from the forge itself: the GitHub Releases API via ``gh``
(authenticated — 5000 requests/hour rather than 60), GitLab's REST API for Dice So Nice,
and for premium content the package's own site, since licence-gated releases have no
public notes to read.

Everything is cached under ``.state/vtt-update-cache/`` for the day, so re-running a dry
scan while iterating costs nothing.
"""

from __future__ import annotations

import json
import re
import subprocess
import time
import urllib.parse
from dataclasses import dataclass, field
from pathlib import Path

import requests

from scripts.foundry.update.inventory import Package

REPO_ROOT = Path(__file__).resolve().parents[3]
CACHE_DIR = REPO_ROOT / ".state" / "vtt-update-cache"
CACHE_TTL = 6 * 3600

FORGE_BAZAAR = "https://forge-vtt.com/api/bazaar/package/{id}"
R2_MANIFEST = "https://r2.foundryvtt.com/packages-public/{id}/module.json"

GITHUB_RE = re.compile(r"github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/|$)")
GITLAB_RE = re.compile(r"gitlab\.com/([^/]+/[^/]+?)(?:/-/|/$|$)")
# `.../releases/download/<tag>/module.json` is pinned; `.../releases/latest/download/...`
# is not. Only the former needs the GitHub API to find what "current" actually means.
PINNED_ASSET_RE = re.compile(r"/releases/download/([^/]+)/")

USER_AGENT = "pentaryn-vtt-updater (+https://github.com/JoJoAtkinson)"


@dataclass
class Upstream:
    """The resolved upstream state of one package."""

    id: str
    type: str
    installed: str
    latest: str | None = None
    manifest_url: str | None = None      # the URL to hand installPackage
    compatibility: dict = field(default_factory=dict)
    relationships: dict = field(default_factory=dict)
    protected: bool = False
    source: str = "none"                 # manifest | github | gitlab | r2 | forge | none
    notes: list[dict] = field(default_factory=list)   # newest first
    notes_url: str | None = None
    error: str | None = None

    @property
    def has_update(self) -> bool:
        return bool(self.latest) and is_newer(self.latest, self.installed)

    def to_json(self, *, scrub: bool = False) -> dict:
        d = {
            "id": self.id, "type": self.type, "installed": self.installed,
            "latest": self.latest, "source": self.source,
            "compatibility": self.compatibility, "relationships": self.relationships,
            "protected": self.protected, "notes_url": self.notes_url,
            "has_update": self.has_update, "error": self.error,
            "notes": self.notes,
        }
        # Premium download URLs are signed and tokened; the manifest URL is not, but a
        # scrubbed record drops anything that could carry entitlement.
        d["manifest_url"] = None if scrub and self.protected else self.manifest_url
        return d


# ── Version comparison ───────────────────────────────────────────────────────

_NUM = re.compile(r"\d+")


def _parts(version: str) -> list[int]:
    """Foundry's own ``isNewerVersion`` is a loose numeric-part comparison, and package
    versions here are genuinely ragged — ``v1.1.4``, ``14.01``, ``1.13.5.1``. Compare
    the numeric runs and nothing else rather than pretending this is strict semver."""
    return [int(n) for n in _NUM.findall(version or "")]


def is_newer(candidate: str | None, current: str | None) -> bool:
    if not candidate:
        return False
    a, b = _parts(candidate), _parts(current or "")
    for x, y in zip(a, b):
        if x != y:
            return x > y
    return len(a) > len(b)


def bump_kind(current: str, candidate: str) -> str:
    """``major`` / ``minor`` / ``patch`` / ``none``, on the first differing part.

    Note ``14.01 -> 14.02`` reads as minor and ``5.3.3 -> 5.4.0`` as minor too; that is
    the intent. The risk table only distinguishes major from everything else.
    """
    a, b = _parts(current), _parts(candidate)
    if not is_newer(candidate, current):
        return "none"
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            return {0: "major", 1: "minor"}.get(i, "patch")
    return "patch"


# ── Cached HTTP ──────────────────────────────────────────────────────────────

def _cache_path(key: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", key)[:180]
    return CACHE_DIR / f"{safe}.json"


def _cached(key: str, produce, ttl: int = CACHE_TTL):
    path = _cache_path(key)
    if path.exists() and (time.time() - path.stat().st_mtime) < ttl:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    value = produce()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")
    return value


def fetch_json(url: str, timeout: float = 25.0, retries: int = 3) -> dict | None:
    """GET with backoff. Returns ``None`` rather than raising: an unreachable upstream
    is a normal weekly occurrence and must degrade to "unresolved", not kill the run."""
    delay = 2.0
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=timeout, headers={"User-Agent": USER_AGENT})
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json()
        except (requests.RequestException, json.JSONDecodeError):
            if attempt == retries - 1:
                return None
            time.sleep(delay)
            delay *= 3
    return None


def gh_api(path: str, *, paginate: bool = False) -> list | dict | None:
    """GitHub through the authenticated ``gh`` CLI — 5000 req/hr instead of 60, and no
    token handling of our own."""
    cmd = ["gh", "api", path]
    if paginate:
        cmd.append("--paginate")
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return None


# ── Source detection ─────────────────────────────────────────────────────────

def github_repo(pkg: Package) -> str | None:
    for candidate in (pkg.manifest, pkg.download, pkg.url, pkg.changelog):
        if not candidate:
            continue
        m = GITHUB_RE.search(candidate)
        if m:
            return f"{m.group(1)}/{m.group(2)}"
    return None


def gitlab_project(pkg: Package) -> str | None:
    for candidate in (pkg.manifest, pkg.download, pkg.url):
        if not candidate:
            continue
        m = GITLAB_RE.search(candidate)
        if m:
            return m.group(1)
    return None


# ── Resolution ───────────────────────────────────────────────────────────────

def _from_manifest(url: str) -> dict | None:
    return _cached(f"manifest_{url}", lambda: fetch_json(url))


def _github_latest(repo: str) -> dict | None:
    return _cached(f"gh_latest_{repo}", lambda: gh_api(f"repos/{repo}/releases/latest"))


def _github_releases(repo: str, limit: int = 12) -> list:
    data = _cached(f"gh_releases_{repo}",
                   lambda: gh_api(f"repos/{repo}/releases?per_page={limit}"))
    return data if isinstance(data, list) else []


def _gitlab_releases(project: str, limit: int = 12) -> list:
    quoted = urllib.parse.quote(project, safe="")
    url = f"https://gitlab.com/api/v4/projects/{quoted}/releases?per_page={limit}"
    data = _cached(f"gl_releases_{project}", lambda: fetch_json(url))
    return data if isinstance(data, list) else []


def _manifest_asset_url(release: dict, name: str) -> str | None:
    for asset in release.get("assets", []) or []:
        if asset.get("name") == name:
            return asset.get("browser_download_url")
    return None


def resolve(pkg: Package, *, notes: bool = True) -> Upstream:
    """Resolve one package's upstream state. Never raises for network reasons."""
    up = Upstream(id=pkg.id, type=pkg.type, installed=pkg.version,
                  protected=pkg.protected, manifest_url=pkg.manifest)

    if pkg.kind == "local":
        up.source = "local"
        return up

    manifest_name = "system.json" if pkg.type == "system" else "module.json"

    # 1. The package's declared manifest — what Foundry itself would fetch.
    data = _from_manifest(pkg.manifest) if pkg.manifest else None
    if data:
        up.latest = str(data.get("version", "")) or None
        up.compatibility = data.get("compatibility") or {}
        up.relationships = data.get("relationships") or {}
        up.source = "manifest"

    # 2. A pinned manifest URL never advances — ask the forge what "latest" is.
    repo = github_repo(pkg)
    pinned = bool(pkg.manifest and PINNED_ASSET_RE.search(pkg.manifest)
                  and "/releases/latest/" not in pkg.manifest)
    if repo and (pinned or not data):
        latest = _github_latest(repo)
        if latest:
            asset = _manifest_asset_url(latest, manifest_name)
            fresh = _from_manifest(asset) if asset else None
            if fresh and is_newer(str(fresh.get("version", "")), up.latest or pkg.version):
                up.latest = str(fresh.get("version", "")) or up.latest
                up.compatibility = fresh.get("compatibility") or up.compatibility
                up.relationships = fresh.get("relationships") or up.relationships
                up.manifest_url = asset
                up.source = "github"

    # 3. Premium content: the public r2 manifest carries the version even though the
    #    download is licence-gated. Forge's bazaar is a third opinion when r2 is silent.
    if not up.latest and pkg.type == "module":
        r2 = _cached(f"r2_{pkg.id}", lambda: fetch_json(R2_MANIFEST.format(id=pkg.id)))
        if r2:
            up.latest = str(r2.get("version", "")) or None
            up.compatibility = r2.get("compatibility") or up.compatibility
            up.relationships = r2.get("relationships") or up.relationships
            up.manifest_url = up.manifest_url or R2_MANIFEST.format(id=pkg.id)
            up.source = "r2"
    if not up.latest and pkg.type == "module":
        forge = _cached(f"forge_{pkg.id}",
                        lambda: fetch_json(FORGE_BAZAAR.format(id=pkg.id)))
        version = ((forge or {}).get("package") or {}).get("version")
        if version:
            up.latest, up.source = str(version), "forge"

    if not up.latest:
        up.error = "could not resolve an upstream version"

    if notes and up.has_update:
        _attach_notes(pkg, up, repo)
    return up


def _attach_notes(pkg: Package, up: Upstream, repo: str | None) -> None:
    """Collect every release note between the installed version and the target.

    Reading only the newest release would miss the breaking change three releases back
    that we are also about to skip over — which is precisely what the adjudicator is
    for. Bodies are truncated because they are fed to an LLM.
    """
    releases: list[dict] = []
    if repo:
        up.notes_url = f"https://github.com/{repo}/releases"
        for rel in _github_releases(repo):
            tag = (rel.get("tag_name") or "").lstrip("v")
            if is_newer(tag, up.installed):
                releases.append({
                    "version": tag,
                    "name": rel.get("name") or tag,
                    "url": rel.get("html_url"),
                    "published": rel.get("published_at"),
                    "body": (rel.get("body") or "")[:4000],
                })
    elif (project := gitlab_project(pkg)):
        up.notes_url = f"https://gitlab.com/{project}/-/releases"
        for rel in _gitlab_releases(project):
            tag = (rel.get("tag_name") or "").lstrip("v")
            if is_newer(tag, up.installed):
                releases.append({
                    "version": tag,
                    "name": rel.get("name") or tag,
                    "url": (rel.get("_links") or {}).get("self"),
                    "published": rel.get("released_at"),
                    "body": (rel.get("description") or "")[:4000],
                })
    else:
        # Premium content: no public release feed. Point a human at the vendor page.
        up.notes_url = pkg.changelog or pkg.url

    up.notes = releases[:8]


def resolve_all(packages: list[Package], *, notes: bool = True) -> dict[str, Upstream]:
    return {p.id: resolve(p, notes=notes) for p in packages}


if __name__ == "__main__":  # pragma: no cover - manual inspection aid
    from scripts.foundry.update.inventory import scan

    for u in resolve_all(scan(), notes=False).values():
        flag = "UPDATE" if u.has_update else ("  --  " if not u.error else " ???  ")
        print(f"  {flag}  {u.id:38} {u.installed:>10} -> {str(u.latest):>10}  [{u.source}]")
