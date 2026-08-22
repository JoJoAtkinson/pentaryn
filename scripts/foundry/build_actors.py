#!/usr/bin/env python3
"""Build `foundry/build/actors.json` from the combat-runner corpus.

Stage 1 of the Foundry pipeline. Reads two inputs — `foundry/actions.jsonl`
(every roll pre-computed) and the `#combat-runner` NPC markdown (HP/AC/CR/senses)
— and emits the generator side of the contract in `foundry/CONTRACT.md`.

The whole point of this script is that nothing here is derived at run time inside
Foundry. Attack bonuses are baked, so every attack activity carries
`attack.flat = true` and every weapon Item carries `proficient: 0`; otherwise
dnd5e would stack an ability modifier and proficiency on top of a number that
already includes them. Save DCs go in flat mode (`dc.calculation: ""`).

Three failure modes this guards against, all of them silent in Foundry:

* unknown keys are stripped rather than rejected — so we emit the minimum field
  set, and every field emitted is one the contract pins;
* `@ref` typos survive validation (replaced with 1) but evaluate to 0 — so every
  formula field is linted against `FORMULA_OK`, and the ref whitelist is empty;
* random activity ids would change the output on every run — so ids are a
  base-62 SHA-256 of `(npc, action, index)`.

Every `actions.jsonl` row is either mapped to an Item or recorded in the
manifest's `skipped` array with a reason from the closed set in CONTRACT §2.3,
and the build asserts `rows == items + skips` before writing anything.

Usage:
    python -m scripts.foundry.build_actors --out foundry/build/actors.json
    python -m scripts.foundry.build_actors --generated-at 2026-01-01T00:00:00+00:00

Writes nothing on failure — a stat disagreement between two markdown sources for
the same slug, an unparseable area/range/CR, or a duplicate activity id all abort
before the file is touched.
"""

from __future__ import annotations

import argparse
import copy
import datetime as dt
import hashlib
import html
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterable

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
ACTIONS_DB = REPO_ROOT / "foundry/actions.jsonl"
WORLD_DIR = REPO_ROOT / "world"
OVERRIDES_DIR = REPO_ROOT / "foundry/overrides"

CONTRACT = "pentaryn/actors.json@1"
GENERATOR = "scripts/foundry/build_actors.py"
GENERATOR_VERSION = "1.0.0"
TARGET_SYSTEM = "dnd5e"
TARGET_SYSTEM_VERSION = "5.3"
GENERATION = 14

# ---------------------------------------------------------------------------
# dnd5e 5.3.3 enums, read out of module/config.mjs in the installed system.
# ---------------------------------------------------------------------------

DAMAGE_TYPES = frozenset(
    "acid bludgeoning cold fire force lightning necrotic piercing poison "
    "psychic radiant slashing thunder".split()
)
CONDITION_TYPES = frozenset(
    "bleeding blinded burning charmed cursed dehydration deafened diseased "
    "exhaustion falling frightened grappled incapacitated invisible malnutrition "
    "paralyzed petrified poisoned prone restrained silenced stunned suffocation "
    "surprised transformed unconscious".split()
)
CREATURE_TYPES = frozenset(
    "aberration beast celestial construct dragon elemental fey fiend giant "
    "humanoid monstrosity ooze plant undead".split()
)
ABILITIES = frozenset("str dex con int wis cha".split())
SENSES = ("blindsight", "darkvision", "tremorsense", "truesight")
MOVEMENT_TYPES = ("walk", "burrow", "climb", "fly", "swim")
ACTOR_SIZES = frozenset("tiny sm med lg huge grg".split())
AREA_TARGET_TYPES = frozenset(
    "circle cone cube cylinder line radius sphere square wall".split()
)

# traits.size -> prototypeToken.width/height (CONTRACT §3.3).
SIZE_TO_TOKEN = {"tiny": 0.5, "sm": 1, "med": 1, "lg": 2, "huge": 3, "grg": 4}

# actions.jsonl `slots.refresh` -> DND5E.limitedUsePeriods (CONTRACT §4.3, U1/U2).
REFRESH_TO_PERIOD = {
    "long_rest": "lr",
    "short_rest": "sr",
    "round": "turnStart",
    "encounter": "initiative",
}

ON_SAVE = {"half": "half", "no damage": "none", "none": "none", "full": "full"}

ABILITY_LABELS = {
    "str": "Strength", "dex": "Dexterity", "con": "Constitution",
    "int": "Intelligence", "wis": "Wisdom", "cha": "Charisma",
}

# Foundry's own base-62 alphabet (common/utils/helpers.mjs randomID).
ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
VALID_ID = re.compile(r"^[a-zA-Z0-9]{16}$")

# CONTRACT §10: digits, dice, arithmetic, whitespace. No '@' — the ref whitelist
# is empty on purpose, because every number in actions.jsonl is pre-computed.
FORMULA_OK = re.compile(r"^[0-9d+\-*/(). ]*$")
ALLOWED_REFS: frozenset[str] = frozenset()

# Path suffixes (indices normalised to `[]`, activity ids to `*`) that land in a
# dnd5e FormulaField. Exactly the list in CONTRACT §10.
FORMULA_SUFFIXES = (
    "attributes.hp.formula",
    "attributes.init.bonus",
    *(f"attributes.movement.{m}" for m in (*MOVEMENT_TYPES, "bonus")),
    "uses.max",
    "uses.recovery.[].formula",
    "attack.bonus",
    "damage.critical.bonus",
    "damage.parts.[].bonus",
    "damage.parts.[].custom.formula",
    "damage.parts.[].scaling.formula",
    "save.dc.formula",
    "roll.formula",
    "range.value",
    "target.template.count",
    "target.template.size",
    "target.template.width",
    "target.template.height",
    "target.affects.count",
    "consumption.targets.[].value",
    "consumption.scaling.max",
)

# CONTRACT §4.2 — title-casing an `action` key into an Item name.
STOPWORDS = frozenset("of the a an and or to in on at for with vs".split())

OVERRIDE_TOP_KEYS = frozenset(
    "abilities attributes details traits prototypeToken items".split()
)

PARTY_PREFIX = "world/party/"


class BuildError(Exception):
    """Anything that must abort the build before a byte is written."""


# ---------------------------------------------------------------------------
# Small text helpers
# ---------------------------------------------------------------------------


