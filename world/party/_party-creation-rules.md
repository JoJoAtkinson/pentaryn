---
created: 2026-01-16
last-modified: 2026-01-16
tags: ["#world", "#party", "#rules", "#character-creation"]
status: active
---
# Party & Member Creation Rules

These are **setting-consistency** rules for creating parties and party members. They are defaults, not handcuffs:
break them when you want, but record *why* in the party file so future-you (and the LLM) can stay consistent.

## LLM-Readable Rules (YAML)

```yaml
party_rules:
  intent: "Keep parties setting-consistent; allow exceptions with justification."

  rarity_scale:
    common: "Expected to appear frequently."
    uncommon: "Exists, but not the default."
    rare: "Requires a clear reason and an Exception Note."
    very_rare: "Only with explicit DM intent; document the exception."

  defaults:
    # High-level composition bias for new parties.
    composition_bias:
      human: common
      dwarf: common
      gnome: uncommon
      halfling: uncommon
      orc: uncommon
      elf: rare

    # Minimum fields to track for each member in a party roster row.
    required_member_fields:
      - name
      - ancestry
      - origin
      - class
      - level
      - alignment
      - background
      - role
      - status
      - link

    # If a choice falls into these buckets, add an Exception Note to the party doc.
    exception_required_when:
      - rarity in [rare, very_rare]
      - origin in [araethilion, calderon-imperium, rakthok-horde]

  # Origin guidance by ancestry (slugs match `world/factions/<slug>/`).
  origin_by_ancestry:
    human:
      common: [ardenhaven, merrowgate, elderholt]
      uncommon: [garhammar-trade-league]
      rare: [calderon-imperium]
    dwarf:
      common: [dulgarum-oathholds, garhammar-trade-league]
    gnome:
      common: [ardenhaven, merrowgate]
    halfling:
      common: [ardenhaven, merrowgate]
    orc:
      common: [garrok-confederation]
      rare: [rakthok-horde]
    elf:
      very_rare: [araethilion]

  # Setting-specific "rare/very_rare" origins need a travel justification.
  origin_rules:
    araethilion:
      typical_ancestry: elf
      leaving_realm: very_rare
      allowed_outsider_reasons:
        - "exile enclave (dissident / seer)"
        - "controlled envoy on a specific mission"
        - "escaped Severance / persecution"
        - "runner carrying forbidden prophecy"
      note: "Araethilion is insular; elves abroad are usually exiles or agents."
    calderon-imperium:
      typical_ancestry: human
      leaving_realm: rare
      allowed_outsider_reasons:
        - "defector / dissident"
        - "licensed merchant / courier"
        - "military on leave / mission"
        - "exile / fugitive"
      note: "Most Imperium citizens prefer safety and structure; independent wanderers are uncommon."
    rakthok-horde:
      typical_ancestry: orc
      leaving_realm: rare
      allowed_outsider_reasons:
        - "spirit-seeker on a vision quest"
        - "emissary under truce"
        - "outcast / oath-breaker"
        - "captured, then freed"
      note: "Politics and paranoia make Rakthoki orcs abroad unusual."
```

## Defaults (Human-Readable)

### Party Composition (Guideline)

- Default to a **mostly human** party.
- Dwarves and gnomes are normal additions.
- Orcs are possible, but treat **Rakthoki (eastern)** origins as uncommon-to-rare for political reasons.
- Elves from **Araethilion** are **very rare** outside their lands; they should almost always come with a story reason.

### Alignment Tracking

- Track alignment for every member in the roster.
- Optional: track a **party ethos** (what the group tends to do, regardless of individuals).

### Exception Notes (Required For Rare Origins)

If you include any of the following, add a short **Exception Note** in the party’s `_overview.md`:

- Elf from [Araethilion](../factions/araethilion/_overview.md)
- Human from [Calderon Imperium](../factions/calderon-imperium/_overview.md)
- Orc from [Rakthok Horde](../factions/rakthok-horde/_overview.md)

## Sources (Setting Canon Links)

- Elves: [Araethilion](../factions/araethilion/_overview.md)
- Empire: [Calderon Imperium](../factions/calderon-imperium/_overview.md)
- Western orcs: [Garrok Confederation](../factions/garrok-confederation/_overview.md)
- Eastern orcs: [Rakthok Horde](../factions/rakthok-horde/_overview.md)
