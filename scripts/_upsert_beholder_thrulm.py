#!/usr/bin/env python3
"""One-shot script: author all combat actions for beholder-thrulm.

Run: python scripts/_upsert_beholder_thrulm.py
Safe to re-run (upserts are idempotent).
All attack/damage bonuses include Void-Feeding +1 (always active in shrine chamber).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from combat_actions_db import upsert

NPC = "beholder-thrulm"

actions = [
    # ── MULTIATTACK ──────────────────────────────────────────────────────────
    (
        "multiattack",
        {
            "type": "multiattack",
            "verbs": ["attack", "hit", "melee", "multiattack", "lash", "maw", "tentacle"],
            "narration": "The hollow sphere surges forward — two bone-white roots snap out to grip and drag, then the void-gap opens wide.",
            "attacks": [
                {
                    "name": "Tentacle Lash 1",
                    "to_hit_bonus": 7,
                    "damage": "3d6",
                    "damage_modifier": 4,
                    "damage_type": "bludgeoning",
                    "rider_on_hit": "DC 16 Str save or grappled (escape DC 16); beholder has 4 tentacles — up to 4 simultaneous grapples",
                },
                {
                    "name": "Tentacle Lash 2",
                    "to_hit_bonus": 7,
                    "damage": "3d6",
                    "damage_modifier": 4,
                    "damage_type": "bludgeoning",
                    "rider_on_hit": "DC 16 Str save or grappled (escape DC 16)",
                },
                {
                    "name": "Maw",
                    "to_hit_bonus": 7,
                    "damage": "4d8",
                    "damage_modifier": 4,
                    "damage_type": "piercing",
                    "rider_on_hit": "if target is grappled by the beholder, it has disadvantage on all saving throws this turn",
                },
            ],
        },
    ),
    # ── TENTACLE LASH (standalone — legendary action: Tentacle) ──────────────
    (
        "tentacle_lash",
        {
            "type": "single_attack",
            "verbs": ["tentacle", "lash", "grab", "reach", "grapple"],
            "narration": "A bone-white root snaps across the stone toward its target.",
            "attacks": [
                {
                    "name": "Tentacle Lash",
                    "to_hit_bonus": 7,
                    "damage": "3d6",
                    "damage_modifier": 4,
                    "damage_type": "bludgeoning",
                    "rider_on_hit": "DC 16 Str save or grappled (escape DC 16); up to 4 tentacles active simultaneously",
                }
            ],
        },
    ),
    # ── MAW (standalone — if DM wants to use it alone) ───────────────────────
    (
        "maw",
        {
            "type": "single_attack",
            "verbs": ["maw", "bite", "crush", "devour"],
            "narration": "The void-gap yawns open — there is a sound like silence being torn.",
            "attacks": [
                {
                    "name": "Maw",
                    "to_hit_bonus": 7,
                    "damage": "4d8",
                    "damage_modifier": 4,
                    "damage_type": "piercing",
                    "rider_on_hit": "if target is currently grappled by the beholder, it has disadvantage on all saving throws this turn",
                }
            ],
        },
    ),
    # ── DISINTEGRATION RAY (recharge 5–6) ────────────────────────────────────
    (
        "disintegration_ray",
        {
            "type": "single_attack",
            "verbs": ["ray", "disintegrate", "disintegration", "blast"],
            "range": "120 ft",
            "recharge": 5,
            "narration": "The void-gap widens — a beam of absolute nothingness lances across the chamber.",
            "attacks": [
                {
                    "name": "Disintegration Ray",
                    "to_hit_bonus": 7,
                    "damage": "10d8",
                    "damage_modifier": 1,
                    "damage_type": "force",
                    "rider_on_hit": "if reduced to 0 HP: disintegrated (ash); can only be restored by true resurrection or wish",
                }
            ],
        },
    ),
    # ── VOID SCREAM (recharge 6) ─────────────────────────────────────────────
    (
        "void_scream",
        {
            "type": "area",
            "verbs": ["scream", "wail", "void", "psychic", "shriek", "void scream"],
            "area": "30-ft radius centered on beholder",
            "recharge": 6,
            "narration": "Reality contracts around the creature — a sound that is not sound shears through every mind in range.",
            "damage": {"dice": "6d10", "type": "psychic"},
            "save": {
                "dc": 16,
                "ability": "Wis",
                "on_save": "half — note: creatures within 10 ft of the shrine have disadvantage on this save",
            },
        },
    ),
    # ── SHRINE-DRIFT (bonus action: movement) ────────────────────────────────
    (
        "shrine_drift",
        {
            "type": "utility",
            "verbs": ["drift", "hover", "phase", "shift", "move through"],
            "narration": "The sphere blurs through stone and flesh as if neither quite exists yet.",
            "effect": "BONUS ACTION: Move up to 30 ft., passing through creatures and objects as difficult terrain. Takes 1d10 force damage if it ends its turn inside a creature or object.",
        },
    ),
    # ── COMPEL THRALL (bonus action, 1/turn) ─────────────────────────────────
    (
        "compel_thrall",
        {
            "type": "utility",
            "verbs": ["compel", "command", "thrall", "dominate", "direct"],
            "prerequisite": "Must have at least one creature charmed by the beholder within 60 ft.",
            "narration": "A telepathic pulse — the thrall's head snaps toward the designated target.",
            "effect": "BONUS ACTION (1/turn): One charmed creature within 60 ft. must succeed on DC 16 Cha save or immediately move 30 ft. toward the beholder or a target it designates.",
        },
    ),
    # ── ANTIREALITY (reaction: buff) ─────────────────────────────────────────
    (
        "antireality",
        {
            "type": "reaction",
            "verbs": [],
            "reaction_kind": "buff",
            "trigger": {
                "scope": "self",
                "event": "damage",
                "match": "hit by an attack the beholder can see",
            },
            "narration": "The stone beneath the beholder ripples as if underwater — the attack slides across bent space.",
            "effect": "REACTION: Gain +2 AC against the triggering attack (declared after seeing the attack roll, before damage). Once per round.",
        },
    ),
    # ── VOID RAY (legendary action, costs 2) ─────────────────────────────────
    (
        "void_ray",
        {
            "type": "area",
            "verbs": ["void ray", "lray", "legendary ray", "force ray"],
            "area": "one target within 120 ft — LEGENDARY ACTION (costs 2 legendary actions)",
            "narration": "LEGENDARY (costs 2): The creature singles out one target — a ripple of warped force collapses toward it.",
            "damage": {"dice": "4d10", "type": "force"},
            "save": {"dc": 16, "ability": "Dex", "on_save": "half"},
        },
    ),
    # ── DRAIN DIVINITY (legendary action, costs 3) ───────────────────────────
    (
        "drain_divinity",
        {
            "type": "utility",
            "verbs": ["drain", "drain divinity", "divinity", "leech"],
            "prerequisite": "Target within 30 ft must have spell slots, divine favor, or clerical powers.",
            "narration": "LEGENDARY (costs 3): The void-gap turns toward the holy — and drinks.",
            "effect": "LEGENDARY ACTION (costs 3): DC 16 Cha save; on fail, target loses one spell slot of the highest level remaining (or one use of a divine ability if no spells). Beholder gains temporary HP equal to twice the spell level lost.",
        },
    ),
    # ── LAIR: UNSTABLE GROUND (initiative count 20) ──────────────────────────
    (
        "unstable_ground",
        {
            "type": "utility",
            "verbs": ["ground", "quake", "buckle", "lair ground"],
            "narration": "LAIR ACTION: The chamber floor warps — stone buckles under chosen feet.",
            "effect": "LAIR ACTION (init 20): One creature the beholder can see within 60 ft. must succeed on DC 16 Dex save or fall prone as the stone beneath it collapses.",
        },
    ),
    # ── LAIR: MANIFEST THRALLS (initiative count 20) ─────────────────────────
    (
        "manifest_thralls",
        {
            "type": "utility",
            "verbs": ["thralls", "manifest", "buff thralls", "lair thrall"],
            "narration": "LAIR ACTION: The charmed derro jerk upright, limbs flooding with stolen vitality.",
            "effect": "LAIR ACTION (init 20): Up to 3 derro charmed by the beholder within 60 ft. gain 1 temporary HP and may each use their reaction to move up to their speed or make one weapon attack.",
        },
    ),
    # ── LAIR: VOID ERUPTION (initiative count 20) ────────────────────────────
    (
        "void_eruption",
        {
            "type": "area",
            "verbs": ["eruption", "void eruption", "shrine blast", "lair blast"],
            "area": "20-ft radius centered on the shrine altar — LAIR ACTION (init 20)",
            "narration": "LAIR ACTION: The sealed shrine vomits void-energy in a crackling ring.",
            "damage": {"dice": "2d10", "type": "force"},
            "save": {"dc": 16, "ability": "Dex", "on_save": "half"},
        },
    ),
]

ok = 0
failed = 0
for action_name, spec in actions:
    try:
        upsert(NPC, action_name, spec)
        print(f"  ok  {action_name}")
        ok += 1
    except ValueError as e:
        print(f"  FAIL {action_name}: {e}", file=sys.stderr)
        failed += 1

print(f"\n{ok} ok, {failed} failed")
sys.exit(1 if failed else 0)