def strip_bold(text: str) -> str:
    return text.replace("**", "")


def inline_html(text: str) -> str:
    """Minimal, deterministic Markdown-inline -> HTML.

    Deliberately tiny: the source is one-line prose written by hand, and a real
    Markdown library would introduce version-dependent output into a file whose
    whole value is being byte-stable.
    """
    out = html.escape(text.strip(), quote=False)
    out = out.replace("--", "—")
    out = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", out)
    out = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"(?<![\w*])\*([^*]+?)\*(?![\w*])", r"<em>\1</em>", out)
    out = re.sub(r"`([^`]+?)`", r"<code>\1</code>", out)
    return out


def paragraphs_html(text: str) -> str:
    """Blank-line separated blocks -> `<p>` runs, single newlines folded to spaces."""
    blocks = [b.strip() for b in re.split(r"\n\s*\n", text.strip()) if b.strip()]
    return "".join(f"<p>{inline_html(' '.join(b.split()))}</p>" for b in blocks)


def sentence(text: str) -> str:
    """Terminate a prose fragment so it reads as a sentence in the description."""
    text = text.strip()
    return text if text.endswith((".", "!", "?", ":", "—")) else text + "."


def title_case_action(action: str) -> str:
    words = action.replace("_", " ").split()
    out = []
    for i, word in enumerate(words):
        low = word.lower()
        out.append(low if i and low in STOPWORDS else low[:1].upper() + low[1:])
    return " ".join(out)


def fraction_to_number(token: str) -> float | int:
    if "/" in token:
        num, den = token.split("/", 1)
        return int(num) / int(den)
    return int(token)


def activity_id(npc: str, action: str, index: int) -> str:
    """Deterministic 16-char base-62 id — CONTRACT §5.1.

    Foundry uses `randomID(16)`; a random id per build would change every
    `contentHash` and break the golden-file test, so we hash the identity
    triple instead. Still matches `/^[a-zA-Z0-9]{16}$/`.
    """
    digest = hashlib.sha256(
        f"pentaryn/activity/{npc}/{action}/{index}".encode()
    ).digest()
    n = int.from_bytes(digest, "big")
    out = []
    for _ in range(16):
        n, r = divmod(n, 62)
        out.append(ID_ALPHABET[r])
    return "".join(out)


# ---------------------------------------------------------------------------
# Markdown parsing
# ---------------------------------------------------------------------------


