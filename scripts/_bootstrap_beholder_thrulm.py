#!/usr/bin/env python3
"""Bootstrap: upsert all combat-runner actions for beholder-thrulm.

Run once from repo root:
    python3 scripts/_bootstrap_beholder_thrulm.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from combat_actions_db import upsert, validate_spec

NPC = "beholder-thrulm"

ACTIONS = [
    # ── main action: multiattack (2× tentacle, 1× maw) ──────────────────────
    ("multiattack", {
        "type": "multiattack",
        "verbs": ["attack", "hit", "multiattack", "tentacle", "maw", "melee", "strike"],
        "narration": "The void-thing lashes with two root-like tentacles then lunges its gap of a maw.",
        "attacks": [
            {
                "name": "Tentacle Lash 1",
                "to_hit_bonus": 6,
                "damage": "3d6",
                "damage_modifier": 3,
                "damage_type": "bludgeoning",
                "rider_on_hit": "Target is grappled (escape DC 16). Up to 4 grappled at once.",
            },
            {
                "name": "Tentacle Lash 2",
                "to_hit_bonus": 6,
                "damage": "3d6",
                "damage_modifier": 3,
                "damage_type": "bludgeoning",
                "rider_on_hit": "Target is grappled (escape DC 16). Up to 4 grappled at once.",
            },
            {
                "name": "Maw",
                "to_hit_bonus": 6,
                "damage": "4d8",
                "damage_modifier": 3,
                "damage_type": "piercing",
            },
        ],
    }),

    # ── tentacle_lash: single attack (used by legendary action 'Tentacle') ──
    ("tentacle_lash", {
        "type": "single_attack",
        "verbs": ["tentacle", "lash", "grab", "snag"],
        "narration": "A root-like appendage whips out, seeking to bind.",
        "attacks": [
            {
                "name": "Tentacle Lash",
                "to_hit_bonus": 6,
                "damage": "3d6",
                "damage_modifier": 3,
                "damage_type": "bludgeoning",
                "rider_on_hit": "Target is grappled (escape DC 16). Up to 4 grappled at once.",
            },
        ],
    }),

    # ── disintegration_ray: ranged spell attack, recharge 5-6 ────────────────
    ("disintegration_ray", {
        "type": "single_attack",
        "verbs": ["disintegrate", "ray", "dissolve", "obliterate", "zap"],
        "narration": "A column of anti-reality strikes out from the void-mouth. What it touches ceases.",
        "recharge": 5,
        "attacks": [
            {
                "name": "Disintegration Ray",
                "to_hit_bonus": 6,
                "damage": "10d8",
                "damage_modifier": 0,
                "damage_type": "force",
                "rider_on_hit": (
                    "If this reduces target to 0 HP, they are DISINTEGRATED (turned to ash). "
                    "Cannot be raised except by true resurrection or wish."
                ),
            },
        ],
    }),

    # ── void_scream: area, recharge 6 ───────────────────────────────────────
    ("void_scream", {
        "type": "area",
        "verbs": ["scream", "wail", "void scream", "shriek", "psychic blast", "howl"],
        "narration": "A piercing non-sound wrenches reality. Those near the shrine hear it in their bones.",
        "area": "30-ft radius",
        "recharge": 6,
        "damage": {"dice": "6d10", "type": "psychic"},
        "save": {"dc": 16, "ability": "Wis", "on_save": "half"},
        "rider": "Creatures within 10 ft of the shrine have disadvantage on this save.",
    }),

    # ── void_ray: save-based, legendary action (costs 2) ────────────────────
    ("void_ray", {
        "type": "area",
        "verbs": ["void ray", "force bolt", "force ray", "legendary ray"],
        "narration": "Space folds around a target — a bubble of un-existence collapses inward.",
        "area": "one target (120-ft range)",
        "damage": {"dice": "4d10", "type": "force"},
        "save": {"dc": 16, "ability": "Dex", "on_save": "half"},
        "prerequisite": "Legendary action — costs 2 legendary action uses.",
    }),

    # ── drain_divinity: legendary action (costs 3) ──────────────────────────
    ("drain_divinity", {
        "type": "utility",
        "verbs": ["drain", "drain divinity", "devour magic", "drain spell", "eat spell"],
        "narration": "The void pulls. Sanctified energy tears away and feeds the absence.",
        "effect": (
            "One creature within 30 ft that has spell slots, divine favor, or clerical powers. "
            "DC 16 Cha save. On failure: loses one spell slot of the highest level remaining "
            "(or one divine ability use if no spells). Beholder gains temp HP = 2× slot level lost. "
            "Legendary action — costs 3 legendary action uses."
        ),
    }),

    # ── legendary_resistance: slot-tracked, 3/day ───────────────────────────
    ("legendary_resistance", {
        "type": "utility",
        "verbs": ["legendary resistance", "resist", "resist save", "refuse save", "auto succeed"],
        "narration": "The stone beneath the void-thing cracks and scars as it simply refuses failure.",
        "effect": "Choose to succeed on a failed saving throw. 3/day.",
        "slots": {"count": 3, "refresh": "long_rest"},
    }),

    # ── antireality: reaction (buff) ─────────────────────────────────────────
    ("antireality", {
        "type": "reaction",
        "reaction_kind": "buff",
        "verbs": ["antireality", "reality shift", "deflect", "phase"],
        "narration": "The stone ripples like water. The blow bends slightly.",
        "trigger": {
            "scope": "self",
            "event": "damage",
            "match": "any attack the beholder can see",
        },
        "effect": "+2 AC against the triggering attack (declared after seeing the attack roll).",
    }),

    # ── unstable_ground: lair action (utility) ───────────────────────────────
    ("unstable_ground", {
        "type": "utility",
        "verbs": ["unstable ground", "ground buckle", "floor buckle", "lair buckle"],
        "narration": "The shrine-stone buckles. One creature loses its footing.",
        "effect": (
            "Lair action (init 20). One creature the beholder can see within 60 ft: "
            "DC 16 Dex save or fall prone."
        ),
    }),

    # ── manifest_thralls: lair action (utility) ──────────────────────────────
    ("manifest_thralls", {
        "type": "utility",
        "verbs": ["manifest thralls", "thralls", "derro surge", "thrall boost", "rally derro"],
        "narration": "The beholder's will floods the derro. They surge forward with borrowed purpose.",
        "effect": (
            "Lair action (init 20). Up to 3 charmed derro within 60 ft gain temp HP = "
            "beholder's Cha modifier (min 1, currently +1). Each can immediately use their "
            "reaction to move or make one weapon attack."
        ),
    }),

    # ── void_eruption: lair action (area) ────────────────────────────────────
    ("void_eruption", {
        "type": "area",
        "verbs": ["void eruption", "shrine eruption", "eruption", "altar burst", "lair eruption"],
        "narration": "The sealed god's absence pulses. Force ripples outward from the altar.",
        "area": "20-ft radius (shrine center)",
        "damage": {"dice": "2d10", "type": "force"},
        "save": {"dc": 16, "ability": "Dex", "on_save": "no damage"},
        "prerequisite": "Lair action (init 20). Only while in the chamber containing the shrine.",
    }),

    # ── shrine_drift: bonus action (move) ────────────────────────────────────
    ("shrine_drift", {
        "type": "utility",
        "verbs": ["drift", "shrine drift", "phase move", "pass through", "ethereal move"],
        "narration": "The void-thing drifts, passing through matter like smoke through cloth.",
        "effect": (
            "Bonus action. Move up to 30 ft. Can move through creatures and objects (difficult terrain). "
            "Takes 5 (1d10) force damage if it ends its turn inside a creature or object."
        ),
    }),

    # ── compel_thrall: bonus action, 1/turn ───────────────────────────────────
    ("compel_thrall", {
        "type": "utility",
        "verbs": ["compel", "compel thrall", "command thrall", "direct derro", "puppet"],
        "narration": "The beholder's hunger flows through the bond. A thrall lurches toward its target.",
        "effect": (
            "Bonus action, 1/turn. Target one charmed creature the beholder can see within 60 ft. "
            "DC 16 Cha save or the target moves up to 30 ft toward the beholder or a designated target."
        ),
    }),
]


def main():
    print(f"Upserting {len(ACTIONS)} actions for {NPC!r}...")
    errors_found = []
    for action_name, spec in ACTIONS:
        errs = validate_spec(spec)
        if errs:
            errors_found.append((action_name, errs))
            print(f"  INVALID {action_name}: {errs}")
        else:
            result = upsert(NPC, action_name, spec)
            print(f"  ok  {action_name} ({spec['type']})")
    if errors_found:
        print(f"\n{len(errors_found)} action(s) failed validation — NOT written to DB.")
        sys.exit(1)
    print(f"\nDone. {len(ACTIONS)} actions upserted for {NPC!r}.")


if __name__ == "__main__":
    main()
