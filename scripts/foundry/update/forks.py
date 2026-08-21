#!/usr/bin/env python3
"""Fork drift — "have I forked any of these, and should I pull upstream into my fork?"

There are no forks today, and no module in ``Data/modules`` is a git checkout, so this
is written as **discovery** rather than against a hardcoded list: it asks GitHub what
Joe has forked and matches those repos against the packages actually installed. The day
a fork appears it is picked up with no config change — which is the same property the
package inventory has, and for the same reason.

It **reports only**. Merging upstream into a fork is a code change with conflicts and
judgement in it; that is a job for a session with a human in it, not a 06:00 cron.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field

from scripts.foundry.update.inventory import Package
from scripts.foundry.update.upstream import github_repo


@dataclass
class ForkStatus:
    fork: str                    # owner/repo of Joe's fork
    upstream: str | None         # owner/repo it was forked from
    package_id: str | None       # the installed package it corresponds to, if any
    ahead: int = 0               # commits the fork has that upstream does not
    behind: int = 0              # commits upstream has that the fork does not
    branch: str | None = None
    error: str | None = None
    checkout_path: str | None = None   # set when it is checked out in Data/modules
    notes: list[str] = field(default_factory=list)

    def to_json(self) -> dict:
        return {
            "fork": self.fork, "upstream": self.upstream,
            "package_id": self.package_id, "ahead": self.ahead, "behind": self.behind,
            "branch": self.branch, "error": self.error,
            "checkout_path": self.checkout_path, "notes": self.notes,
        }


def _gh(args: list[str]) -> dict | list | None:
    r = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=90)
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return None


def list_forks(limit: int = 200) -> list[dict]:
    """Every fork on the authenticated account, with its parent."""
    data = _gh(["repo", "list", "--fork", "--limit", str(limit), "--json",
                "name,nameWithOwner,parent,defaultBranchRef"])
    return data if isinstance(data, list) else []


def parent_repo(fork: dict) -> str | None:
    """``owner/name`` of the repo a fork came from.

    ``gh repo list --json parent`` returns the parent as
    ``{"id", "name", "owner": {"login"}}`` — with **no** ``nameWithOwner``, unlike the
    top-level repo object. Reading the field that is not there is a silent miss, not an
    error, so assemble it from the two fields that are.
    """
    parent = fork.get("parent") or {}
    owner = (parent.get("owner") or {}).get("login")
    name = parent.get("name")
    return f"{owner}/{name}" if owner and name else None


def _default_branch(repo: str) -> str | None:
    data = _gh(["api", f"repos/{repo}", "--jq", ".default_branch"])
    if isinstance(data, str):
        return data
    return None


def _compare(upstream: str, fork: str, fork_branch: str) -> tuple[int, int, str | None]:
    """``ahead``/``behind`` for the fork against upstream.

    GitHub's compare is expressed from the base's point of view, so
    ``upstream:base...forkowner:branch`` gives ``ahead_by`` = commits the *fork*
    carries and ``behind_by`` = commits it is missing. Those are exactly the two
    numbers wanted: "did I change anything" and "should I pull the latest".

    The two sides can have different default branches, so ask upstream rather than
    assuming the fork's branch name exists there.
    """
    base = _default_branch(upstream) or fork_branch
    owner = fork.split("/")[0]
    data = _gh(["api", f"repos/{upstream}/compare/{base}...{owner}:{fork_branch}"])
    if not isinstance(data, dict):
        return 0, 0, (f"compare {upstream}:{base}...{owner}:{fork_branch} failed "
                      "(branch missing, or API error)")
    return int(data.get("ahead_by", 0)), int(data.get("behind_by", 0)), None


def check(packages: list[Package]) -> list[ForkStatus]:
    """Match account forks against installed packages, plus any git checkout in Data/."""
    by_repo: dict[str, Package] = {}
    for pkg in packages:
        repo = github_repo(pkg)
        if repo:
            by_repo[repo.lower()] = pkg

    out: list[ForkStatus] = []
    seen_forks: set[str] = set()

    for fork in list_forks():
        parent = parent_repo(fork)
        full = fork.get("nameWithOwner")
        if not full:
            continue
        pkg = by_repo.get((parent or "").lower())
        # A fork of something not installed is noise; a fork of something installed is
        # the whole point of this check.
        if not pkg:
            continue
        seen_forks.add(full.lower())
        branch = (fork.get("defaultBranchRef") or {}).get("name") or "main"
        ahead, behind, err = _compare(parent, full, branch)
        status = ForkStatus(fork=full, upstream=parent, package_id=pkg.id,
                            ahead=ahead, behind=behind, branch=branch, error=err)
        if behind and ahead:
            status.notes.append(
                f"{behind} commit(s) behind upstream and {ahead} of your own on top — "
                "a rebase or merge is a code change; do it by hand.")
        elif behind:
            status.notes.append(
                f"{behind} commit(s) behind upstream with no local changes — "
                f"safe to fast-forward: gh repo sync {full}")
        elif ahead:
            status.notes.append(f"{ahead} local commit(s) not upstream; nothing to pull.")
        out.append(status)

    # A module directory that IS a git checkout is a fork being maintained in place —
    # it will never appear via `gh repo list` if the remote is not on this account.
    for pkg in packages:
        if not pkg.git_remote:
            continue
        m = github_repo(Package(type=pkg.type, id=pkg.id, title=pkg.title,
                                version=pkg.version, path=pkg.path,
                                manifest=pkg.git_remote))
        name = m or pkg.git_remote
        if name.lower() in seen_forks:
            continue
        out.append(ForkStatus(fork=name, upstream=None, package_id=pkg.id,
                              checkout_path=str(pkg.path),
                              notes=["installed as a live git checkout in Data/modules — "
                                     "the updater will not touch it"]))
    return out