class Sheet:
    """One `#combat-runner` markdown file, parsed into contract-shaped values."""

    def __init__(self, path: Path, rel: str) -> None:
        self.path = path
        self.rel = rel
        text = path.read_text(encoding="utf-8")

        fm_match = re.match(r"^---\n(.*?)\n---\n", text, re.S)
        if not fm_match:
            raise BuildError(f"{rel}: no YAML frontmatter")
        self.frontmatter: dict[str, Any] = yaml.safe_load(fm_match.group(1)) or {}
        self.body = text[fm_match.end():]

        self.slug = path.stem
        self.name = str(self.frontmatter.get("name") or title_case_action(self.slug))
        self.tags = [str(t) for t in self.frontmatter.get("tags", [])]

        self.encounter = self._encounter()
        self.creature_type = self._creature_type()
        self.cr = self._cr_from_tags()

        # Contract-compared values (§2.1 step 3).
        self.hp_max: int | None = None
        self.hp_formula = ""
        self.ac_flat: int | None = None
        self.ac_note = ""
        self.movement = {m: "" for m in MOVEMENT_TYPES}
        self.hover = False
        self.senses: dict[str, int | None] = {s: None for s in SENSES}
        self.di: list[str] = []
        self.dr: list[str] = []
        self.dv: list[str] = []
        self.ci: list[str] = []
        self.trait_custom = {"di": "", "dr": "", "dv": "", "ci": ""}
        self.skill_notes: list[str] = []
        self.unmapped: list[dict[str, Any]] = []

        self._parse_status_line()
        self.biography = self._biography()

    # -- discovery -------------------------------------------------------

    def _encounter(self) -> str:
        parts = self.rel.split("/")[:-1]
        while parts and parts[-1] == "npcs":
            parts.pop()
        if not parts:
            raise BuildError(f"{self.rel}: cannot derive an encounter folder")
        return parts[-1]

    def _creature_type(self) -> str:
        found = sorted({t.lstrip("#") for t in self.tags} & CREATURE_TYPES)
        if len(found) != 1:
            raise BuildError(
                f"{self.rel}: expected exactly one creature-type tag, found {found}"
            )
        return found[0]

    def _cr_from_tags(self) -> float | int:
        crs = [t.lstrip("#")[3:] for t in self.tags if t.lstrip("#").startswith("cr-")]
        if len(crs) != 1:
            raise BuildError(f"{self.rel}: expected exactly one #cr-* tag, found {crs}")
        raw = crs[0]
        return fraction_to_number(raw.replace("-", "/", 1) if "-" in raw else raw)

    # -- status line -----------------------------------------------------

    def _status_line(self) -> str:
        for line in self.body.splitlines():
            if line.lstrip().startswith("**HP**"):
                return line.strip()
        raise BuildError(f"{self.rel}: no `**HP** …` status line")

    def _parse_status_line(self) -> None:
        for raw in re.split(r"\s*(?:\*\*)?·(?:\*\*)?\s*", self._status_line()):
            seg = strip_bold(raw).strip().rstrip(".")
            if not seg:
                continue
            if not self._parse_segment(seg, raw.strip()):
                self.skill_notes.append(seg)

    def _parse_segment(self, seg: str, raw: str) -> bool:
        if m := re.match(r"^HP\s+(\d+)\s*(?:\(([^)]*)\))?$", seg):
            self.hp_max = int(m.group(1))
            self.hp_formula = self._hp_formula(m.group(2) or "")
            return True

        if m := re.match(r"^AC\s+(\d+)\s*(?:\(([^)]*)\))?$", seg):
            self.ac_flat = int(m.group(1))
            self.ac_note = (m.group(2) or "").strip()
            return True

        if m := re.match(r"^Speed\s+(.*)$", seg):
            self._parse_speed(m.group(1))
            return True

        if m := re.match(r"^CR\s+(\d+(?:/\d+)?)\b", seg):
            status_cr = fraction_to_number(m.group(1))
            if status_cr != self.cr:
                raise BuildError(
                    f"{self.rel}: status line CR {status_cr} contradicts the "
                    f"#cr-* tag ({self.cr})"
                )
            return True

        if m := re.match(rf"^({'|'.join(SENSES)})\s+(\d+)\s*ft$", seg, re.I):
            self.senses[m.group(1).lower()] = int(m.group(2))
            return True

        if m := re.match(r"^(\w+)\s+(immunity|resistance|vulnerability)$", seg, re.I):
            bucket = {"immunity": self.di, "resistance": self.dr,
                      "vulnerability": self.dv}[m.group(2).lower()]
            self._add_damage_token(m.group(1), bucket, raw)
            return True

        if m := re.match(r"^(Vulnerable|Resistant)\s+(.+)$", seg, re.I):
            bucket = self.dv if m.group(1).lower() == "vulnerable" else self.dr
            for tok in re.split(r"[,;]", m.group(2)):
                self._add_damage_token(tok, bucket, raw)
            return True

        if m := re.match(r"^Immune\s+(.+)$", seg, re.I):
            dmg, _, cond = m.group(1).partition(";")
            for tok in re.split(r"[,]", dmg):
                self._add_damage_token(tok, self.di, raw)
            for tok in re.split(r"[,]", cond):
                self._add_condition_token(tok, raw)
            return True

        if re.match(r"^No damage resistances", seg, re.I):
            return True

        return False

    def _hp_formula(self, paren: str) -> str:
        paren = paren.strip()
        if not paren:
            return ""
        if not re.fullmatch(r"\d+d\d+\s*(?:[+-]\s*\d+)?", paren):
            raise BuildError(f"{self.rel}: unparseable HP formula {paren!r}")
        m = re.fullmatch(r"(\d+d\d+)\s*(?:([+-])\s*(\d+))?", paren)
        assert m is not None
        return f"{m.group(1)} {m.group(2)} {m.group(3)}" if m.group(2) else m.group(1)

    def _parse_speed(self, text: str) -> None:
        for part in text.split(","):
            part = part.strip()
            if not part:
                continue
            m = re.match(
                rf"^(?:({'|'.join(MOVEMENT_TYPES)})\s+)?(\d+)\s*ft\.?(\s*\(hover\))?$",
                part,
                re.I,
            )
            if not m:
                raise BuildError(f"{self.rel}: unparseable speed segment {part!r}")
            mode = (m.group(1) or "walk").lower()
            self.movement[mode] = m.group(2)
            if m.group(3):
                self.hover = True

    def _add_damage_token(self, token: str, bucket: list[str], raw: str) -> None:
        key = token.strip().lower().removesuffix(" damage").strip()
        if not key:
            return
        if key in DAMAGE_TYPES:
            if key not in bucket:
                bucket.append(key)
            return
        self._record_custom_trait(key, raw, "damage type")

    def _add_condition_token(self, token: str, raw: str) -> None:
        key = token.strip().lower()
        if not key:
            return
        if key in CONDITION_TYPES:
            if key not in self.ci:
                self.ci.append(key)
            return
        self._record_custom_trait(key, raw, "condition")

    def _record_custom_trait(self, key: str, raw: str, kind: str) -> None:
        # CONTRACT §3.1: never discard silently — custom field plus a visible note.
        target = "ci" if kind == "condition" else "di"
        existing = [t for t in self.trait_custom[target].split("; ") if t]
        if key not in existing:
            existing.append(key)
        self.trait_custom[target] = "; ".join(existing)
        self.unmapped.append(
            {
                "field": f"status-line trait {raw!r}",
                "reason": f"{key!r} is not a dnd5e {kind} key",
                "renderedInto": f"system.traits.{target}.custom",
            }
        )

    def _biography(self) -> str:
        m = re.search(r"^## Description.*?$\n(.*?)(?=^## |\Z)", self.body, re.M | re.S)
        return paragraphs_html(m.group(1)) if m else ""

    # -- comparison ------------------------------------------------------

    def comparable(self) -> dict[str, Any]:
        """The values CONTRACT §2.1 forbids two sources of a slug to disagree on."""
        return {
            "hp.max": self.hp_max,
            "hp.formula": self.hp_formula,
            "ac.flat": self.ac_flat,
            "cr": self.cr,
            "type.value": self.creature_type,
            "movement": dict(self.movement) | {"hover": self.hover},
            "senses": dict(self.senses),
        }


def discover_sheets() -> dict[str, list[Sheet]]:
    """All `#combat-runner` NPC markdown, grouped by slug. PC sheets excluded."""
    by_slug: dict[str, list[Sheet]] = {}
    for path in sorted(WORLD_DIR.rglob("*.md")):
        head = "\n".join(path.read_text(encoding="utf-8").splitlines()[:30])
        if "#combat-runner" not in head:
            continue
        rel = path.relative_to(REPO_ROOT).as_posix()
        if rel.startswith(PARTY_PREFIX):
            continue  # player characters — CONTRACT §2.3 `pc-not-npc`
        by_slug.setdefault(path.stem, []).append(Sheet(path, rel))
    return by_slug


def pc_slugs() -> set[str]:
    return {
        p.stem
        for p in sorted((REPO_ROOT / PARTY_PREFIX).rglob("*.md"))
        if "#combat-runner" in "\n".join(p.read_text(encoding="utf-8").splitlines()[:30])
    }


# ---------------------------------------------------------------------------
# Row -> Item
# ---------------------------------------------------------------------------


def parse_dice(expr: str, where: str) -> tuple[int, int]:
    m = re.fullmatch(r"(\d+)d(\d+)", expr.strip())
    if not m:
        raise BuildError(f"{where}: expected a bare NdM dice string, got {expr!r}")
    return int(m.group(1)), int(m.group(2))


def damage_part(
    dice: str, damage_type: str, bonus: int | None, where: str
) -> dict[str, Any]:
    number, denomination = parse_dice(dice, where)
    key = damage_type.strip().lower()
    if key not in DAMAGE_TYPES:
        raise BuildError(f"{where}: {damage_type!r} is not a dnd5e damage type")
    return {
        "number": number,
        "denomination": denomination,
        "bonus": "" if not bonus else str(bonus),
        "types": [key],
        "custom": {"enabled": False, "formula": ""},
        "scaling": {"mode": "", "number": 1, "formula": ""},
    }


