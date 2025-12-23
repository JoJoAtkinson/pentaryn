#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
from dataclasses import dataclass
from pathlib import Path


TAG_RE = re.compile(r"#[A-Za-z0-9][A-Za-z0-9_-]*")


@dataclass(frozen=True)
class Suggestion:
    tag: str
    rank: int
    src: Path
    dst: Path


def _normalize_tag(raw: str) -> str:
    return raw.strip().lstrip("#").lower().replace("_", "-")


def collect_tags(world_root: Path) -> list[str]:
    tags: set[str] = set()

    for md in world_root.rglob("*.md"):
        try:
            text = md.read_text(encoding="utf-8")
        except Exception:
            continue
        for t in TAG_RE.findall(text):
            tags.add(_normalize_tag(t))

    for tsv in world_root.rglob("_history.tsv"):
        try:
            lines = [ln for ln in tsv.read_text(encoding="utf-8").splitlines() if ln.strip()]
        except Exception:
            continue
        if not lines:
            continue
        header = lines[0].split("\t")
        if "tags" not in header:
            continue
        idx = header.index("tags")
        for ln in lines[1:]:
            cols = ln.split("\t")
            if len(cols) <= idx:
                continue
            cell = cols[idx].strip()
            if not cell:
                continue
            for part in cell.split(";"):
                part = _normalize_tag(part)
                if part:
                    tags.add(part)

    return sorted(tags)


def _keywords_for_tag(tag: str) -> list[str]:
    base_parts = [p for p in tag.split("-") if p]

    synonyms: dict[str, list[str]] = {
        "age": ["hourglass", "timeline", "calendar", "ancient"],
        "battle": ["crossed-swords", "sword", "shield", "helmet"],
        "bureaucracy": ["scroll", "quill", "wax-seal", "paper"],
        "calendar": ["calendar", "hourglass", "sundial"],
        "character": ["person", "knight", "hood", "adventurer"],
        "city-state": ["castle", "tower", "gate", "city"],
        "conflict": ["crossed-swords", "broken", "skull", "rage"],
        "crime": ["dagger", "mask", "thief", "lockpick", "hood"],
        "defense": ["shield", "tower-shield", "wall", "fortress"],
        "diplomacy": ["handshake", "dove", "olive", "treaty", "scroll"],
        "dwarves": ["anvil", "hammer", "pickaxe", "mountain"],
        "economy": ["coin", "scales", "treasure", "chest"],
        "elder": ["staff", "candle", "book", "hood"],
        "elves": ["leaf", "bow", "tree", "rune"],
        "faction": ["banner", "flag", "emblem", "heraldry"],
        "factions": ["banner", "flag", "emblem", "heraldry"],
        "geography": ["mountain", "map", "compass", "river"],
        "government": ["crown", "capitol", "gavel", "scroll"],
        "history": ["scroll", "book", "quill", "timeline"],
        "important": ["star", "crown", "exclamation", "seal"],
        "infrastructure": ["bridge", "road", "gear", "tower"],
        "inn": ["mug", "beer", "tankard", "bed"],
        "inspiration": ["spark", "lightbulb", "scroll", "book"],
        "law": ["gavel", "scales", "judge", "badge", "seal"],
        "location": ["map", "pin", "compass", "signpost"],
        "lore": ["book", "scroll", "quill"],
        "magic": ["wand", "spell-book", "rune", "crystal"],
        "military": ["helmet", "shield", "spear", "banner"],
        "naming": ["quill", "scroll", "tag", "signature"],
        "npc": ["person", "hood", "mask"],
        "orc": ["axe", "skull", "rage", "warrior"],
        "orcs": ["axe", "skull", "rage", "warrior"],
        "party": ["campfire", "backpack", "dice", "toast"],
        "person": ["person", "hood", "silhouette"],
        "politics": ["crown", "handshake", "scroll", "capitol"],
        "raids": ["axe", "torch", "skull", "crossed-swords"],
        "recovery": ["bandage", "potion", "herbs", "heart"],
        "reference": ["bookmark", "book", "scroll"],
        "references": ["bookmark", "book", "scroll"],
        "region": ["map", "compass", "mountain", "tree"],
        "secrets": ["eye", "mask", "cloak", "lock"],
        "siege": ["catapult", "battering-ram", "wall", "tower"],
        "template": ["grid", "document", "scroll", "clipboard"],
        "trade": ["scales", "coin", "ship", "handshake", "crate"],
        "tribe": ["totem", "campfire", "spear", "tent"],
        "unrest": ["fist", "riot", "angry", "broken"],
        "war": ["crossed-swords", "helmet", "shield", "banner"],
        "ward": ["shield", "eye-shield", "rune", "magic"],
        "wards": ["shield", "eye-shield", "rune", "magic"],
        "witch": ["witch", "broom", "cauldron", "oak", "rune"],
        "world": ["globe", "map", "compass"],
        "worldbuilding": ["map", "compass", "castle", "book"],
    }

    keywords: list[str] = [tag] + base_parts + synonyms.get(tag, [])
    # Deduplicate, keep order
    seen: set[str] = set()
    out: list[str] = []
    for k in keywords:
        k = k.strip().lower().replace("_", "-")
        if not k or k in seen:
            continue
        out.append(k)
        seen.add(k)
    return out


