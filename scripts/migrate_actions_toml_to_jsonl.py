#!/usr/bin/env python3
"""One-shot migration: every <slug>.actions.toml in the repo → JSONL DB.

Reads every `*.actions.toml` under world/ and writes records to
`combat-runner/actions.jsonl` via the DB module's upsert. Optionally deletes
the .toml files after successful migration. Idempotent — re-running upserts
identical content.

Usage:
    python scripts/migrate_actions_toml_to_jsonl.py [--delete-toml] [--dry-run]
"""

from __future__ import annotations

import argparse
import sys
import tomllib
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT / "scripts"))

import combat_actions_db as db


def collect_toml_files() -> list[Path]:
    excluded = {".history", ".cache", ".output", ".venv", "__pycache__"}
    files = []
    for p in _REPO_ROOT.rglob("*.actions.toml"):
        if any(part in excluded for part in p.parts):
            continue
        files.append(p)
    return sorted(files)


def migrate_one(toml_path: Path, dry_run: bool = False) -> tuple[int, list[str]]:
    """Migrate one .actions.toml file. Returns (action_count, errors)."""
    try:
        data = tomllib.loads(toml_path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as e:
        return 0, [f"failed to parse {toml_path}: {e}"]

    slug = toml_path.stem.removesuffix(".actions")
    if "npc" in data and "slug" in data["npc"]:
        slug = data["npc"]["slug"]

    actions = data.get("actions", {})
    errors: list[str] = []
    count = 0
    for action_name, spec in actions.items():
        try:
            if dry_run:
                # Just validate
                errs = db.validate_spec(spec)
                if errs:
                    errors.append(f"{slug}.{action_name}: {'; '.join(errs)}")
                else:
                    count += 1
            else:
                db.upsert(slug, action_name, spec)
                count += 1
        except ValueError as e:
            errors.append(f"{slug}.{action_name}: {e}")
    return count, errors


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--delete-toml", action="store_true",
                    help="Delete the .actions.toml files after successful migration")
    ap.add_argument("--dry-run", action="store_true",
                    help="Validate only; don't write to DB or delete files")
    args = ap.parse_args()

    files = collect_toml_files()
    if not files:
        print("No *.actions.toml files found.")
        return 0

    print(f"Found {len(files)} .actions.toml file(s):")
    total_actions = 0
    all_errors: list[str] = []
    migrated_files: list[Path] = []
    for f in files:
        count, errors = migrate_one(f, dry_run=args.dry_run)
        rel = f.relative_to(_REPO_ROOT)
        if errors:
            print(f"  ✗ {rel} — {count} ok, {len(errors)} errors")
            all_errors.extend(errors)
        else:
            print(f"  ✓ {rel} — {count} action(s) migrated")
            migrated_files.append(f)
        total_actions += count

    if all_errors:
        print(f"\n{len(all_errors)} error(s):", file=sys.stderr)
        for e in all_errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print(f"\n{'Would migrate' if args.dry_run else 'Migrated'} {total_actions} action(s) total.")

    if args.delete_toml and not args.dry_run:
        for f in migrated_files:
            f.unlink()
            print(f"  deleted {f.relative_to(_REPO_ROOT)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