def parse_range(raw: str, where: str) -> tuple[int, int | None, bool]:
    """`'80/320 ft'` -> (80, 320, is_ranged). CONTRACT §7.4."""
    m = re.fullmatch(r"(\d+)(?:/(\d+))?\s*ft", raw.strip())
    if not m:
        raise BuildError(f"{where}: unparseable range {raw!r}")
    near = int(m.group(1))
    far = int(m.group(2)) if m.group(2) else None
    return near, far, far is not None or near > 10


AREA_PATTERNS = (
    re.compile(r"^(\d+)-ft radius, (\d+)-ft tall cylinder(?: \((.*)\))?$"),
    re.compile(r"^(\d+)-ft cone$"),
    re.compile(r"^(\d+)-ft radius(?: around .*)?$"),
    re.compile(r"^(\d+)-ft (line|cube|square|sphere|circle)$"),
)


def parse_area(raw: str, where: str) -> tuple[dict[str, str], dict[str, Any] | None]:
    """`area` prose -> (template patch, duration patch or None). CONTRACT §6.3."""
    text = raw.strip()
    for i, pattern in enumerate(AREA_PATTERNS):
        m = pattern.match(text)
        if not m:
            continue
        if i == 0:
            return ({"type": "cylinder", "count": "1", "size": m.group(1),
                     "height": m.group(2)}, parse_duration(m.group(3), where))
        if i == 1:
            return {"type": "cone", "count": "1", "size": m.group(1)}, None
        if i == 2:
            return {"type": "radius", "count": "1", "size": m.group(1)}, None
        kind = m.group(2)
        if kind not in AREA_TARGET_TYPES:
            raise BuildError(f"{where}: {kind!r} is not a dnd5e area target type")
        return {"type": kind, "count": "1", "size": m.group(1)}, None
    raise BuildError(f"{where}: unparseable area {raw!r}")


def parse_duration(paren: str | None, where: str) -> dict[str, Any] | None:
    if not paren:
        return None
    text = paren.strip().lower()
    if text == "instantaneous":
        return None
    concentration = "concentration" in text
    m = re.search(
        r"(\d+)\s+(turn|round|second|minute|hour|day|week|month|year)s?", text
    )
    if not m:
        raise BuildError(f"{where}: unparseable area duration {paren!r}")
    return {
        "units": m.group(2),
        "value": m.group(1),
        "special": "",
        "concentration": concentration,
        "override": True,
    }


def blank_activity(
    aid: str, kind: str, name: str, sort: int, activation: str, condition: str
) -> dict[str, Any]:
    """The shared envelope of CONTRACT §5.2, in contract key order."""
    return {
        "_id": aid,
        "type": kind,
        "name": name,
        "sort": sort,
        "activation": {
            "type": activation,
            "value": None,
            "condition": condition[:255],
            "override": True,
        },
        "consumption": {
            "targets": [],
            "scaling": {"allowed": False, "max": ""},
            "spellSlot": False,
        },
        "description": {"chatFlavor": ""},
        "duration": {
            "units": "inst",
            "value": "",
            "special": "",
            "concentration": False,
            "override": True,
        },
        "effects": [],
        "range": {"value": "", "units": "self", "special": "", "override": False},
        "target": {
            "affects": {"count": "", "type": "creature", "choice": False, "special": ""},
            "template": {
                "type": "", "count": "", "size": "", "width": "", "height": "",
                "units": "ft", "contiguous": False, "stationary": False,
            },
            "override": True,
            "prompt": True,
        },
        "uses": {"spent": 0, "max": "", "recovery": []},
    }


def utility_activation(row: dict[str, Any]) -> tuple[str, str]:
    """(`activation.type`, `activation.condition`) for a utility/reaction row."""
    if trigger := row.get("trigger"):
        return "reaction", str(trigger.get("match", ""))
    effect = row.get("effect") or ""
    lead = re.match(r"^\*\*(.+?)\*\*", effect)
    if lead:
        head = lead.group(1).lower()
        if head.startswith("bonus action"):
            return "bonus", str(row.get("prerequisite") or "")
        if head.startswith("reaction"):
            return "reaction", str(row.get("prerequisite") or "")
    return "action", str(row.get("prerequisite") or "")