def _score_icon(path: Path, keywords: list[str]) -> int:
    name = path.stem.lower()
    score = 0
    for i, kw in enumerate(keywords):
        if not kw:
            continue
        if kw == name:
            score += 1000 - i
        elif kw in name:
            score += 200 - i
    # small preference: lorc set tends to be consistent
    if path.parts[-2].lower() == "lorc":
        score += 5
    return score


def suggest_icons(
    icons_root: Path, tag: str, count: int, avoid_stems: set[str]
) -> list[Path]:
    keywords = _keywords_for_tag(tag)
    candidates: list[tuple[int, Path]] = []
    for icon in icons_root.rglob("*.svg"):
        stem = icon.stem.lower()
        if stem in avoid_stems:
            continue
        score = _score_icon(icon, keywords)
        if score > 0:
            candidates.append((score, icon))

    if not candidates:
        # fallback: deterministic pick based on tag hash among all icons
        all_icons = sorted(icons_root.rglob("*.svg"))
        if not all_icons:
            return []
        start = abs(hash(tag)) % len(all_icons)
        out: list[Path] = []
        for i in range(len(all_icons)):
            p = all_icons[(start + i) % len(all_icons)]
            if p.stem.lower() in avoid_stems:
                continue
            out.append(p)
            if len(out) >= count:
                break
        return out

    candidates.sort(key=lambda x: (-x[0], str(x[1])))
    out: list[Path] = []
    for _, p in candidates:
        if p.stem.lower() in {x.stem.lower() for x in out}:
            continue
        out.append(p)
        if len(out) >= count:
            break
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Suggest icons for tags under world/.")
    ap.add_argument("--world", default="world", help="World root folder (default: world)")
    ap.add_argument(
        "--icons",
        default=".artifacts/transparent/1x1",
        help="Icon source root (default: .artifacts/transparent/1x1)",
    )
    ap.add_argument(
        "--out",
        default="icon-consideration/tag-suggestions",
        help="Output folder (default: icon-consideration/tag-suggestions)",
    )
    ap.add_argument("--count", type=int, default=3, help="Suggestions per tag (default: 3)")
    ap.add_argument("--limit-tags", type=int, default=0, help="If >0, only process first N tags")
    args = ap.parse_args()

    world_root = Path(args.world)
    icons_root = Path(args.icons)
    out_root = Path(args.out)

    if not world_root.exists():
        raise SystemExit(f"World folder not found: {world_root}")
    if not icons_root.exists():
        raise SystemExit(
            f"Icon source folder not found: {icons_root} (did you generate/download icons?)"
        )

    tags = collect_tags(world_root)
    if args.limit_tags and args.limit_tags > 0:
        tags = tags[: args.limit_tags]

    out_root.mkdir(parents=True, exist_ok=True)

    # Avoid reusing icons already chosen as faction icons (picked earlier in this vault).
    avoid_stems: set[str] = {
        "spiral-bloom",
        "stone-bridge",
        "imperial-crown",
        "dungeon-gate",
        "oak",
        "gear-hammer",
        "crossed-axes",
        "scales",
        "spark-spirit",
    }

    suggestions: list[Suggestion] = []
    for tag in tags:
        picks = suggest_icons(icons_root, tag, args.count, avoid_stems=avoid_stems)
        for i, src in enumerate(picks, start=1):
            dst = out_root / f"{tag}_{i}.svg"
            suggestions.append(Suggestion(tag=tag, rank=i, src=src, dst=dst))

    for s in suggestions:
        shutil.copyfile(s.src, s.dst)

    print(f"tags: {len(tags)}")
    print(f"icons_copied: {len(suggestions)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