class ItemBuilder:
    """Turns one `actions.jsonl` row into one Foundry Item (CONTRACT §2.2)."""

    def __init__(self, row: dict[str, Any], overrides: dict[str, Any]) -> None:
        self.row = row
        self.npc = row["npc"]
        self.action = row["action"]
        self.rtype = row["type"]
        self.where = f"{self.npc}.{self.action}"
        self.overrides = overrides
        self.paras: list[str] = []
        self.unmapped: list[dict[str, Any]] = []
        self.activities: dict[str, dict[str, Any]] = {}
        self.assertions: list[dict[str, Any]] = []
        self.item_labels: dict[str, str] = {}

    # -- description / unmapped bookkeeping ------------------------------

    def para(self, text: str, heading: str | None = None) -> None:
        body = inline_html(sentence(text))
        self.paras.append(
            f"<p><strong>{heading}:</strong> {body}</p>" if heading else f"<p>{body}</p>"
        )

    def unmap(self, field: str, reason: str, rendered: str | None) -> None:
        self.unmapped.append(
            {"field": field, "reason": reason, "renderedInto": rendered}
        )

    def next_activity(self, kind: str, name: str, activation: str, condition: str):
        index = len(self.activities)
        aid = activity_id(self.npc, self.action, index)
        act = blank_activity(aid, kind, name, index * 100_000, activation, condition)
        self.activities[aid] = act
        return act

    # -- build -----------------------------------------------------------

    def build(self) -> dict[str, Any]:
        row = self.row
        desc_prose = "<em>" + inline_html(row["narration"]) + "</em>"
        self.paras.append(f"<p>{desc_prose}</p>")
        if effect := row.get("effect"):
            self.paras.append(paragraphs_html(effect))

        if prereq := row.get("prerequisite"):
            self.para(prereq, "Prerequisite")
            self.unmap("prerequisite", "free-prose, not machine-readable",
                       "system.description.value")
        if trigger := row.get("trigger"):
            self.para(str(trigger.get("match", "")), "Trigger")
            self.unmap("trigger",
                       "combat-runner event hook; dnd5e has no declarative "
                       "reaction trigger", "system.description.value")
        if area := row.get("area"):
            self.para(area, "Area")
        if pre_save := row.get("pre_save"):
            self.para(pre_save, "Pre-save")
            self.unmap("pre_save",
                       "conditional-advantage rule with no dnd5e representation",
                       "system.description.value")
        if roll := row.get("roll"):
            if notes := roll.get("notes"):
                self.para(notes, "Note")
                self.unmap("roll.notes", "GM-facing guidance",
                           "system.description.value")
        # Order follows CONTRACT §6.1's worked example.
        if "priority" in row:
            self.unmap("priority",
                       "combat-runner action ordering; no Foundry equivalent", None)
        if row.get("verbs"):
            self.unmap("verbs", "combat-runner grammar tokens; no Foundry equivalent",
                       None)
        if "scope" in row:
            self.unmap("scope", "combat-runner targeting scope; no Foundry equivalent",
                       None)
        if "watch" in row:
            self.unmap("watch", "combat-runner ally-event watcher; no Foundry "
                                "equivalent", None)

        builders = {
            "single_attack": self._build_attacks,
            "multiattack": self._build_attacks,
            "area": self._build_area,
            "utility": self._build_utility,
            "reaction": self._build_reaction,
        }
        if self.rtype not in builders:
            raise BuildError(f"{self.where}: unknown row type {self.rtype!r}")
        builders[self.rtype]()
        self._credit_activation_condition()

        item_type = "weapon" if self.rtype == "single_attack" else "feat"
        system: dict[str, Any] = {
            "description": {"value": "".join(self.paras), "chat": ""},
            "type": (
                {"value": "natural", "baseItem": ""}
                if item_type == "weapon"
                else {"value": "monster", "subtype": ""}
            ),
        }
        if item_type == "weapon":
            # CONTRACT §5.3 — the bonus is pre-baked, so proficiency must not stack.
            system["proficient"] = 0
            system["equipped"] = True
            system["properties"] = []
            system["range"] = self._weapon_range()
        if uses := self._uses():
            system["uses"] = uses
        system["activities"] = self.activities

        return {
            "name": title_case_action(self.action),
            "type": item_type,
            "system": system,
            "flags": {
                "pentaryn": {
                    "npc": self.npc,
                    "action": self.action,
                    "rowType": self.rtype,
                    "unmapped": self.unmapped,
                }
            },
        }

    def _credit_activation_condition(self) -> None:
        """Point `renderedInto` at `activation.condition` where the prose landed there.

        The unmapped entries are recorded before activities exist, so the
        activity id can only be spliced in afterwards (CONTRACT §6.4/§6.5 show
        the two-destination form).
        """
        if not self.activities:
            return
        first = next(iter(self.activities.values()))
        condition = first["activation"]["condition"]
        if not condition:
            return
        sources = {
            "prerequisite": str(self.row.get("prerequisite") or "")[:255],
            "trigger": str((self.row.get("trigger") or {}).get("match", ""))[:255],
        }
        for entry in self.unmapped:
            field = entry["field"]
            if field in sources and sources[field] == condition:
                entry["renderedInto"] = (
                    f"system.activities.{first['_id']}.activation.condition "
                    "+ system.description.value"
                )

    # -- per-type bodies -------------------------------------------------

    def _weapon_range(self) -> dict[str, Any]:
        raw = self.row.get("range")
        if not raw:
            return {"value": None, "long": None, "reach": 5, "units": "ft"}
        near, far, ranged = parse_range(raw, self.where)
        return {
            "value": near,
            "long": far,
            "reach": None if ranged else 5,
            "units": "ft",
        }

    def _activity_range(self) -> dict[str, Any]:
        """Feat-level activity range. Melee attacks with no `range` take 5 ft reach."""
        raw = self.row.get("range")
        if not raw:
            return {"value": "5", "units": "ft", "special": "", "override": False}
        near, _far, _ranged = parse_range(raw, self.where)
        return {"value": str(near), "units": "ft", "special": "", "override": False}

    def _uses(self) -> dict[str, Any] | None:
        row = self.row
        if "recharge" in row and "slots" in row:
            raise BuildError(f"{self.where}: both `recharge` and `slots` present")
        if "recharge" in row:
            formula = str(row["recharge"])
            if int(formula) < 6:
                self.item_labels["recharge"] = f"Recharge [{formula}+]"
            return {
                "spent": 0,
                "max": "1",
                "recovery": [
                    {"period": "recharge", "type": "recoverAll", "formula": formula}
                ],
            }
        if slots := row.get("slots"):
            refresh = str(slots["refresh"])
            if refresh not in REFRESH_TO_PERIOD:
                raise BuildError(f"{self.where}: unknown slots.refresh {refresh!r}")
            return {
                "spent": 0,
                "max": str(slots["count"]),
                "recovery": [
                    {
                        "period": REFRESH_TO_PERIOD[refresh],
                        "type": "recoverAll",
                        "formula": "",
                    }
                ],
            }
        return None

    def _consume_first(self) -> None:
        """Point activity 0 at the Item's own uses pool (blank target = this Item)."""
        if not self._uses():
            return
        first = next(iter(self.activities.values()))
        first["consumption"]["targets"] = [
            {
                "type": "itemUses",
                "target": "",
                "value": "1",
                "scaling": {"mode": "", "formula": ""},
            }
        ]

    def _save_ability(self, raw: str) -> str:
        key = str(raw).strip().lower()
        if key not in ABILITIES:
            raise BuildError(f"{self.where}: {raw!r} is not a dnd5e ability key")
        return key

    def _on_save(self, raw: str) -> str:
        key = str(raw).strip().lower()
        if key not in ON_SAVE:
            raise BuildError(f"{self.where}: unknown on_save {raw!r}")
        return ON_SAVE[key]

    def _build_attacks(self) -> None:
        attacks = self.row.get("attacks") or []
        if not attacks:
            raise BuildError(f"{self.where}: {self.rtype} row has no attacks")
        is_weapon = self.rtype == "single_attack"
        raw_range = self.row.get("range")
        ranged = parse_range(raw_range, self.where)[2] if raw_range else False
        classification = self.overrides.get("attackClassification", "weapon")

        riders: list[tuple[str, dict[str, Any], int]] = []
        for i, atk in enumerate(attacks):
            act = self.next_activity("attack", str(atk["name"]), "action", "")
            if not is_weapon:
                act["range"] = self._activity_range()
            act["target"]["affects"]["count"] = "1"
            act["attack"] = {
                "ability": "none",
                "bonus": str(atk["to_hit_bonus"]),
                "flat": True,
                "critical": {"threshold": None},
                "type": {
                    "value": "ranged" if ranged else "melee",
                    "classification": classification,
                },
            }
            parts = [
                damage_part(atk["damage"], atk["damage_type"],
                            atk.get("damage_modifier"), self.where)
            ]
            if extra := atk.get("extra_damage"):
                parts.append(
                    damage_part(extra["dice"], extra["type"],
                                extra.get("modifier"), self.where)
                )
            act["damage"] = {
                "critical": {"bonus": ""},
                "includeBase": False,
                "parts": parts,
            }
            self.assertions.append(
                {
                    "id": act["_id"],
                    "type": "attack",
                    "labels.toHit": f"{int(atk['to_hit_bonus']):+d}",
                    "labels.damage.0.formula": formula_label(parts[0]),
                }
            )
            if rider := atk.get("rider_on_hit"):
                self.para(rider, f"{atk['name']} rider")
                self.unmap(f"attacks[{i}].rider_on_hit", "free-prose rider",
                           "system.description.value")
            if cond := atk.get("apply_condition_on_hit"):
                riders.append((str(atk["name"]), cond, i))

        for name, cond, i in riders:
            ability = self._save_ability(cond["save_ability"])
            label = str(cond["condition"])
            act = self.next_activity(
                "save",
                f"{name} — {label.capitalize()} (rider)",
                "special",
                f"On a hit with {name}",
            )
            if not is_weapon:
                act["range"] = self._activity_range()
            act["target"]["affects"]["count"] = "1"
            act["save"] = {
                "ability": [ability],
                "dc": {"calculation": "", "formula": str(cond["save_dc"])},
            }
            act["damage"] = {"onSave": "none", "parts": []}
            duration = cond.get("duration_rounds")
            self.para(
                f"on a hit, the target must make a DC {cond['save_dc']} "
                f"{ABILITY_LABELS[ability]} saving throw or be **{label}**"
                + (f" for {duration} round(s)" if duration else ""),
                f"{name} rider",
            )
            self.unmap(
                f"attacks[{i}].apply_condition_on_hit.condition",
                "dnd5e has no automatic condition application from an attack hit; "
                "emitted as a companion save activity plus prose",
                f"system.activities.{act['_id']} + system.description.value",
            )
            if duration:
                self.unmap(
                    f"attacks[{i}].apply_condition_on_hit.duration_rounds",
                    "needs an ActiveEffect with a round duration; effect authoring "
                    "is out of Stage 1 scope",
                    "system.description.value",
                )
            self.assertions.append(
                {
                    "id": act["_id"],
                    "type": "save",
                    "labels.save": f"DC {cond['save_dc']}",
                    "save.dc.value": int(cond["save_dc"]),
                }
            )
        self._consume_first()

    def _build_area(self) -> None:
        row = self.row
        act = self.next_activity("save", title_case_action(self.action), "action", "")
        template, duration = parse_area(str(row["area"]), self.where)
        act["target"]["template"].update(template)
        if duration:
            act["duration"] = duration
        save = row["save"]
        act["save"] = {
            "ability": [self._save_ability(save["ability"])],
            "dc": {"calculation": "", "formula": str(save["dc"])},
        }
        part = damage_part(row["damage"]["dice"], row["damage"]["type"], None,
                           self.where)
        act["damage"] = {"onSave": self._on_save(save["on_save"]), "parts": [part]}
        self.assertions.append(
            {
                "id": act["_id"],
                "type": "save",
                "labels.save": f"DC {save['dc']}",
                "save.dc.value": int(save["dc"]),
                "labels.damage.0.formula": formula_label(part),
            }
        )
        self._consume_first()

    def _build_utility(self) -> None:
        activation, condition = utility_activation(self.row)
        act = self.next_activity(
            "utility", title_case_action(self.action), activation, condition
        )
        act["target"]["affects"]["type"] = "self"
        roll = self.row.get("roll")
        if roll:
            modifier = int(roll.get("modifier") or 0)
            dice = str(roll["dice"])
            if modifier > 0:
                formula = f"{dice} + {modifier}"
            elif modifier < 0:
                formula = f"{dice} - {abs(modifier)}"
            else:
                formula = dice
            name = str(roll["label"]).split("(")[0].strip()
        else:
            formula, name = "", ""
        act["roll"] = {"formula": formula, "name": name, "prompt": False,
                       "visible": True}
        self._consume_first()

    def _build_reaction(self) -> None:
        row = self.row
        kind = row.get("reaction_kind")
        condition = str((row.get("trigger") or {}).get("match", ""))
        if kind in ("movement", "buff"):
            act = self.next_activity(
                "utility", title_case_action(self.action), "reaction", condition
            )
            act["target"]["affects"]["type"] = "self"
            act["roll"] = {"formula": "", "name": "", "prompt": False, "visible": True}
            self.unmap("reaction_kind",
                       "selects the activity type but carries no further meaning",
                       None)
            self._consume_first()
            return

        save = row.get("attacker_save") or row.get("save")
        if not save or "damage" not in row:
            raise BuildError(
                f"{self.where}: damage-kind reaction needs both `damage` and a save"
            )
        act = self.next_activity(
            "save", title_case_action(self.action), "reaction", condition
        )
        act["range"] = self._activity_range() if row.get("range") else act["range"]
        act["target"]["affects"]["count"] = "1"
        act["save"] = {
            "ability": [self._save_ability(save["ability"])],
            "dc": {"calculation": "", "formula": str(save["dc"])},
        }
        part = damage_part(row["damage"]["dice"], row["damage"]["type"], None,
                           self.where)
        act["damage"] = {"onSave": self._on_save(save["on_save"]), "parts": [part]}
        self.assertions.append(
            {
                "id": act["_id"],
                "type": "save",
                "labels.save": f"DC {save['dc']}",
                "save.dc.value": int(save["dc"]),
                "labels.damage.0.formula": formula_label(part),
            }
        )
        self._consume_first()


def formula_label(part: dict[str, Any]) -> str:
    """What dnd5e will render as `labels.damage[n].formula`."""
    base = f"{part['number']}d{part['denomination']}"
    bonus = part["bonus"]
    if not bonus:
        return base
    return f"{base} - {bonus[1:]}" if bonus.startswith("-") else f"{base} + {bonus}"


# ---------------------------------------------------------------------------
# Actor assembly
# ---------------------------------------------------------------------------


def load_override(slug: str) -> dict[str, Any]:
    path = OVERRIDES_DIR / f"{slug}.yml"
    if not path.exists():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    unknown = sorted(set(data) - OVERRIDE_TOP_KEYS)
    if unknown:
        raise BuildError(f"{path}: unknown top-level override keys {unknown}")
    return data


def deep_merge(base: dict[str, Any], patch: dict[str, Any], prefix: str,
               applied: list[str]) -> None:
    for key, value in patch.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            deep_merge(base[key], value, path, applied)
        else:
            base[key] = value
            applied.append(path)


def build_actor(
    slug: str, sheets: list[Sheet], rows: list[dict[str, Any]]
) -> dict[str, Any]:
    sheets = sorted(sheets, key=lambda s: s.rel)
    primary = sheets[0]

    baseline = primary.comparable()
    for other in sheets[1:]:
        diff = {
            k: (v, other.comparable()[k])
            for k, v in baseline.items()
            if other.comparable()[k] != v
        }
        if diff:
            raise BuildError(
                f"{slug}: markdown sources disagree — {primary.rel} vs {other.rel}: "
                + "; ".join(f"{k}: {a!r} != {b!r}" for k, (a, b) in diff.items())
            )

    override = load_override(slug)
    applied: list[str] = []
    item_overrides = override.pop("items", {}) or {}

    size = "med"
    notes = ["abilities-omitted: no ability scores in source markdown"]
    names = sorted({s.name for s in sheets})
    if len(names) > 1:
        notes.append(
            "name-variants: " + ", ".join(names) + " — using the primarySource name"
        )

    system: dict[str, Any] = {
        "attributes": {
            "hp": {
                "value": primary.hp_max,
                "max": primary.hp_max,
                "temp": 0,
                "tempmax": 0,
                "formula": primary.hp_formula,
            },
            "ac": {"calc": "flat", "flat": primary.ac_flat},
            "init": {"bonus": ""},
            "movement": {
                **{m: primary.movement[m] for m in MOVEMENT_TYPES},
                "hover": primary.hover,
                "units": "ft",
            },
            "senses": {
                "ranges": {s: primary.senses[s] for s in SENSES},
                "units": "ft",
                "special": "",
            },
        },
        "details": {
            "cr": primary.cr,
            "type": {
                "value": primary.creature_type,
                "subtype": "",
                "swarm": "",
                "custom": "",
            },
            "biography": {"value": primary.biography, "public": ""},
        },
        "traits": {
            "size": size,
            "di": {"value": primary.di, "bypasses": [],
                   "custom": primary.trait_custom["di"]},
            "dr": {"value": primary.dr, "bypasses": [],
                   "custom": primary.trait_custom["dr"]},
            "dv": {"value": primary.dv, "bypasses": [],
                   "custom": primary.trait_custom["dv"]},
            "ci": {"value": primary.ci, "custom": primary.trait_custom["ci"]},
        },
    }
    if abilities := override.pop("abilities", None):
        system["abilities"] = abilities
        applied.append("abilities")
        notes = [n for n in notes if not n.startswith("abilities-omitted")]

    proto_override = override.pop("prototypeToken", {}) or {}
    deep_merge(system, override, "", applied)

    if system["traits"]["size"] not in ACTOR_SIZES:
        raise BuildError(f"{slug}: {system['traits']['size']!r} is not a dnd5e size")

    sight_range = max(
        (v for v in system["attributes"]["senses"]["ranges"].values() if v), default=0
    )
    token_size = SIZE_TO_TOKEN[system["traits"]["size"]]
    proto: dict[str, Any] = {
        "name": primary.name,
        "displayName": 20,
        "displayBars": 40,
        "actorLink": False,
        "disposition": -1,
        "width": token_size,
        "height": token_size,
        "bar1": {"attribute": "attributes.hp"},
        "bar2": {"attribute": None},
        "sight": {"enabled": True, "range": sight_range, "visionMode": "basic"},
        "lockRotation": True,
        "appendNumber": True,
        "prependAdjective": False,
    }
    deep_merge(proto, proto_override, "prototypeToken", applied)

    items: list[dict[str, Any]] = []
    expected_items: list[dict[str, Any]] = []
    for row in sorted(rows, key=lambda r: r["action"]):
        builder = ItemBuilder(row, item_overrides.get(row["action"], {}) or {})
        items.append(builder.build())
        if builder.assertions or builder.item_labels:
            entry: dict[str, Any] = {
                "action": row["action"],
                "itemType": items[-1]["type"],
            }
            if builder.item_labels:
                entry["itemLabels"] = builder.item_labels
            entry["activities"] = builder.assertions
            expected_items.append(entry)
        if row["action"] in item_overrides:
            applied.append(f"items.{row['action']}")

    actor: dict[str, Any] = {
        "name": primary.name,
        "type": "npc",
        "system": system,
        "prototypeToken": proto,
        "items": items,
        "flags": {
            "pentaryn": {
                "slug": slug,
                "contentHash": "",
                "sources": [s.rel for s in sheets],
                "primarySource": primary.rel,
                "encounters": sorted({s.encounter for s in sheets}),
                "acNote": primary.ac_note,
                "skillNotes": primary.skill_notes,
                "notes": notes,
                "unmapped": primary.unmapped,
                "overridesApplied": sorted(set(applied)),
            }
        },
        "expected": {
            "actor": {
                "system.attributes.hp.max": system["attributes"]["hp"]["max"],
                "system.attributes.ac.value": system["attributes"]["ac"]["flat"],
                "system.details.cr": system["details"]["cr"],
                "system.details.type.value": system["details"]["type"]["value"],
                "system.traits.size": system["traits"]["size"],
                "prototypeToken.disposition": -1,
                "prototypeToken.displayBars": 40,
                "prototypeToken.actorLink": False,
                "prototypeToken.bar1.attribute": "attributes.hp",
                "prototypeToken.sight.enabled": True,
                "prototypeToken.width": token_size,
            },
            "items": expected_items,
        },
    }
    actor["flags"]["pentaryn"]["contentHash"] = content_hash(actor)
    return actor


def content_hash(actor: dict[str, Any]) -> str:
    """CONTRACT §9.3 — the generator is the sole producer of this token."""
    payload = copy.deepcopy(actor)
    payload.pop("expected", None)
    payload.get("flags", {}).get("pentaryn", {}).pop("contentHash", None)
    canonical = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(canonical).hexdigest()


# ---------------------------------------------------------------------------
# Lint
# ---------------------------------------------------------------------------


def walk_strings(node: Any, path: str = "") -> Iterable[tuple[str, str]]:
    if isinstance(node, dict):
        for key, value in node.items():
            yield from walk_strings(value, f"{path}.{key}" if path else str(key))
    elif isinstance(node, list):
        for value in node:
            yield from walk_strings(value, f"{path}.[]")
    elif isinstance(node, str):
        yield path, node


def lint_formulas(actor: dict[str, Any]) -> None:
    """Every FormulaField must be literal dice/arithmetic — no `@refs`.

    dnd5e's validator swaps `@terms` for 1, so a typo passes validation and then
    evaluates to 0 at the table. An empty whitelist is the only one that cannot
    be wrong, and everything we emit is pre-computed.
    """
    slug = actor["flags"]["pentaryn"]["slug"]
    for path, value in walk_strings(actor):
        normalised = re.sub(r"\.activities\.[A-Za-z0-9]{16}\.", ".activities.*.", path)
        if not normalised.endswith(FORMULA_SUFFIXES):
            continue
        if not FORMULA_OK.fullmatch(value):
            raise BuildError(
                f"{slug}: formula field {path} = {value!r} is not a literal "
                f"dice/arithmetic expression (allowed refs: "
                f"{sorted(ALLOWED_REFS) or 'none'})"
            )


def lint_activity_ids(actors: list[dict[str, Any]]) -> None:
    seen: dict[str, str] = {}
    for actor in actors:
        slug = actor["flags"]["pentaryn"]["slug"]
        for item in actor["items"]:
            for aid, activity in item["system"]["activities"].items():
                where = f"{slug}/{item['flags']['pentaryn']['action']}"
                if not VALID_ID.fullmatch(aid):
                    raise BuildError(f"{where}: activity id {aid!r} is not 16 chars")
                if activity["_id"] != aid:
                    raise BuildError(f"{where}: activity _id != map key ({aid})")
                if aid in seen:
                    raise BuildError(
                        f"activity id collision {aid}: {seen[aid]} and {where}"
                    )
                seen[aid] = where


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def source_revision() -> str:
    def git(*args: str) -> str:
        return subprocess.run(
            ["git", *args], cwd=REPO_ROOT, capture_output=True, text=True, check=False
        ).stdout.strip()

    rev = git("rev-parse", "--short", "HEAD") or "unknown"
    return f"{rev}-dirty" if git("status", "--porcelain") else rev


def build(generated_at: str | None) -> tuple[dict[str, Any], list[str]]:
    rows = [
        json.loads(line)
        for line in ACTIONS_DB.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    sheets_by_slug = discover_sheets()
    pcs = pc_slugs()

    skipped: list[dict[str, Any]] = []
    rows_by_slug: dict[str, list[dict[str, Any]]] = {}
    warnings: list[str] = []

    for row in rows:
        slug = row["npc"]
        base = {"npc": slug, "action": row["action"], "type": row["type"]}
        if row.get("scope") == "global" or slug == "_global":
            skipped.append(
                {**base, "reason": "srd-universal-action",
                 "detail": "scope=global; core 5e action already provided by "
                           "Foundry/dnd5e"}
            )
        elif slug in pcs:
            skipped.append(
                {**base, "reason": "pc-not-npc",
                 "detail": f"{slug} is a player character under {PARTY_PREFIX}"}
            )
        elif slug not in sheets_by_slug:
            skipped.append(
                {**base, "reason": "no-markdown-source",
                 "detail": f"no #combat-runner markdown for slug {slug!r}"}
            )
            warnings.append(f"no #combat-runner markdown for slug {slug!r}")
        else:
            rows_by_slug.setdefault(slug, []).append(row)

    actors = [
        build_actor(slug, sheets_by_slug[slug], rows_by_slug[slug])
        for slug in sorted(rows_by_slug)
    ]

    for actor in actors:
        lint_formulas(actor)
    lint_activity_ids(actors)

    emitted = sum(len(a["items"]) for a in actors)
    if emitted + len(skipped) != len(rows):
        raise BuildError(
            f"coverage: {len(rows)} rows != {emitted} items + {len(skipped)} skips"
        )

    now = generated_at or dt.datetime.now(dt.timezone.utc).isoformat(
        timespec="seconds"
    )
    manifest = {
        "$contract": CONTRACT,
        "generator": GENERATOR,
        "generatorVersion": GENERATOR_VERSION,
        "targetSystem": TARGET_SYSTEM,
        "targetSystemVersion": TARGET_SYSTEM_VERSION,
        "generation": GENERATION,
        "generatedAt": now,
        "sourceRevision": source_revision(),
        "skipped": skipped,
        "actors": actors,
    }
    return manifest, warnings


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--out",
        type=Path,
        default=REPO_ROOT / "foundry/build/actors.json",
        help="output path (default: foundry/build/actors.json)",
    )
    ap.add_argument(
        "--generated-at",
        help="pin the manifest timestamp (RFC 3339) so output is byte-stable",
    )
    args = ap.parse_args()

    try:
        manifest, warnings = build(args.generated_at)
    except BuildError as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    actors = manifest["actors"]
    emitted = sum(len(a["items"]) for a in actors)
    reasons: dict[str, int] = {}
    for skip in manifest["skipped"]:
        reasons[skip["reason"]] = reasons.get(skip["reason"], 0) + 1

    out = args.out.resolve()
    rel = out.relative_to(REPO_ROOT) if out.is_relative_to(REPO_ROOT) else out
    print(f"  out     : {rel}")
    print(f"  actors  : {len(actors)}")
    print(f"  mapped  : {emitted} items")
    print(f"  skipped : {len(manifest['skipped'])} rows")
    for reason, count in sorted(reasons.items()):
        print(f"            {count:>3}  {reason}")
    total = emitted + len(manifest["skipped"])
    print(f"  coverage: {total} rows = {emitted} items + {len(manifest['skipped'])} skips")
    for warning in warnings:
        print(f"  ⚠ {warning}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
