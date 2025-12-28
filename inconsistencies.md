# Lore Inconsistency Report

- Generated: 2025-12-28T17:48:09.531696+00:00
- Repo: `/Users/joe/GitHub/dnd`
- Files scanned: 107
- Chroma persist dir: `.output/chroma`
- Chroma collection: `dnd_vault_hash_512`
- Embeddings: `hash`
- LLM: `openai` (`gpt-5.2`)
- Entities audited: 50

## Summary

- Candidate conflicts: 25
- Runtime: 0:07:58

## Conflicts

### Aeralithil (AIR-ah-LITH-il) — `point_of_interest`

- **The Veiled Court — the inner rings of proximity, where access is power** — [world/factions/araethilion/locations/aeralithil.md#L19](world/factions/araethilion/locations/aeralithil.md#L19)
  > --- created: 2025-12-07...
- **Lifebloom Hall — where the Silver Thread is bound in intimate rite** — [world/factions/araethilion/locations/aeralithil.md#L19](world/factions/araethilion/locations/aeralithil.md#L19)
  > --- created: 2025-12-07...
- **Whisper Galleries — dissident circles trading rumors of exile, Severance, and forgotten names** — [world/factions/araethilion/locations/aeralithil.md#L19](world/factions/araethilion/locations/aeralithil.md#L19)
  > --- created: 2025-12-07...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: All three candidate values read like distinct named sub-locations or features within Aeralithil rather than mutually exclusive single identifiers. Nothing in the provided claims indicates that Aeralithil can only have one point_of_interest, nor that these names refer to the same thing. They can be compatible as multiple points of interest associated with the same entity.
- followup: Check the cited section (world/factions/araethilion/locations/aeralithil.md#L19) to see whether it presents these as a list of multiple points of interest, or as alternative names for a single place. If the schema expects only one point_of_interest, decide whether to (a) convert to a list/multi-valued field, or (b) select the primary/most central POI and move the others to a secondary field (e.g., sublocations/landmarks).

### Araethilion — Veiled Crown Theocracy — `artifact`

- **The Veiled Crown itself** — [world/factions/araethilion/_overview.md#L134](world/factions/araethilion/_overview.md#L134)
  > # Araethilion — Veiled Crown Theocracy...
- **Lifelume Arbors (ritual foci)** — [world/factions/araethilion/_overview.md#L134](world/factions/araethilion/_overview.md#L134)
  > # Araethilion — Veiled Crown Theocracy...
- **Whisper Stones (communication relics)** — [world/factions/araethilion/_overview.md#L134](world/factions/araethilion/_overview.md#L134)
  > # Araethilion — Veiled Crown Theocracy...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: V1–V3 list different artifacts associated with Araethilion — Veiled Crown Theocracy: the Veiled Crown itself, Lifelume Arbors (ritual foci), and Whisper Stones (communication relics). As stated, these are not mutually exclusive; an entity can possess or be defined by multiple artifacts. The single shared citation does not indicate exclusivity (e.g., 'the artifact is X' or 'only one artifact'), different time periods, or that these are alternative names for the same object, so there is insufficient evidence of contradiction.
- followup: Check the cited line(s) in world/factions/araethilion/_overview.md#L134 to see whether the text frames these as (a) a list of notable artifacts (compatible), (b) a single canonical artifact (would require choosing one), or (c) synonyms/alternate titles for one artifact (would require merging). If the attribute is intended to be single-valued, clarify whether it should store one 'primary artifact' or allow multiple artifacts.

### Araethilion — Veiled Crown Theocracy — `current_project`

- **Expanding Lifelume Groves to sustain growing population** — [world/factions/araethilion/_overview.md#L194](world/factions/araethilion/_overview.md#L194)
  > # Araethilion — Veiled Crown Theocracy...
- **Containing prophecies from exile enclaves** — [world/factions/araethilion/_overview.md#L194](world/factions/araethilion/_overview.md#L194)
  > # Araethilion — Veiled Crown Theocracy...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: V1 and V2 describe different possible "current_project" focuses (resource/population sustainability vs. information/prophecy containment). As stated, they are not logically mutually exclusive and could be pursued in parallel or represent different facets of a broader agenda. With only a single cited location for both claims, there is insufficient evidence that the text frames them as exclusive alternatives or as competing single-project statements.
- followup: Check the cited section (world/factions/araethilion/_overview.md#L194) to see whether it presents one definitive current project, a list of simultaneous initiatives, or separate time-scoped entries; if it implies exclusivity, split into multiple attributes (e.g., "current_projects") or add time qualifiers.

### Araethilion — Veiled Crown Theocracy — `leader_description`

- **Never seen unmasked** — [world/factions/araethilion/_overview.md#L89](world/factions/araethilion/_overview.md#L89)
  > # Araethilion — Veiled Crown Theocracy...
- **Voice like silver bells** — [world/factions/araethilion/_overview.md#L89](world/factions/araethilion/_overview.md#L89)
  > # Araethilion — Veiled Crown Theocracy...
- **Presence radiates uncanny vitality** — [world/factions/araethilion/_overview.md#L89](world/factions/araethilion/_overview.md#L89)
  > # Araethilion — Veiled Crown Theocracy...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: V1 (never seen unmasked), V2 (voice like silver bells), and V3 (presence radiates uncanny vitality) describe different aspects of the same leader (appearance concealment, vocal quality, and aura/physical presence). None of these claims logically negate the others, and they can all be simultaneously true based on the same cited line.
- followup: Verify in world/factions/araethilion/_overview.md#L89 whether these descriptors are explicitly attributed to the same individual and whether they are presented as literal traits, metaphorical descriptions, or in-universe rumors; if they are rumors, consider tagging them as such in leader_description.

### Araethilion — Veiled Crown Theocracy — `membership_requirement`

- **Birth as an elf of Araethilion** — [world/factions/araethilion/_overview.md#L103](world/factions/araethilion/_overview.md#L103)
  > # Araethilion — Veiled Crown Theocracy...
- **Participation in seasonal blessings** — [world/factions/araethilion/_overview.md#L103](world/factions/araethilion/_overview.md#L103)
  > # Araethilion — Veiled Crown Theocracy...
- **Oaths of service to the Veiled Crown during coming-of-age rites** — [world/factions/araethilion/_overview.md#L103](world/factions/araethilion/_overview.md#L103)
  > # Araethilion — Veiled Crown Theocracy...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: The three candidate values can be read as cumulative or multi-part membership requirements rather than mutually exclusive claims. V1 (birth as an elf of Araethilion), V2 (participation in seasonal blessings), and V3 (oaths of service during coming-of-age rites) do not directly negate one another; they could describe eligibility (V1) plus ongoing religious participation (V2) plus a formal initiation/commitment step (V3). With only a single cited location for all three, there is no evidence they are intended as alternative requirements or that they apply to different membership categories.
- followup: Check the cited passage at world/factions/araethilion/_overview.md#L103 for wording that indicates whether these are all required (e.g., 'must') versus optional/alternative (e.g., 'either/or'), and whether 'membership' refers to the theocracy’s citizenry, clergy, or a specific order within the Veiled Crown.

### Araethilion — Veiled Crown Theocracy — `public_activities`

- **Seasonal festivals** — [world/factions/araethilion/_overview.md#L187](world/factions/araethilion/_overview.md#L187)
  > # Araethilion — Veiled Crown Theocracy...
- **Artisan exports** — [world/factions/araethilion/_overview.md#L187](world/factions/araethilion/_overview.md#L187)
  > # Araethilion — Veiled Crown Theocracy...
- **Healing services** — [world/factions/araethilion/_overview.md#L187](world/factions/araethilion/_overview.md#L187)
  > # Araethilion — Veiled Crown Theocracy...
- **Songwoven diplomatic envoys** — [world/factions/araethilion/_overview.md#L187](world/factions/araethilion/_overview.md#L187)
  > # Araethilion — Veiled Crown Theocracy...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: All four candidate values describe different types of public-facing activities (festivals, exports, services, and diplomatic envoys) and are not mutually exclusive. They are all sourced to the same citation (world/factions/araethilion/_overview.md#L187) and there is no provided evidence that any one of these activities precludes the others, applies to a different time period, or is framed as the only/sole public activity.
- followup: Check world/factions/araethilion/_overview.md#L187 to confirm whether these are presented as a non-exhaustive list of public activities versus an exclusive/contrasting set, and whether any qualifiers (e.g., 'only', 'formerly', 'now banned', 'secretly') introduce temporal or scope constraints.

### Ardenford — `adventure_hook`

- **A vote risks deadlock on rebuilding border defenses.** — [world/factions/ardenhaven/locations/ardenford.md#L24](world/factions/ardenhaven/locations/ardenford.md#L24)
  > --- created: 2025-12-07...
- **Smugglers exploit a war-scarred district’s weak oversight.** — [world/factions/ardenhaven/locations/ardenford.md#L24](world/factions/ardenhaven/locations/ardenford.md#L24)
  > --- created: 2025-12-07...
- **Guild intrigue threatens fair grain prices ahead of winter.** — [world/factions/ardenhaven/locations/ardenford.md#L24](world/factions/ardenhaven/locations/ardenford.md#L24)
  > --- created: 2025-12-07...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: V1 (political deadlock over rebuilding border defenses), V2 (smuggling in a war-scarred district due to weak oversight), and V3 (guild intrigue affecting grain prices) describe different potential problems/adventure hooks in Ardenford. None of the claims negate or exclude the others; they can all be simultaneously true or occur in parallel. The shared citation location does not, by itself, indicate mutual exclusivity or a single canonical hook.
- followup: Check the cited section (world/factions/ardenhaven/locations/ardenford.md#L24) to see whether it presents these as a list of multiple hooks, or as alternative/competing summaries for the same slot. If the intent is to store only one adventure_hook per entity, decide whether to (a) allow multiple hooks, (b) select a primary hook, or (c) add qualifiers (e.g., 'political', 'criminal', 'economic') to store them separately.

### Ardenford — `contains`

- **The crown’s palace** — [world/factions/ardenhaven/locations/ardenford.md#L16](world/factions/ardenhaven/locations/ardenford.md#L16)
  > --- created: 2025-12-07...
- **The Council Hall** — [world/factions/ardenhaven/locations/ardenford.md#L16](world/factions/ardenhaven/locations/ardenford.md#L16)
  > --- created: 2025-12-07...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: The two candidate values describe different things Ardenford contains: V1 says it contains the crown’s palace and V2 says it contains the Council Hall. These are not mutually exclusive; a place can contain both. There is no indication in the provided claims that only one can exist, that they refer to the same structure under different names, or that they apply to different time periods in a way that would exclude the other.
- followup: Check the cited section (world/factions/ardenhaven/locations/ardenford.md#L16) for wording that implies exclusivity (e.g., 'the only major building is...') or identity (e.g., 'the Council Hall, also known as the crown’s palace'). If none, keep both as compatible contained locations.

### Ashenfall — `adventure_hook`

- **A missing ledger ties a noble to infernal pacts.** — [world/factions/calderon-imperium/locations/ashenfall.md#L24](world/factions/calderon-imperium/locations/ashenfall.md#L24)
  > --- created: 2025-12-07...
- **Undead troop movements are masked as “sanitation brigades.”** — [world/factions/calderon-imperium/locations/ashenfall.md#L24](world/factions/calderon-imperium/locations/ashenfall.md#L24)
  > --- created: 2025-12-07...
- **A factory fire exposes a forbidden research wing.** — [world/factions/calderon-imperium/locations/ashenfall.md#L24](world/factions/calderon-imperium/locations/ashenfall.md#L24)
  > --- created: 2025-12-07...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: V1 (missing ledger implicating a noble in infernal pacts), V2 (undead troop movements disguised as “sanitation brigades”), and V3 (factory fire revealing a forbidden research wing) describe three distinct adventure hooks. None of the claims negate or exclude the others; they can all simultaneously be true in Ashenfall, or occur in different incidents/timeframes. With only the single shared citation location (ashenfall.md#L24) and no additional context about exclusivity or chronology, there is insufficient evidence to treat them as contradictory.
- followup: Check the surrounding text in world/factions/calderon-imperium/locations/ashenfall.md around #L24 to see whether these hooks are presented as mutually exclusive options, sequential events, or concurrent rumors, and whether they refer to the same noble/factory/organization (which could introduce timeline or causality constraints).

### Ashenfall — `point_of_interest`

- **Black Throne Court — seat of the Emperor/Empress** — [world/factions/calderon-imperium/locations/ashenfall.md#L19](world/factions/calderon-imperium/locations/ashenfall.md#L19)
  > --- created: 2025-12-07...
- **Census Basilica — bureaucratic nerve center recording every soul** — [world/factions/calderon-imperium/locations/ashenfall.md#L19](world/factions/calderon-imperium/locations/ashenfall.md#L19)
  > --- created: 2025-12-07...
- **Veilwatch — headquarters of the Empire’s clandestine enforcers** — [world/factions/calderon-imperium/locations/ashenfall.md#L19](world/factions/calderon-imperium/locations/ashenfall.md#L19)
  > --- created: 2025-12-07...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: V1, V2, and V3 describe three different points of interest within Ashenfall: a royal/imperial seat (Black Throne Court), a bureaucratic records center (Census Basilica), and a clandestine enforcement headquarters (Veilwatch). Nothing in the provided claims indicates exclusivity (e.g., that Ashenfall can only have one point of interest) or that these are alternate names for the same site, so they are compatible as multiple notable locations in the same city.
- followup: Check the cited section (ashenfall.md#L19) for wording that might imply these are mutually exclusive (e.g., 'the' sole seat/center/HQ) or that any are aliases of each other; if the attribute expects a single value, clarify whether it should be multi-valued or whether one location is the primary point_of_interest.

### Bazgar Dakmar'nak (BAZ-gar DAHK-mar-nak) — `affiliation`

- **Rakthok Horde** — [characters/player-characters/jeff-bazgar.md#L11](characters/player-characters/jeff-bazgar.md#L11)
  > --- created: 2025-12-12...
- **Dakmar'nak Tribe** — [characters/player-characters/jeff-bazgar.md#L11](characters/player-characters/jeff-bazgar.md#L11)
  > --- created: 2025-12-12...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: The two affiliation values are not inherently contradictory: one could be a larger organization (Rakthok Horde) and the other a smaller subgroup/lineage unit (Dakmar'nak Tribe). With only the provided citations (both pointing to the same line), there is insufficient evidence that they are mutually exclusive or refer to the same scope/timeframe in a way that conflicts.
- followup: Check the cited line in characters/player-characters/jeff-bazgar.md#L11 for wording that clarifies relationship (e.g., 'of the Dakmar'nak Tribe within the Rakthok Horde') or exclusivity (e.g., 'formerly'/'left'). If unclear, add a note specifying whether one is a tribe within the horde, or whether one is a past affiliation.

### Goblin Raid on Thornbrook Farm — `investigation_findings`

- **Goblin footprints leading south** — [quests/active/example-goblin-raid.md#L83](quests/active/example-goblin-raid.md#L83)
  > # Goblin Raid on Thornbrook Farm...
- **Torn cloth caught on fence (goblin clothing)** — [quests/active/example-goblin-raid.md#L83](quests/active/example-goblin-raid.md#L83)
  > # Goblin Raid on Thornbrook Farm...
- **Timing of attacks (always near midnight)** — [quests/active/example-goblin-raid.md#L83](quests/active/example-goblin-raid.md#L83)
  > # Goblin Raid on Thornbrook Farm...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: V1 (goblin footprints leading south), V2 (torn goblin cloth caught on a fence), and V3 (attacks always near midnight) describe different types of investigation findings (directional tracks, physical evidence, and temporal pattern). None of these claims negate or exclude the others, so they can all be true simultaneously based on the same incident(s) (quests/active/example-goblin-raid.md#L83).
- followup: Confirm whether these findings are meant to apply to the same raid instance or multiple raids, and whether the 'leading south' direction corresponds to a consistent escape route across the near-midnight attacks (quests/active/example-goblin-raid.md#L83).

### Ironstead — `adventure_hook`

- **A new edict tightens border checks; a diplomat needs a lawful workaround.** — [world/factions/calderon-imperium/locations/ironstead.md#L24](world/factions/calderon-imperium/locations/ironstead.md#L24)
  > --- created: 2025-12-07...
- **The Censorate flags a missing registry block tied to necromantic research.** — [world/factions/calderon-imperium/locations/ironstead.md#L24](world/factions/calderon-imperium/locations/ironstead.md#L24)
  > --- created: 2025-12-07...
- **A legion review uncovers a defecting centurion with evidence of high treason.** — [world/factions/calderon-imperium/locations/ironstead.md#L24](world/factions/calderon-imperium/locations/ironstead.md#L24)
  > --- created: 2025-12-07...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: V1, V2, and V3 describe three different potential adventure hooks in Ironstead: a border-check edict affecting diplomacy (V1), a missing registry block linked to necromantic research flagged by the Censorate (V2), and a legion review revealing a defecting centurion with treason evidence (V3). None of these claims negate or exclude the others, and they can plausibly co-occur or occur in different times without contradiction. The shared citation line does not indicate they are mutually exclusive.
- followup: Check the cited section in ironstead.md#L24 to confirm whether these are presented as separate bullet hooks, alternatives for a single slot, or sequential events, and whether any explicit wording (e.g., 'instead of', 'only one of the following') implies exclusivity or a single canonical hook.

### Ironstead — `description_short`

- **The imperium’s iron seat: straight boulevards, edict basilicas, and parade grounds; open borders under unbending rule.** — [world/factions/calderon-imperium/_overview.md#L115](world/factions/calderon-imperium/_overview.md#L115)
  > # Calderon Imperium — The Iron Imperium...
- **The imperium’s iron seat: lawful, overt power, open borders under unbending rule.** — [world/factions/calderon-imperium/locations/ironstead.md#L8](world/factions/calderon-imperium/locations/ironstead.md#L8)
  > --- created: 2025-12-07...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: V2 appears to be a shortened/abstracted version of V1. Both describe Ironstead as the imperium’s iron seat with open borders under unbending rule; V1 adds concrete civic details (straight boulevards, edict basilicas, parade grounds) while V2 summarizes the same idea as “lawful, overt power.” No statements directly negate each other.
- followup: Confirm whether the short description is intended to include the architectural/civic-detail flavor from V1 or remain a higher-level summary as in V2; if consistency is desired, standardize phrasing across the overview and the location page.

### Ironstead — `point_of_interest`

- **Edict Basilica — where imperial decrees are drafted, sealed, and proclaimed** — [world/factions/calderon-imperium/locations/ironstead.md#L19](world/factions/calderon-imperium/locations/ironstead.md#L19)
  > --- created: 2025-12-07...
- **Legion Parade Grounds — ceremonial field and mustering square for cohorts** — [world/factions/calderon-imperium/locations/ironstead.md#L19](world/factions/calderon-imperium/locations/ironstead.md#L19)
  > --- created: 2025-12-07...
- **Censorate Tower — administrative heart for audits, registrations, and investigations** — [world/factions/calderon-imperium/locations/ironstead.md#L19](world/factions/calderon-imperium/locations/ironstead.md#L19)
  > --- created: 2025-12-07...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: The three candidate values describe different points of interest in Ironstead (Edict Basilica, Legion Parade Grounds, Censorate Tower) with distinct functions. Nothing in the provided claims indicates exclusivity (e.g., that Ironstead has only one point of interest) or that these names refer to the same place. They can all simultaneously be true as separate locations within Ironstead.
- followup: Check the cited source section to confirm whether these are listed as multiple locations/landmarks in Ironstead (and whether the attribute is intended to be multi-valued). If the data model expects a single point_of_interest, decide whether to store them as a list or select a primary landmark.

### Khargun-dur (KHAR-gun-DOOR) — `description_short`

- **Oathforged mountain citadel.** — [world/factions/dulgarum-oathholds/locations/khargun-dur.md#L8](world/factions/dulgarum-oathholds/locations/khargun-dur.md#L8)
  > --- created: 2025-12-07...
- **Oathforged mountain citadel; breachgates and vaults hide the secret war.** — [world/factions/dulgarum-oathholds/_overview.md#L113](world/factions/dulgarum-oathholds/_overview.md#L113)
  > # Dulgarum — The Oathbound Holds...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: V2 appears to be an elaboration of V1 rather than a contradiction: both describe Khargun-dur as an "Oathforged mountain citadel," with V2 adding additional descriptive detail about breachgates, vaults, and a hidden secret war. These can coexist as different levels of specificity for the same short description.
- followup: Confirm whether "breachgates and vaults hide the secret war" is intended as canonical defining flavor for Khargun-dur’s short description (and not a broader Oathholds/overview-only theme). If it is, standardize the short description to include the added clause; if not, keep V1 for brevity and reserve V2’s details for a longer description field.

### Khargun-dur (KHAR-gun-DOOR) — `point_of_interest`

- **Oath Vault — reliquary of binding pacts and clan seals** — [world/factions/dulgarum-oathholds/locations/khargun-dur.md#L19](world/factions/dulgarum-oathholds/locations/khargun-dur.md#L19)
  > --- created: 2025-12-07...
- **Breachgates — armored doors to the deep** — [world/factions/dulgarum-oathholds/locations/khargun-dur.md#L19](world/factions/dulgarum-oathholds/locations/khargun-dur.md#L19)
  > --- created: 2025-12-07...
- **Stoneward Anvils — forgeworks humming with defensive contracts** — [world/factions/dulgarum-oathholds/locations/khargun-dur.md#L19](world/factions/dulgarum-oathholds/locations/khargun-dur.md#L19)
  > --- created: 2025-12-07...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: The three candidate values describe different points of interest within Khargun-dur (an Oath Vault, Breachgates, and Stoneward Anvils). Nothing in the provided claims indicates exclusivity (e.g., that Khargun-dur has only one point of interest) or that any of these names refer to the same feature in incompatible ways. They can be compatible as multiple notable locations/features associated with the same site.
- followup: Check the cited line(s) in world/factions/dulgarum-oathholds/locations/khargun-dur.md#L19 to confirm whether these are listed as multiple points of interest (e.g., a bullet list) versus alternative names for a single feature, and whether the attribute 'point_of_interest' is intended to be single-valued or multi-valued for this entity.

### Session [Number] - [Date] — `has_section`

- **Session Summary** — [templates/session-notes-template.md#L14](templates/session-notes-template.md#L14)
  > # Session [Number] - [Date]...
- **Related Links** — [templates/session-notes-template.md#L120](templates/session-notes-template.md#L120)
  > # Session [Number] - [Date]...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: The two candidate values, "Session Summary" (templates/session-notes-template.md#L14) and "Related Links" (templates/session-notes-template.md#L120), are different section titles and can both be sections within the same Session notes document. Nothing in the provided claims indicates they are mutually exclusive or that only one section can exist for a Session.
- followup: Check the referenced template lines to confirm whether "has_section" is intended to be a multi-valued attribute (listing all sections) or a single-valued attribute (e.g., only the primary section). If single-valued, identify which section is meant to be captured for the Session entity.

### Session [Number] - [Date] — `related_link_label`

- **Previous Session** — [templates/session-notes-template.md#L120](templates/session-notes-template.md#L120)
  > # Session [Number] - [Date]...
- **Next Session** — [templates/session-notes-template.md#L120](templates/session-notes-template.md#L120)
  > # Session [Number] - [Date]...
- **Campaign Home** — [templates/session-notes-template.md#L120](templates/session-notes-template.md#L120)
  > # Session [Number] - [Date]...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: V1 ("Previous Session"), V2 ("Next Session"), and V3 ("Campaign Home") are distinct link labels that can all coexist as separate related-link entries for the same Session entity. The shared source location (templates/session-notes-template.md#L120) suggests they are template-provided labels rather than mutually exclusive single-valued facts. A conflict would only exist if related_link_label is constrained to exactly one value per Session, which is not established by the provided evidence.
- followup: Confirm the data model/cardinality for related_link_label: is it a multi-valued attribute (multiple related links per session) or a single-valued field. If single-valued, identify which specific related link (previous/next/home) the attribute is intended to represent, or split into separate attributes (e.g., previous_link_label, next_link_label, home_link_label).

### Vorzug Dakmar'nak (VOR-zug DAHK-mar-nak) — “Ledger-Scar” — `affiliation`

- **Rakthok Horde (Dakmar'nak)** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12)
  > --- created: 2025-12-14...
- **Ardenhaven (resident-in-good-standing, pending)** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12)
  > --- created: 2025-12-14...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: V1 claims affiliation with the Rakthok Horde (Dakmar'nak), while V2 claims affiliation with Ardenhaven as a resident-in-good-standing (pending). These are not inherently contradictory because “affiliation” can cover different scopes (e.g., faction/tribal allegiance vs. civic residency status), and V2’s “pending” qualifier suggests a conditional or administrative status rather than exclusive membership. The single shared citation line does not establish exclusivity or a single-valued affiliation field.
- followup: Check the cited source context around #L12 to see whether it treats affiliation as a single exclusive faction, and whether Ardenhaven residency is defined as incompatible with Rakthok Horde membership; if needed, split the data model into separate fields (e.g., faction_allegiance vs. civic_residency/status) or add time qualifiers.

### Vorzug Dakmar'nak (VOR-zug DAHK-mar-nak) — “Ledger-Scar” — `backstory_event`

- **Bazgar Dakmar'nak recognized Vorzug as a “brother” of the tribe—kin by hearth and oath, not blood** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L42](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L42)
  > --- created: 2025-12-14...
- **Bazgar demanded an arbiter and forced foremen to produce the contract that supposedly bound Vorzug** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L42](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L42)
  > --- created: 2025-12-14...
- **The contract that supposedly bound Vorzug did not exist** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L42](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L42)
  > --- created: 2025-12-14...
- **Under League rules, with no contract there was no claim, and Vorzug was allowed to leave** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L42](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L42)
  > --- created: 2025-12-14...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: All four claims can describe the same incident without contradiction: Bazgar recognizes Vorzug as kin by oath (V1), then challenges the foremen by demanding an arbiter and the alleged binding contract (V2). The contract is not produced because it does not exist (V3), and under League rules the lack of a contract means there is no enforceable claim, so Vorzug is allowed to leave (V4). These statements are sequential and mutually reinforcing rather than conflicting.
- followup: Verify in the cited passage whether V3 is stated as an objective fact (“did not exist”) or only as a failure to produce the document at that moment; if it is only non-production, consider rephrasing V3 to match the source’s certainty.

### Vorzug Dakmar'nak (VOR-zug DAHK-mar-nak) — “Ledger-Scar” — `bond`

- **Owes a life-debt to Bazgar** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27)
  > --- created: 2025-12-14...
- **Still considers himself answerable to the Dakmar'nak Fire Council** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27)
  > --- created: 2025-12-14...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: V1 asserts a personal obligation (a life-debt) to Bazgar, while V2 asserts an institutional/authority relationship (still answerable to the Dakmar'nak Fire Council). These are not mutually exclusive as stated; a person can simultaneously owe a life-debt to an individual and also consider themselves accountable to a governing council. The provided citations do not indicate exclusivity, hierarchy, or a situation where fulfilling one bond would negate the other.
- followup: Check the cited section for any wording that implies exclusivity or conflict (e.g., 'no longer answerable' / 'only answers to' / 'in defiance of the Council') and clarify scope: does the life-debt require actions that would violate Council authority, or does the Council recognize/override such personal debts?

### Vorzug Dakmar'nak (VOR-zug DAHK-mar-nak) — “Ledger-Scar” — `flaw`

- **Prideful about competence** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27)
  > --- created: 2025-12-14...
- **Resents being treated as “muscle” and can turn coldly sarcastic** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27)
  > --- created: 2025-12-14...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: V1 ("Prideful about competence") and V2 ("Resents being treated as 'muscle' and can turn coldly sarcastic") are compatible. Pride in competence can directly motivate resentment at being reduced to a simplistic role label, and the sarcastic reaction can be an expression of that pride being slighted. Both claims are presented as flaws and can co-exist without contradiction.
- followup: If you need a single consolidated flaw entry, consider merging into one phrasing that links them (e.g., pride in competence leading to resentment at being treated as mere muscle, expressed via cold sarcasm). Otherwise, confirm whether the source intends these as separate bullet points or a single combined characterization at the cited line.

### Vorzug Dakmar'nak (VOR-zug DAHK-mar-nak) — “Ledger-Scar” — `language`

- **Orcish (fluent)** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12)
  > --- created: 2025-12-14...
- **Common (serviceable)** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12)
  > --- created: 2025-12-14...
- **Dwarven (basic; learned from Bazgar)** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12)
  > --- created: 2025-12-14...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: The three candidate values describe proficiency in three different languages (Orcish, Common, Dwarven) with different fluency levels. These are not mutually exclusive and can all be true simultaneously; nothing in the claims indicates exclusivity (e.g., “only speaks”) or a time-based change that would create a contradiction.
- followup: Verify in world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12 whether the language list is presented as a complete current set (e.g., “Languages: …”) and whether any wording implies exclusivity or a different time period (past vs. present proficiency).

### Vorzug Dakmar'nak (VOR-zug DAHK-mar-nak) — “Ledger-Scar” — `personality_trait`

- **Watchful** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27)
  > --- created: 2025-12-14...
- **Patient** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27)
  > --- created: 2025-12-14...
- **Literal-minded about promises** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27)
  > --- created: 2025-12-14...
- **Speaks softly until cornered** — [world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27](world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27)
  > --- created: 2025-12-14...

**Adjudication**
- is_conflict: `False`
- severity: `low`
- reason: All four candidate traits describe different, non-exclusive aspects of Vorzug Dakmar'nak’s demeanor and cognition: being watchful and patient can co-occur; being literal-minded about promises is a specific interpretive tendency that does not negate watchfulness or patience; speaking softly until cornered is a situational communication pattern compatible with the other traits. No pair of values asserts an opposite or mutually exclusive state, and all are sourced to the same citation without indicating differing time periods or scopes that would create tension.
- followup: No conflict resolution needed. If you want higher precision, confirm whether the source text frames these as stable traits vs. context-dependent behaviors (e.g., “usually” vs. “only when negotiating”), but based on the provided claims they are compatible.

## Entities (Claims)

### Aeralithil (AIR-ah-LITH-il)

- `control_mechanism`:
  - The threat of Severance keeps the faithful compliant. (`world/factions/araethilion/locations/aeralithil.md#L16`)
- `culture`:
  - Elven (Araethilion) (`world/factions/araethilion/locations/aeralithil.md#L8`)
- `description`:
  - A radiant forest capital where living temples and songwoven halls encircle Elaerith’s courts. (`world/factions/araethilion/locations/aeralithil.md#L16`)
- `faction`:
  - Araethilion (`world/factions/araethilion/locations/aeralithil.md#L8`)
- `point_of_interest`:
  - The Veiled Court — the inner rings of proximity, where access is power (`world/factions/araethilion/locations/aeralithil.md#L19`)
  - Lifebloom Hall — where the Silver Thread is bound in intimate rite (`world/factions/araethilion/locations/aeralithil.md#L19`)
  - Whisper Galleries — dissident circles trading rumors of exile, Severance, and forgotten names (`world/factions/araethilion/locations/aeralithil.md#L19`)
- `pronunciation`:
  - AIR-ah-LITH-il (`world/factions/araethilion/locations/aeralithil.md#L8`, `world/README.md#L13`)
- `role_for_faction`:
  - Headquarters of Araethilion (`world/factions/araethilion/_overview.md#L146`)
- `social_dynamic`:
  - Proximity to the living god is privilege. (`world/factions/araethilion/locations/aeralithil.md#L16`)
- `tagline`:
  - Sacred heart-city beneath the Veiled Crown. (`world/factions/araethilion/_overview.md#L146`, `world/factions/araethilion/locations/aeralithil.md#L8`)
- `type`:
  - Capital city (`world/factions/araethilion/locations/aeralithil.md#L8`)

### AGENTS.md

- `additional_style_guide_reference`:
  - Also follow .github/copilot-instructions.md for the full style guide if Copilot instructions exist. (`AGENTS.md#L39`)
- `content_creation_rule_follow_instructions`:
  - When creating or editing content, follow the rules in AGENTS.md. (`AGENTS.md#L1`)
- `filename_convention_kebab_case`:
  - Filenames should be kebab-case (e.g., location-name.md). (`AGENTS.md#L26`)
- `golden_rule_prefer_small_changes`:
  - Prefer small, focused changes and keep files readable and linkable. (`AGENTS.md#L5`)
- `golden_rule_preserve_lore_and_tone`:
  - Preserve existing lore and tone; do not retcon unless asked. (`AGENTS.md#L5`)
- `golden_rule_use_relative_links`:
  - Use relative links between docs. (`AGENTS.md#L5`)
- `markdown_formatting_guidance`:
  - Use # / ## / ### headings, bullets for lists, tables for stat blocks, and > for read-aloud. (`AGENTS.md#L26`)
- `metadata_front_matter_fields`:
  - Front matter should include created date, last modified, tags, and status. (`AGENTS.md#L31`)
- `metadata_front_matter_required_for_new_lore_docs`:
  - Include front matter when creating new lore docs. (`AGENTS.md#L31`)
- `repository_type`:
  - This repo is a D&D 5.5e campaign vault. (`AGENTS.md#L1`)
- `session_filename_convention`:
  - Session files should be named session-XX-YYYY-MM-DD.md. (`AGENTS.md#L26`)
- `world_naming_pronunciation_guidance`:
  - For complex names, include pronunciation on first mention as Name (PHONETIC) with CAPS for stressed syllables. (`AGENTS.md#L35`)

### Araethilion — Veiled Crown Theocracy

- `artifact`:
  - The Veiled Crown itself (`world/factions/araethilion/_overview.md#L134`)
  - Lifelume Arbors (ritual foci) (`world/factions/araethilion/_overview.md#L134`)
  - Whisper Stones (communication relics) (`world/factions/araethilion/_overview.md#L134`)
- `created_date`:
  - 2025-12-07 (`world/factions/araethilion/_overview.md#L1`)
- `current_project`:
  - Expanding Lifelume Groves to sustain growing population (`world/factions/araethilion/_overview.md#L194`)
  - Containing prophecies from exile enclaves (`world/factions/araethilion/_overview.md#L194`)
- `foundation_event`:
  - Founded when the First Araethil united scattered elven clans under a single crown, claiming divine mandate from the forest itself (`world/factions/araethilion/_overview.md#L56`)
- `last_modified_date`:
  - 2025-12-15 (`world/factions/araethilion/_overview.md#L1`)
- `leader_description`:
  - Never seen unmasked (`world/factions/araethilion/_overview.md#L89`)
  - Voice like silver bells (`world/factions/araethilion/_overview.md#L89`)
  - Presence radiates uncanny vitality (`world/factions/araethilion/_overview.md#L89`)
- `leader_name`:
  - Name TBD (`world/factions/araethilion/_overview.md#L89`)
- `leader_role`:
  - Supreme authority; source of blessings and divine mandates (`world/factions/araethilion/_overview.md#L89`)
- `leader_style`:
  - The Veiled Crown, Living God of Araethilion (`world/factions/araethilion/_overview.md#L89`)
- `leader_title`:
  - The Veiled Sovereign (`world/factions/araethilion/_overview.md#L89`)
- `magical_asset_spellcasters`:
  - High density of clerics, druids, and bards; all bound to the Veiled Crown's divine mandate (`world/factions/araethilion/_overview.md#L134`)
- `membership_requirement`:
  - Birth as an elf of Araethilion (`world/factions/araethilion/_overview.md#L103`)
  - Participation in seasonal blessings (`world/factions/araethilion/_overview.md#L103`)
  - Oaths of service to the Veiled Crown during coming-of-age rites (`world/factions/araethilion/_overview.md#L103`)
- `public_activities`:
  - Seasonal festivals (`world/factions/araethilion/_overview.md#L187`)
  - Artisan exports (`world/factions/araethilion/_overview.md#L187`)
  - Healing services (`world/factions/araethilion/_overview.md#L187`)
  - Songwoven diplomatic envoys (`world/factions/araethilion/_overview.md#L187`)
- `rival`:
  - Exile Enclaves (`world/factions/araethilion/_overview.md#L164`)
- `rival_description`:
  - Dissident seers operating beyond borders (`world/factions/araethilion/_overview.md#L164`)
- `status`:
  - Active (`world/factions/araethilion/_overview.md#L1`)
- `tags`:
  - #faction #organization #government #elves (`world/factions/araethilion/_overview.md#L1`)

### Ardenford

- `adventure_hook`:
  - A vote risks deadlock on rebuilding border defenses. (`world/factions/ardenhaven/locations/ardenford.md#L24`)
  - Smugglers exploit a war-scarred district’s weak oversight. (`world/factions/ardenhaven/locations/ardenford.md#L24`)
  - Guild intrigue threatens fair grain prices ahead of winter. (`world/factions/ardenhaven/locations/ardenford.md#L24`)
- `contains`:
  - The crown’s palace (`world/factions/ardenhaven/locations/ardenford.md#L16`)
  - The Council Hall (`world/factions/ardenhaven/locations/ardenford.md#L16`)
- `council_hall_attendees`:
  - Lords, guilds, and temples convene there. (`world/factions/ardenhaven/locations/ardenford.md#L16`)
- `culture`:
  - Human (Ardenhaven) (`world/factions/ardenhaven/locations/ardenford.md#L8`)
- `description`:
  - River-crossing capital and council seat. (`world/factions/ardenhaven/_overview.md#L113`, `world/factions/ardenhaven/locations/ardenford.md#L8`)
- `faction`:
  - Ardenhaven (`world/factions/ardenhaven/locations/ardenford.md#L8`)
- `geography`:
  - Set astride a broad ford and stone bridgeworks. (`world/factions/ardenhaven/locations/ardenford.md#L16`)
- `has_bridgeworks`:
  - Fordspine Bridgeworks (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L50`)
- `has_towers_and_bridges`:
  - Ardenford’s towers and bridges are noted as great works. (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L50`)
- `is_capital_city`:
  - true (`world/factions/ardenhaven/_overview.md#L113`, `world/factions/ardenhaven/locations/ardenford.md#L8`)
- `is_council_seat`:
  - true (`world/factions/ardenhaven/_overview.md#L113`, `world/factions/ardenhaven/locations/ardenford.md#L8`)
- `is_headquarters_of`:
  - Ardenhaven (`world/factions/ardenhaven/_overview.md#L113`, `world/factions/ardenhaven/_overview.md#L8`)
- `symbolism`:
  - Symbol of resilience and shared governance. (`world/factions/ardenhaven/_overview.md#L113`)
- `type`:
  - Capital city (`world/factions/ardenhaven/locations/ardenford.md#L8`)

### Ardenhaven — The Haven Realm

- `border_fortresses_status`:
  - Underfunded but manned (`world/factions/ardenhaven/_overview.md#L116`)
- `border_fortresses_threats_watched`:
  - Watching the Imperium and occasional Garrokan raids (`world/factions/ardenhaven/_overview.md#L116`)
- `created_date`:
  - 2025-12-07 (`world/factions/ardenhaven/_overview.md#L1`)
- `entity_type_tags`:
  - faction; organization; government (`world/factions/ardenhaven/_overview.md#L1`)
- `geographic_scope`:
  - The only faction that truly spans both continents (`adhok_notes/meaning-behind-facitons.symbols.md#L6`)
- `last_modified_date`:
  - 2025-12-07 (`world/factions/ardenhaven/_overview.md#L1`)
- `major_event_founding_council`:
  - First assembly of lords, guilds, and temples to draft the Haven Charter (Year TBD) (`world/factions/ardenhaven/_overview.md#L40`)
- `major_event_grain_crisis`:
  - Famine and corruption scandal that nearly collapsed the realm; reforms followed (Year TBD) (`world/factions/ardenhaven/_overview.md#L40`)
- `major_event_ironstead_stalemate`:
  - Final battle ending in ceasefire; borders recognized by treaty (Year TBD) (`world/factions/ardenhaven/_overview.md#L40`)
- `membership_benefits`:
  - Fair courts, freedom of speech, guild protections, temple services, open petitions to the Council (`world/factions/ardenhaven/_overview.md#L87`)
- `membership_obligations`:
  - Taxes, militia service (voluntary but incentivized), jury duty, respect for the Charter (`world/factions/ardenhaven/_overview.md#L90`)
- `membership_requirements`:
  - Residency and oath to the Haven Charter; citizenship granted after one year; voting rights after property or service (`world/factions/ardenhaven/_overview.md#L77`)
- `origin_period`:
  - Born into power during the Age of Roads (`adhok_notes/meaning-behind-facitons.symbols.md#L6`)
- `sovereign_description`:
  - War veteran turned reluctant diplomat; believes in the vision despite constant frustration (`world/factions/ardenhaven/_overview.md#L65`)
- `sovereign_role`:
  - Executive authority, ceremonial unity, charter enforcement (`world/factions/ardenhaven/_overview.md#L65`)
- `sovereign_title`:
  - Sovereign of the Haven Realm (`world/factions/ardenhaven/_overview.md#L65`)
- `status`:
  - Active (`world/factions/ardenhaven/_overview.md#L1`)
- `symbol_color_meaning`:
  - Blue is said to honor the sea and the rivers that connect their towns and carry their people home (`adhok_notes/meaning-behind-facitons.symbols.md#L6`)

### Ashenfall

- `adventure_hook`:
  - A missing ledger ties a noble to infernal pacts. (`world/factions/calderon-imperium/locations/ashenfall.md#L24`)
  - Undead troop movements are masked as “sanitation brigades.” (`world/factions/calderon-imperium/locations/ashenfall.md#L24`)
  - A factory fire exposes a forbidden research wing. (`world/factions/calderon-imperium/locations/ashenfall.md#L24`)
- `culture`:
  - Human (Calderon Imperium — The Ashen Empire) (`world/factions/calderon-imperium/locations/ashenfall.md#L8`)
- `description`:
  - A vast metropolis of basalt courts and smokestack manufactories. (`world/factions/calderon-imperium/locations/ashenfall.md#L16`)
- `faction`:
  - Calderon Imperium (`world/factions/calderon-imperium/locations/ashenfall.md#L8`)
- `point_of_interest`:
  - Black Throne Court — seat of the Emperor/Empress (`world/factions/calderon-imperium/locations/ashenfall.md#L19`)
  - Census Basilica — bureaucratic nerve center recording every soul (`world/factions/calderon-imperium/locations/ashenfall.md#L19`)
  - Veilwatch — headquarters of the Empire’s clandestine enforcers (`world/factions/calderon-imperium/locations/ashenfall.md#L19`)
- `tagline`:
  - Soot-wreathed imperial capital and throne district. (`world/factions/calderon-imperium/locations/ashenfall.md#L8`)
- `throne_district_overlooks`:
  - Regimented avenues patrolled by secret police and imperial legions. (`world/factions/calderon-imperium/locations/ashenfall.md#L16`)
- `type`:
  - Capital city (`world/factions/calderon-imperium/locations/ashenfall.md#L8`)

### Bazgar Dakmar'nak (BAZ-gar DAHK-mar-nak)

- `affiliation`:
  - Rakthok Horde (`characters/player-characters/jeff-bazgar.md#L11`)
  - Dakmar'nak Tribe (`characters/player-characters/jeff-bazgar.md#L11`)
- `alignment`:
  - Chaotic Good (`characters/player-characters/jeff-bazgar.md#L11`)
- `brother`:
  - Ghorrak (First Striker, Warlord) (`characters/player-characters/jeff-bazgar.md#L11`)
- `class`:
  - Fighter (Battlemaster; Action Hero vibe) (`characters/player-characters/jeff-bazgar.md#L11`)
- `father`:
  - Bazrak (`characters/player-characters/jeff-bazgar.md#L11`)
- `level`:
  - 1 (`characters/player-characters/jeff-bazgar.md#L11`)
- `location`:
  - Ardenhaven (starting), roots in the Black Marsh (`characters/player-characters/jeff-bazgar.md#L11`)
- `name`:
  - Bazgar Dakmar'nak (`characters/player-characters/jeff-bazgar.md#L11`)
- `pronunciation`:
  - BAZ-gar DAHK-mar-nak (`characters/player-characters/jeff-bazgar.md#L11`)
- `race`:
  - Orc (Dakmar'nak tribe) (`characters/player-characters/jeff-bazgar.md#L11`)
- `tribal_context`:
  - Dakmar'nak honor is earned through elections and battlefield merit, not inheritance; this drives scions like Bazgar Dakmar'nak to prove themselves beyond their lineage. (`world/factions/rakthok-horde/tribes/dakmarnak.md#L20`)

### Calderon Imperium — The Iron Imperium

- `capital_city`:
  - Ironstead (`world/factions/calderon-imperium/locations/ironstead.md#L8`)
- `created_date`:
  - 2025-12-07 (`world/factions/calderon-imperium/_overview.md#L1`)
- `current_projects`:
  - Standardizing canal tariffs; testing a "silent cohort" doctrine; expanding signal networks. (`world/factions/calderon-imperium/_overview.md#L154`)
- `dm_usage_guidance`:
  - Make the Imperium reliable, readable, and relentless. It rewards process and punishes defiance. Conflicts hinge on interpretation of edicts, not random cruelty. (`world/factions/calderon-imperium/_overview.md#L187`)
- `entity_name`:
  - Calderon Imperium — The Iron Imperium (`world/factions/calderon-imperium/_overview.md#L1`)
- `foundation_context`:
  - Formed after decades of civil wars and border feuds, when the Calderon dynasts unified the heartlands under a permanent edict code and standing legions. (`world/factions/calderon-imperium/_overview.md#L37`)
- `last_modified_date`:
  - 2025-12-07 (`world/factions/calderon-imperium/_overview.md#L1`)
- `membership_benefits`:
  - Predictable courts, protected trade, infrastructure access, imperial stipends for service. (`world/factions/calderon-imperium/_overview.md#L89`)
- `military_equipment`:
  - Standardized arms and armor; siege trains; signal towers (`world/factions/calderon-imperium/_overview.md#L101`)
- `military_forces`:
  - Multiple field legions, cohort garrisons, engineer corps (`world/factions/calderon-imperium/_overview.md#L101`)
- `status`:
  - Active (`world/factions/calderon-imperium/_overview.md#L1`)
- `tags`:
  - #faction #organization #government (`world/factions/calderon-imperium/_overview.md#L1`)
- `territory_description`:
  - The core heartlands and annexed marches; recognized borders with the Haven Realm under the Treaties. (`world/factions/calderon-imperium/_overview.md#L121`)

### Characters

- `directory_purpose`:
  - This directory contains all character information for the campaign. (`characters/README.md#L1`)
- `filename_convention`:
  - Use kebab-case for filenames (example: character-name.md). (`characters/README.md#L10`)
- `new_character_npc_location`:
  - NPCs go in npcs/. (`characters/README.md#L10`)
- `new_character_player_character_location`:
  - Player characters go in player-characters/. (`characters/README.md#L10`)
- `new_character_step_copy_template`:
  - Creating a new character includes copying the template from /templates/character-template.md. (`characters/README.md#L10`)
- `new_character_step_fill_sections`:
  - Creating a new character includes filling in all relevant sections. (`characters/README.md#L10`)
- `organization_tip_link_related_entities`:
  - Characters should be linked to related locations, quests, and other characters. (`characters/README.md#L19`)
- `organization_tip_npc_last_interaction`:
  - For NPCs, note when the party last interacted with them. (`characters/README.md#L19`)
- `organization_tip_track_development`:
  - Character development and major story moments should be tracked. (`characters/README.md#L19`)
- `organization_tip_update_after_sessions`:
  - Character sheets should be kept updated after each session. (`characters/README.md#L19`)
- `quick_link_character_template`:
  - A quick link exists to ../templates/character-template.md labeled Character Template. (`characters/README.md#L26`)
- `quick_link_npcs`:
  - A quick link exists to npcs/ labeled NPCs. (`characters/README.md#L26`)
- `quick_link_player_characters`:
  - A quick link exists to player-characters/ labeled Player Characters. (`characters/README.md#L26`)
- `structure_includes_npcs_dir`:
  - The structure includes an npcs/ directory for non-player characters the party has met or may meet. (`characters/README.md#L5`)
- `structure_includes_player_characters_dir`:
  - The structure includes a player-characters/ directory for player character sheets and information. (`characters/README.md#L5`)

### Contributing to This Campaign

- `co_dm_world_building_can_add_factions`:
  - Co-DMs are invited to add factions. (`CONTRIBUTING.md#L48`)
- `co_dm_world_building_can_add_historical_events`:
  - Co-DMs are invited to add historical events. (`CONTRIBUTING.md#L48`)
- `co_dm_world_building_can_add_locations`:
  - Co-DMs are invited to add new locations. (`CONTRIBUTING.md#L48`)
- `co_dm_world_building_can_add_lore_and_mythology`:
  - Co-DMs are invited to add lore and mythology. (`CONTRIBUTING.md#L48`)
- `co_dm_world_building_can_add_npcs`:
  - Co-DMs are invited to add NPCs. (`CONTRIBUTING.md#L48`)
- `co_dm_world_building_constraint`:
  - Added content should fit the established campaign world. (`CONTRIBUTING.md#L48`)
- `contributing_section_allows_customization`:
  - Contributors are encouraged to customize templates for their needs. (`README.md#L159`)
- `contributing_section_allows_new_templates`:
  - Contributors are encouraged to add new templates for unique content. (`README.md#L159`)
- `contributing_section_allows_structure_modification`:
  - Contributors are encouraged to modify the structure to fit their campaign. (`README.md#L159`)
- `contributing_section_encourages_sharing_improvements`:
  - Contributors are encouraged to share improvements and ideas. (`README.md#L159`)
- `document_title`:
  - Contributing to This Campaign (`CONTRIBUTING.md#L1`)
- `help_guidance_ask_dm`:
  - For questions, contributors are instructed to ask the DM. (`CONTRIBUTING.md#L165`)
- `help_guidance_check_example_files`:
  - For questions, contributors are instructed to check the example files. (`CONTRIBUTING.md#L165`)
- `help_guidance_review_copilot_instructions`:
  - For questions, contributors are instructed to look at `.github/copilot-instructions.md`. (`CONTRIBUTING.md#L165`)
- `help_guidance_review_template_comments`:
  - For questions, contributors are instructed to review template comments. (`CONTRIBUTING.md#L165`)
- `player_background_can_add_locations_path`:
  - Players can create locations from their past in `/world/factions/<region>/locations/`. (`CONTRIBUTING.md#L22`)
- `player_background_can_add_npcs_path`:
  - Players can add NPCs from their backstory to `/characters/npcs/`. (`CONTRIBUTING.md#L22`)
- `player_background_should_link_to_character_sheet`:
  - Players are instructed to link added background elements to their character sheet. (`CONTRIBUTING.md#L22`)
- `purpose`:
  - A guide to help players and co-DMs contribute to the campaign repository. (`CONTRIBUTING.md#L1`)
- `repository_role_statement`:
  - The repository is described as a tool to enhance the game, not a burden. (`CONTRIBUTING.md#L197`)
- `resources_include_dnd_beyond`:
  - Resources include D&D Beyond as an official rules reference. (`CONTRIBUTING.md#L197`)
- `resources_include_git_basics`:
  - Resources include a link to Git Basics (git-scm.com book section). (`CONTRIBUTING.md#L197`)
- `resources_include_markdown_guide`:
  - Resources include a link to the Markdown Guide (markdownguide.org). (`CONTRIBUTING.md#L197`)
- `status_tag_active_definition`:
  - `#active` means currently relevant. (`CONTRIBUTING.md#L132`)
- `status_tag_archive_definition`:
  - `#archive` means old/historical. (`CONTRIBUTING.md#L132`)
- `status_tag_completed_definition`:
  - `#completed` means finished. (`CONTRIBUTING.md#L132`)
- `status_tag_planned_definition`:
  - `#planned` means future content. (`CONTRIBUTING.md#L132`)
- `tagging_system_exists`:
  - The guide includes a tagging system and instructs using consistent tags in documents. (`CONTRIBUTING.md#L119`)

### Creatures

- `cr_balance_guideline_adjust_as_needed`:
  - CR and balance guidance: adjust as needed based on performance. (`creatures/README.md#L31`)
- `cr_balance_guideline_party_level`:
  - CR and balance guidance: use CR appropriate for party level. (`creatures/README.md#L31`)
- `cr_balance_guideline_test_custom_creatures`:
  - CR and balance guidance: test custom creatures in combat. (`creatures/README.md#L31`)
- `directory_contents`:
  - This directory contains monster stat blocks, creature descriptions, and bestiary information. (`creatures/README.md#L1`)
- `new_creature_process_step_1`:
  - Creating a new creature: use /templates/creature-template.md. (`creatures/README.md#L13`)
- `new_creature_save_detailed_lore`:
  - Creating a new creature: save detailed lore entries to bestiary/. (`creatures/README.md#L13`)
- `new_creature_save_homebrew`:
  - Creating a new creature: save homebrew creatures to custom/. (`creatures/README.md#L13`)
- `new_creature_save_standard_monsters`:
  - Creating a new creature: save standard monsters to monsters/. (`creatures/README.md#L13`)
- `quick_link_bestiary`:
  - A quick link exists to bestiary/ labeled 'Bestiary'. (`creatures/README.md#L56`)
- `quick_link_creature_template`:
  - A quick link exists to ../templates/creature-template.md labeled 'Creature Template'. (`creatures/README.md#L56`)
- `quick_link_custom_creatures`:
  - A quick link exists to custom/ labeled 'Custom Creatures'. (`creatures/README.md#L56`)
- `quick_link_monsters`:
  - A quick link exists to monsters/ labeled 'Monsters'. (`creatures/README.md#L56`)
- `stat_block_format_requirement`:
  - New creatures should include a complete stat block following D&D 5.5e format. (`creatures/README.md#L13`)
- `structure_bestiary_subdir`:
  - The bestiary/ subdirectory is for detailed creature descriptions and ecology. (`creatures/README.md#L5`)
- `structure_custom_subdir`:
  - The custom/ subdirectory is for homebrew creatures and variants. (`creatures/README.md#L5`)
- `structure_monsters_subdir`:
  - The monsters/ subdirectory is for standard D&D monsters and enemies. (`creatures/README.md#L5`)

### D&D 5.5e Campaign Management

- `contributing_guidance`:
  - Contributors are encouraged to customize templates, add new templates, modify the structure, and share improvements and ideas. (`README.md#L159`)
- `designed_for_ruleset`:
  - D&D 5th Edition with the 2024 rules update (often called 5.5e). (`README.md#L144`)
- `getting_started_instructions`:
  - To start, review the templates and the .github/copilot-instructions.md file, then start creating content. (`README.md#L168`)
- `has_contributing_file`:
  - A CONTRIBUTING.md file exists titled "Contributing to This Campaign" and is intended to help players and co-DMs contribute to the campaign repository. (`CONTRIBUTING.md#L1`)
- `has_quick_start_guide`:
  - A QUICK-START.md file exists titled "Quick Start Guide" that helps users get started quickly with the campaign management system. (`QUICK-START.md#L1`)
- `license_terms`:
  - Repository structure and templates are provided as-is for D&D campaign management; campaign content created by users is theirs; the D&D game system and rules are owned by Wizards of the Coast. (`README.md#L168`)
- `provides_structure_for`:
  - A comprehensive structure for managing characters, locations, quests, items, creatures, and session notes. (`README.md#L1`)
- `quest_template_includes_skill_challenges_section`:
  - The quest template includes a "Skill Challenges" section with an item format including challenge name, required skills, DC, and consequences of failure. (`templates/quest-template.md#L62`)
- `recommended_resources`:
  - Player's Handbook (2024); Dungeon Master's Guide (2024); Monster Manual (2024); D&D Beyond; Official D&D Resources. (`README.md#L144`)
- `system_type`:
  - A markdown-based system for organizing and tracking a Dungeons & Dragons 5th Edition (2024 rules / 5.5e) campaign. (`README.md#L1`)
- `world_calendar_observance_day_of_ashes`:
  - The Day of Ashes is dated 1 Arumel (first day of the new year) and commemorates the fall of Ao Sathanum; most realms hold ceremonies to honor the dead of the ancient world and renew vows never to repeat its hubris. (`world/calendar-reckoning-of-the-fall.md#L84`)

### dan

- `associated_location`:
  - Merrowgate (`characters/players_notes.md#L1`)
- `class`:
  - Rogue (`characters/players_notes.md#L1`)
- `request`:
  - Wants a list of nobles to impersonate that are from Ardenhaven (`characters/players_notes.md#L1`)
- `subclass`:
  - Phantom (`characters/players_notes.md#L1`)

### Dulgarum — The Oathbound Holds

- `created_date`:
  - 2025-12-07 (`world/factions/dulgarum-oathholds/_overview.md#L1`)
- `dm_notes_future_plans`:
  - A catastrophic breach forces the truth into the open; a faction seeks to end the oaths despite the risk; the entity below begins communicating, revealing the nature of the pact. (`world/factions/dulgarum-oathholds/_overview.md#L188`)
- `enemies`:
  - The entity/entities in the deep; insurgents seeking to expose or end the oaths. (`world/factions/dulgarum-oathholds/_overview.md#L130`)
- `entity_type_tags`:
  - #faction #organization #government #dwarves (`world/factions/dulgarum-oathholds/_overview.md#L1`)
- `last_modified_date`:
  - 2025-12-07 (`world/factions/dulgarum-oathholds/_overview.md#L1`)
- `location_sealed_depths_description`:
  - The Sealed Depths are classified tunnels and breachgates where the Deep Watch fights the horror. (`world/factions/dulgarum-oathholds/_overview.md#L116`)
- `membership_obligations`:
  - Obey the Binding Oaths; serve in the Deep Watch (rotation basis); report heresy or dissent; maintain secrecy about the true nature of the threat. (`world/factions/dulgarum-oathholds/_overview.md#L90`)
- `reputation_outsiders_view`:
  - Outsiders say the Holds want nothing but to be left alone with their mines—and that every “treaty” is really just a wall with better manners. (`adhok_notes/meaning-behind-facitons.symbols.md#L12`)
- `secrets_binding_oaths_symbiosis_possibility`:
  - The Binding of Oaths may not just oppose the horror—it may bind the Holds to it, sustaining both the threat and the defense in a terrible symbiosis. (`world/factions/dulgarum-oathholds/_overview.md#L174`)
- `secrets_evidence_supply_trains_feed_below`:
  - Evidence suggests supply trains feed something below. (`world/factions/dulgarum-oathholds/_overview.md#L174`)
- `secrets_fears_about_ending_oaths`:
  - Some fear ending the oaths would unleash the horror; others fear the oaths are what keep it alive. (`world/factions/dulgarum-oathholds/_overview.md#L174`)
- `status`:
  - Active (`world/factions/dulgarum-oathholds/_overview.md#L1`)
- `territory_description`:
  - Mountain holds, mining networks, and fortified passes. (`world/factions/dulgarum-oathholds/_overview.md#L119`)

### Exporting Markdown to PDF

- `alternate_pdf_engine_option`:
  - An optional alternate PDF engine is wkhtmltopdf instead of pdflatex. (`pdf-readme.md#L110`)
- `build_task_hotkey_support`:
  - Because the task is in the build group, you can run 'Tasks: Run Build Task' and then use Cmd+Shift+B to run the export for the active Markdown file. (`pdf-readme.md#L85`)
- `export_steps_command_palette`:
  - To export: open the Markdown file, press Cmd+Shift+P, run 'Tasks: Run Task', then pick 'Markdown: Export to PDF'. (`pdf-readme.md#L77`)
- `exported_pdf_naming`:
  - The exported PDF is named your-file-name.pdf. (`pdf-readme.md#L77`)
- `homebrew_install_mactex_no_gui_command`:
  - The LaTeX engine can be installed via Homebrew with: brew install --cask mactex-no-gui. (`pdf-readme.md#L5`, `pdf-readme.md#L96`)
- `homebrew_install_pandoc_command`:
  - Pandoc can be installed via Homebrew with: brew install pandoc. (`pdf-readme.md#L5`)
- `homebrew_install_uv_command`:
  - uv can be installed via Homebrew with: brew install uv. (`pdf-readme.md#L5`)
- `one_time_setup_requires_latex_engine_pdflatex`:
  - One-time setup requires a LaTeX engine (pdflatex) used by Pandoc to build the PDF. (`pdf-readme.md#L5`)
- `one_time_setup_requires_pandoc`:
  - One-time setup requires Pandoc for Markdown to PDF conversion. (`pdf-readme.md#L5`)
- `one_time_setup_requires_uv`:
  - One-time setup requires uv to install/use Python for the export helper. (`pdf-readme.md#L5`)
- `pdf_output_directory`:
  - Exported PDFs land in the ~/Downloads folder. (`pdf-readme.md#L1`, `pdf-readme.md#L77`)
- `pdflatex_not_found_error_meaning`:
  - If you see 'pdflatex not found...', it means the LaTeX engine is missing. (`pdf-readme.md#L96`)
- `pdflatex_not_found_resolution`:
  - To resolve 'pdflatex not found', install mactex-no-gui, then restart VS Code and run the task again. (`pdf-readme.md#L96`)
- `repo_supports_md_to_pdf_export`:
  - The repo is set up so you can work in .md files and quickly export any open Markdown file to a PDF. (`pdf-readme.md#L1`)
- `restart_vscode_after_installation`:
  - After installation, restart VS Code so your shell and PATH are up to date. (`pdf-readme.md#L5`)
- `tasks_json_pdf_engine_flag`:
  - You can update .vscode/tasks.json to add --pdf-engine=wkhtmltopdf to the args for PDF generation. (`pdf-readme.md#L110`)
- `wkhtmltopdf_install_command`:
  - wkhtmltopdf can be installed with: brew install wkhtmltopdf. (`pdf-readme.md#L110`)
- `wkhtmltopdf_used_by_pandoc_when_configured`:
  - When configured with --pdf-engine=wkhtmltopdf, Pandoc uses wkhtmltopdf instead of pdflatex to generate PDFs. (`pdf-readme.md#L110`)

### Faction Inspiration Sources

- `document_title`:
  - Faction Inspiration Sources (`world/faction-insperation-sorces.md#L8`)
- `intended_use`:
  - Use the inspirations as research starting points and tonal anchors; avoid flattening any culture into a stereotype. (`world/faction-insperation-sorces.md#L8`)
- `links_destination`:
  - Links point to each faction’s overview for quick context. (`world/faction-insperation-sorces.md#L8`)
- `not_one_to_one_equivalence`:
  - The inspiration map is not a 1:1 equivalence or a historical claim. (`world/faction-insperation-sorces.md#L8`)
- `purpose`:
  - A real-world inspiration map for each in-world faction covering aesthetics, institutions, values, and how they behave under pressure. (`world/faction-insperation-sorces.md#L8`)
- `related_document`:
  - Faction Proximity & Influence (faction-proximity-and-influence.md). (`world/faction-insperation-sorces.md#L8`)

### Faction Proximity & Influence (Map Interaction Graph)

- `araethilion_influence_ardenhaven`:
  - Araethilion → Ardenhaven: 2. (`world/faction-proximity-and-influence.md#L190`)
- `araethilion_influence_calderon_imperium`:
  - Araethilion → Calderon Imperium: 1. (`world/faction-proximity-and-influence.md#L190`)
- `araethilion_influence_dulgarum_oathholds`:
  - Araethilion → Dulgarum Oathholds: 0. (`world/faction-proximity-and-influence.md#L190`)
- `araethilion_influence_elderholt`:
  - Araethilion → Elderholt: 1. (`world/faction-proximity-and-influence.md#L190`)
- `araethilion_influence_garhammar_trade_league`:
  - Araethilion → Garhammar Trade League: 0. (`world/faction-proximity-and-influence.md#L190`)
- `araethilion_influence_garrok_confederation`:
  - Araethilion → Garrok Confederation: 1. (`world/faction-proximity-and-influence.md#L190`)
- `araethilion_influence_merrowgate`:
  - Araethilion → Merrowgate: 3. (`world/faction-proximity-and-influence.md#L190`)
- `araethilion_influence_rakthok_horde`:
  - Araethilion → Rakthok Horde: 0. (`world/faction-proximity-and-influence.md#L190`)
- `calderon_imperium_influence_araethilion`:
  - Calderon Imperium → Araethilion: 2. (`world/faction-proximity-and-influence.md#L99`)
- `calderon_imperium_influence_ardenhaven`:
  - Calderon Imperium → Ardenhaven: 5. (`world/faction-proximity-and-influence.md#L99`)
- `calderon_imperium_influence_dulgarum_oathholds`:
  - Calderon Imperium → Dulgarum Oathholds: 3. (`world/faction-proximity-and-influence.md#L99`)
- `calderon_imperium_influence_elderholt`:
  - Calderon Imperium → Elderholt: 2. (`world/faction-proximity-and-influence.md#L99`)
- `calderon_imperium_influence_garhammar_trade_league`:
  - Calderon Imperium → Garhammar Trade League: 4. (`world/faction-proximity-and-influence.md#L99`)
- `calderon_imperium_influence_garrok_confederation`:
  - Calderon Imperium → Garrok Confederation: 2. (`world/faction-proximity-and-influence.md#L99`)
- `calderon_imperium_influence_merrowgate`:
  - Calderon Imperium → Merrowgate: 3. (`world/faction-proximity-and-influence.md#L99`)
- `calderon_imperium_influence_rakthok_horde`:
  - Calderon Imperium → Rakthok Horde: 4. (`world/faction-proximity-and-influence.md#L99`)
- `default_rule_unlisted_pairs`:
  - If a pair is not listed under a faction, assume 0–1 depending on distance and the current campaign era. (`world/faction-proximity-and-influence.md#L80`)
- `document_title`:
  - Faction Proximity & Influence (Map Interaction Graph) (`world/faction-proximity-and-influence.md#L8`)
- `goal`:
  - Make it easy (for you and an LLM) to pick the most likely interacting factions when generating timelines, plots, and “who shows up” consequences. (`world/faction-proximity-and-influence.md#L8`)
- `influence_model_type`:
  - Influence model is directed with a 0–5 scale. (`world/faction-proximity-and-influence.md#L80`)
- `influence_scale_0_definition`:
  - Influence score 0 means none/unknown. (`world/faction-proximity-and-influence.md#L71`)
- `influence_scale_1_definition`:
  - Influence score 1 means faint (rare contact; distant interest). (`world/faction-proximity-and-influence.md#L71`)
- `influence_scale_2_definition`:
  - Influence score 2 means low (occasional trade, rumors, or minor border contact). (`world/faction-proximity-and-influence.md#L71`)
- `influence_scale_3_definition`:
  - Influence score 3 means moderate (regular contact; meaningful leverage; recurring disputes). (`world/faction-proximity-and-influence.md#L71`)
- `influence_scale_4_definition`:
  - Influence score 4 means high (major ally/rival; strong dependency; frequent friction). (`world/faction-proximity-and-influence.md#L71`)
- `influence_scale_5_definition`:
  - Influence score 5 means defining (existential threat, hegemon, or “everything is downstream of this relationship”). (`world/faction-proximity-and-influence.md#L71`)
- `map_note_adjacency_list_status`:
  - The adjacency list is map-verified. (`world/faction-proximity-and-influence.md#L8`)
- `map_note_influence_tables_status`:
  - The influence tables remain draft estimates. (`world/faction-proximity-and-influence.md#L8`)
- `merrowgate_influence_araethilion`:
  - Merrowgate → Araethilion: 3. (`world/faction-proximity-and-influence.md#L112`)
- `merrowgate_influence_ardenhaven`:
  - Merrowgate → Ardenhaven: 4. (`world/faction-proximity-and-influence.md#L112`)
- `merrowgate_influence_calderon_imperium`:
  - Merrowgate → Calderon Imperium: 4. (`world/faction-proximity-and-influence.md#L112`)
- `merrowgate_influence_dulgarum_oathholds`:
  - Merrowgate → Dulgarum Oathholds: 2. (`world/faction-proximity-and-influence.md#L112`)
- `merrowgate_influence_elderholt`:
  - Merrowgate → Elderholt: 2. (`world/faction-proximity-and-influence.md#L112`)
- `merrowgate_influence_garhammar_trade_league`:
  - Merrowgate → Garhammar Trade League: 3. (`world/faction-proximity-and-influence.md#L112`)
- `merrowgate_influence_garrok_confederation`:
  - Merrowgate → Garrok Confederation: 2. (`world/faction-proximity-and-influence.md#L112`)
- `merrowgate_influence_rakthok_horde`:
  - Merrowgate → Rakthok Horde: 2. (`world/faction-proximity-and-influence.md#L112`)
- `rakthok_horde_influence_araethilion`:
  - Rakthok Horde → Araethilion: 1. (`world/faction-proximity-and-influence.md#L151`)
- `rakthok_horde_influence_ardenhaven`:
  - Rakthok Horde → Ardenhaven: 1. (`world/faction-proximity-and-influence.md#L151`)
- `rakthok_horde_influence_calderon_imperium`:
  - Rakthok Horde → Calderon Imperium: 4. (`world/faction-proximity-and-influence.md#L151`)
- `rakthok_horde_influence_dulgarum_oathholds`:
  - Rakthok Horde → Dulgarum Oathholds: 1. (`world/faction-proximity-and-influence.md#L151`)
- `rakthok_horde_influence_elderholt`:
  - Rakthok Horde → Elderholt: 1. (`world/faction-proximity-and-influence.md#L151`)
- `rakthok_horde_influence_garhammar_trade_league`:
  - Rakthok Horde → Garhammar Trade League: 3. (`world/faction-proximity-and-influence.md#L151`)
- `rakthok_horde_influence_garrok_confederation`:
  - Rakthok Horde → Garrok Confederation: 2. (`world/faction-proximity-and-influence.md#L151`)
- `rakthok_horde_influence_merrowgate`:
  - Rakthok Horde → Merrowgate: 2. (`world/faction-proximity-and-influence.md#L151`)
- `separates_concepts`:
  - The file separates proximity (physical nearness) from influence (meaningful effects such as trade dependence, rivalry, alliances, ideology, covert reach). (`world/faction-proximity-and-influence.md#L8`)
- `update_dependency_rule`:
  - If any border/route changes, update the adjacency list first; everything else depends on it. (`world/faction-proximity-and-influence.md#L8`)

### Gareth Ironwood

- `ability_score_cha`:
  - 15 (+2) (`characters/npcs/example-innkeeper.md#L38`)
- `ability_score_con`:
  - 13 (+1) (`characters/npcs/example-innkeeper.md#L38`)
- `ability_score_dex`:
  - 10 (+0) (`characters/npcs/example-innkeeper.md#L38`)
- `ability_score_int`:
  - 11 (+0) (`characters/npcs/example-innkeeper.md#L38`)
- `ability_score_str`:
  - 14 (+2) (`characters/npcs/example-innkeeper.md#L38`)
- `ability_score_wis`:
  - 14 (+2) (`characters/npcs/example-innkeeper.md#L38`)
- `age_range`:
  - Late 50s (`characters/npcs/example-innkeeper.md#L19`)
- `armor_description`:
  - Old chainmail (in storage, rarely worn) (`characters/npcs/example-innkeeper.md#L70`)
- `beard_description`:
  - Well-trimmed beard (`characters/npcs/example-innkeeper.md#L19`)
- `build`:
  - Broad-shouldered (`characters/npcs/example-innkeeper.md#L19`)
- `created_date`:
  - 2024-03-15 (`characters/npcs/example-innkeeper.md#L1`)
- `eyes_description`:
  - Kind eyes (`characters/npcs/example-innkeeper.md#L19`)
- `facial_expression`:
  - Warm smile (`characters/npcs/example-innkeeper.md#L19`)
- `goal`:
  - Maintain the Rusty Dragon as the finest establishment in Sandpoint (`characters/npcs/example-innkeeper.md#L85`)
- `hair_color`:
  - Graying (`characters/npcs/example-innkeeper.md#L19`)
- `last_modified_date`:
  - 2024-03-15 (`characters/npcs/example-innkeeper.md#L1`)
- `motivation`:
  - Enjoys helping travelers (`characters/npcs/example-innkeeper.md#L85`)
- `scar_location`:
  - Jagged scar along his left forearm (`characters/npcs/example-innkeeper.md#L19`)
- `secret_hope`:
  - Hopes to inspire young adventurers to be careful and wise, unlike his reckless younger self (`characters/npcs/example-innkeeper.md#L85`)
- `skill_athletics`:
  - +4 (`characters/npcs/example-innkeeper.md#L52`)
- `skill_insight`:
  - +4 (`characters/npcs/example-innkeeper.md#L52`)
- `skill_perception`:
  - +4 (`characters/npcs/example-innkeeper.md#L52`)
- `skill_persuasion`:
  - +4 (`characters/npcs/example-innkeeper.md#L52`)
- `status`:
  - Active (`characters/npcs/example-innkeeper.md#L1`)
- `tags`:
  - #npc, #innkeeper, #friendly (`characters/npcs/example-innkeeper.md#L1`)
- `typical_clothing`:
  - Clean apron over simple, sturdy clothing (`characters/npcs/example-innkeeper.md#L19`)
- `weapon_club_description`:
  - Club (used as walking stick, +4 to hit, 1d4+2 damage) (`characters/npcs/example-innkeeper.md#L66`)
- `weapon_longsword_description`:
  - Old longsword (locked in his room, +4 to hit, 1d8+2 damage) (`characters/npcs/example-innkeeper.md#L66`)

### Goblin Raid on Thornbrook Farm

- `created_date`:
  - 2024-03-15 (`quests/active/example-goblin-raid.md#L1`)
- `estimated_duration`:
  - 1 session (`quests/active/example-goblin-raid.md#L8`)
- `field_damage_signs`:
  - Fields show signs of damage: trampled wheat, broken fences, chicken feathers everywhere (`quests/active/example-goblin-raid.md#L55`)
- `goblin_raiders_description`:
  - Goblin Raiders: 6-8 goblins, poorly equipped but numerous (`quests/active/example-goblin-raid.md#L47`)
- `investigation_findings`:
  - Goblin footprints leading south (`quests/active/example-goblin-raid.md#L83`)
  - Torn cloth caught on fence (goblin clothing) (`quests/active/example-goblin-raid.md#L83`)
  - Timing of attacks (always near midnight) (`quests/active/example-goblin-raid.md#L83`)
- `key_npc_eldon_thornbrook`:
  - Eldon Thornbrook: Farmer, worried about his family (human, age 45) (`quests/active/example-goblin-raid.md#L47`)
- `key_npc_kretch`:
  - Kretch: Goblin chieftain, cowardly but cunning (will flee if losing) (`quests/active/example-goblin-raid.md#L47`)
- `last_modified_date`:
  - 2024-03-15 (`quests/active/example-goblin-raid.md#L1`)
- `level_range`:
  - 1-2 (`quests/active/example-goblin-raid.md#L8`)
- `locations`:
  - Thornbrook Farm (3 miles south of Sandpoint) (`quests/active/example-goblin-raid.md#L8`)
- `possible_outcome_failure`:
  - Party unable to stop raid; goblins continue attacks; Eldon may need to abandon farm (`quests/active/example-goblin-raid.md#L120`)
- `possible_outcome_partial_success`:
  - Some goblins escape but raids stop; partial reward; hook to goblin lair remains (`quests/active/example-goblin-raid.md#L117`)
- `possible_outcome_success`:
  - Goblins defeated or driven off; farm is safe; Eldon is grateful and pays reward (`quests/active/example-goblin-raid.md#L114`)
- `quest_giver`:
  - Gareth Ironwood (`quests/active/example-goblin-raid.md#L8`)
- `quest_type`:
  - Side Quest (`quests/active/example-goblin-raid.md#L8`)
- `stage_1_name`:
  - Stage 1: Investigation (`quests/active/example-goblin-raid.md#L83`)
- `stage_1_status`:
  - Not Started (`quests/active/example-goblin-raid.md#L83`)
- `stage_1_summary`:
  - Party travels to farm, talks to Eldon, investigates signs of previous raids (`quests/active/example-goblin-raid.md#L83`)
- `status`:
  - Active (`quests/active/example-goblin-raid.md#L1`)
- `tags`:
  - #quest #active #combat #local (`quests/active/example-goblin-raid.md#L1`)
- `thornbrook_farm_description`:
  - Small farm with a house, barn, chicken coop, and wheat fields (`quests/active/example-goblin-raid.md#L55`)
- `thornbrook_farm_fencing`:
  - The farm is surrounded by wooden fencing (easily climbed) (`quests/active/example-goblin-raid.md#L55`)
- `thornbrook_farm_sight_lines`:
  - Good sight lines from the house (`quests/active/example-goblin-raid.md#L55`)
- `title`:
  - Goblin Raid on Thornbrook Farm (`quests/active/example-goblin-raid.md#L1`)

### Ironstead

- `adventure_hook`:
  - A new edict tightens border checks; a diplomat needs a lawful workaround. (`world/factions/calderon-imperium/locations/ironstead.md#L24`)
  - The Censorate flags a missing registry block tied to necromantic research. (`world/factions/calderon-imperium/locations/ironstead.md#L24`)
  - A legion review uncovers a defecting centurion with evidence of high treason. (`world/factions/calderon-imperium/locations/ironstead.md#L24`)
- `built_environment`:
  - Straight, iron-banded boulevards and regimented districts built in basalt and steel. (`world/factions/calderon-imperium/locations/ironstead.md#L16`)
- `culture`:
  - Human (Calderon Imperium — The Ashen Empire) (`world/factions/calderon-imperium/locations/ironstead.md#L8`)
- `description_short`:
  - The imperium’s iron seat: straight boulevards, edict basilicas, and parade grounds; open borders under unbending rule. (`world/factions/calderon-imperium/_overview.md#L115`)
  - The imperium’s iron seat: lawful, overt power, open borders under unbending rule. (`world/factions/calderon-imperium/locations/ironstead.md#L8`)
- `faction`:
  - Calderon Imperium (`world/factions/calderon-imperium/locations/ironstead.md#L8`)
- `has_parade_grounds`:
  - Parade grounds flank the central edict halls. (`world/factions/calderon-imperium/locations/ironstead.md#L16`)
- `is_headquarters_of`:
  - Calderon Imperium (`world/factions/calderon-imperium/_overview.md#L115`, `world/factions/calderon-imperium/_overview.md#L8`, `world/factions/calderon-imperium/locations/ironstead.md#L8`)
- `point_of_interest`:
  - Edict Basilica — where imperial decrees are drafted, sealed, and proclaimed (`world/factions/calderon-imperium/locations/ironstead.md#L19`)
  - Legion Parade Grounds — ceremonial field and mustering square for cohorts (`world/factions/calderon-imperium/locations/ironstead.md#L19`)
  - Censorate Tower — administrative heart for audits, registrations, and investigations (`world/factions/calderon-imperium/locations/ironstead.md#L19`)
- `social_bargain`:
  - Prosperity and order in exchange for absolute obedience to imperial law. (`world/factions/calderon-imperium/locations/ironstead.md#L16`)
- `type`:
  - Capital city (`world/factions/calderon-imperium/locations/ironstead.md#L8`)

### Items

- `directory_contents`:
  - This directory contains all equipment, treasure, and magic items. (`items/README.md#L1`)
- `homebrew_items_balance_guideline`:
  - Homebrew items note any balance concerns. (`items/README.md#L38`)
- `homebrew_items_dm_notes_guideline`:
  - Homebrew items include DM notes about usage. (`items/README.md#L38`)
- `homebrew_items_marking_guideline`:
  - Homebrew items are clearly marked. (`items/README.md#L38`)
- `new_item_artifacts_directory_scope`:
  - Legendary items and artifacts are saved to artifacts/. (`items/README.md#L13`)
- `new_item_magic_items_directory_scope`:
  - Common to very rare magic items are saved to magic-items/. (`items/README.md#L13`)
- `new_item_mundane_directory_scope`:
  - Non-magical items are saved to mundane/. (`items/README.md#L13`)
- `new_item_required_inclusions`:
  - New items include all properties, attunement requirements, and lore. (`items/README.md#L13`)
- `new_item_template_path`:
  - /templates/item-template.md (`items/README.md#L13`)
- `quick_link_artifacts_directory`:
  - artifacts/ (`items/README.md#L43`)
- `quick_link_item_template`:
  - ../templates/item-template.md (`items/README.md#L43`)
- `quick_link_magic_items_directory`:
  - magic-items/ (`items/README.md#L43`)
- `quick_link_mundane_directory`:
  - mundane/ (`items/README.md#L43`)
- `structure_artifacts_description`:
  - artifacts/ contains legendary and unique artifacts. (`items/README.md#L5`)
- `structure_magic_items_description`:
  - magic-items/ contains enchanted equipment and wondrous items. (`items/README.md#L5`)
- `structure_mundane_description`:
  - mundane/ contains regular equipment and gear. (`items/README.md#L5`)

### Khargun-dur (KHAR-gun-DOOR)

- `culture`:
  - Dwarven (Dulgarum — Oathbound Holds) (`world/factions/dulgarum-oathholds/locations/khargun-dur.md#L8`)
- `description_short`:
  - Oathforged mountain citadel. (`world/factions/dulgarum-oathholds/locations/khargun-dur.md#L8`)
  - Oathforged mountain citadel; breachgates and vaults hide the secret war. (`world/factions/dulgarum-oathholds/_overview.md#L113`)
- `faction`:
  - Dulgarum-Oathholds (`world/factions/dulgarum-oathholds/locations/khargun-dur.md#L8`)
- `has_breachgates`:
  - Khargun-dur’s oath vaults and breachgates seal ancient tunnels. (`world/factions/dulgarum-oathholds/locations/khargun-dur.md#L16`)
- `has_oath_vaults`:
  - Khargun-dur’s oath vaults and breachgates seal ancient tunnels. (`world/factions/dulgarum-oathholds/locations/khargun-dur.md#L16`)
- `point_of_interest`:
  - Oath Vault — reliquary of binding pacts and clan seals (`world/factions/dulgarum-oathholds/locations/khargun-dur.md#L19`)
  - Breachgates — armored doors to the deep (`world/factions/dulgarum-oathholds/locations/khargun-dur.md#L19`)
  - Stoneward Anvils — forgeworks humming with defensive contracts (`world/factions/dulgarum-oathholds/locations/khargun-dur.md#L19`)
- `pronunciation`:
  - KHAR-gun-DOOR (`world/factions/dulgarum-oathholds/locations/khargun-dur.md#L8`)
- `prosperity_masks_secret_war`:
  - The citadel’s prosperity masks a bleeding, secret war. (`world/factions/dulgarum-oathholds/locations/khargun-dur.md#L16`)
- `role_in_faction`:
  - Headquarters — Khargun-dur (`world/factions/dulgarum-oathholds/_overview.md#L113`)
- `setting_description`:
  - Carved into a mountain spine. (`world/factions/dulgarum-oathholds/locations/khargun-dur.md#L16`)
- `type`:
  - Capital city (`world/factions/dulgarum-oathholds/locations/khargun-dur.md#L8`)

### Lore Inconsistencies Checker

- `conflict_adjudication_example_llm_provider`:
  - openai (`scripts/lore_inconsistencies_README.md#L67`)
- `conflict_adjudication_supported`:
  - Can use an LLM to evaluate whether detected conflicts are real. (`scripts/lore_inconsistencies_README.md#L67`)
- `installation_command`:
  - uv sync (`scripts/lore_inconsistencies_README.md#L21`)
- `installation_dependencies_location`:
  - Dependencies are already in pyproject.toml. (`scripts/lore_inconsistencies_README.md#L21`)
- `license`:
  - Same as parent project. (`scripts/lore_inconsistencies_README.md#L247`)
- `offline_example_embedding_provider`:
  - hash (`scripts/lore_inconsistencies_README.md#L31`)
- `offline_example_llm_provider`:
  - none (`scripts/lore_inconsistencies_README.md#L31`)
- `offline_scan_supported`:
  - Can scan the entire repo without using an LLM. (`scripts/lore_inconsistencies_README.md#L31`)
- `review_summary_date`:
  - December 28, 2025 (`scripts/LORE_REVIEW.md#L1`)
- `review_summary_reviewer`:
  - GitHub Copilot (Claude Sonnet 4.5) (`scripts/LORE_REVIEW.md#L1`)
- `review_summary_script_path`:
  - dnd/scripts/lore_inconsistencies.py (`scripts/LORE_REVIEW.md#L1`)
- `scan_specific_folders_supported`:
  - Supports scanning specific folders via --roots. (`scripts/lore_inconsistencies_README.md#L56`)
- `testing_command`:
  - pytest scripts/tests/test_lore_inconsistencies.py -v (`scripts/lore_inconsistencies_README.md#L212`)
- `tests_cover`:
  - CSV parsing; hash embedding consistency and normalization; Markdown chunking with headings and code blocks; TSV parsing; entity discovery; excerpt rendering. (`scripts/lore_inconsistencies_README.md#L212`)
- `troubleshooting_chromadb_persistence_errors`:
  - If persistence errors occur, remove .output/chroma and run the script with --reindex. (`scripts/lore_inconsistencies_README.md#L190`)

### Lore Inconsistencies Script - Review Summary

- `benchmark_result`:
  - 20 files, 241 chunks, 10 entities: < 1 second (hash embeddings, no LLM) (`scripts/LORE_REVIEW.md#L112`)
- `disk_characteristic`:
  - Persistent vector DB enables fast incremental runs (`scripts/LORE_REVIEW.md#L112`)
- `document_title`:
  - Lore Inconsistencies Script - Review Summary (`scripts/LORE_REVIEW.md#L1`)
- `improvements_documentation_and_testing`:
  - Documentation and testing (`scripts/LORE_REVIEW.md#L177`)
- `improvements_entity_discovery_quality`:
  - Entity discovery quality (`scripts/LORE_REVIEW.md#L177`)
- `improvements_error_handling_and_recovery`:
  - Error handling and recovery (`scripts/LORE_REVIEW.md#L177`)
- `improvements_robustness_edge_cases`:
  - Robustness with edge cases (`scripts/LORE_REVIEW.md#L177`)
- `license`:
  - Same as parent project. (`scripts/lore_inconsistencies_README.md#L247`)
- `memory_characteristic`:
  - Moderate (ChromaDB in-memory working set) (`scripts/LORE_REVIEW.md#L112`)
- `minor_issue_limited_logging`:
  - Limited logging (uses print/stderr - could use logging module) (`scripts/LORE_REVIEW.md#L133`)
- `minor_issue_long_functions`:
  - Some functions are long (100+ lines) - could be split (`scripts/LORE_REVIEW.md#L133`)
- `minor_issue_no_progress_feedback`:
  - No progress feedback during long operations (`scripts/LORE_REVIEW.md#L133`)
- `overall_assessment`:
  - functional and well-designed overall, with a clear purpose and solid architecture (`scripts/LORE_REVIEW.md#L7`)
- `project_tests_status`:
  - 34/36 project tests pass (2 skipped due to missing fonts) (`scripts/LORE_REVIEW.md#L23`)
- `review_date`:
  - December 28, 2025 (`scripts/LORE_REVIEW.md#L1`)
- `reviewer`:
  - GitHub Copilot (Claude Sonnet 4.5) (`scripts/LORE_REVIEW.md#L1`)
- `script_function_detects_potential_lore_conflicts`:
  - Detects potential lore conflicts (`scripts/LORE_REVIEW.md#L11`)
- `script_function_discovers_entities`:
  - Discovers entities from documentation (`scripts/LORE_REVIEW.md#L11`)
- `script_function_extracts_claims_with_optional_llm`:
  - Extracts claims about entities using optional LLM integration (`scripts/LORE_REVIEW.md#L11`)
- `script_function_generates_markdown_reports`:
  - Generates comprehensive Markdown reports (`scripts/LORE_REVIEW.md#L11`)
- `script_function_indexes_markdown_and_tsv_into_chromadb`:
  - Indexes Markdown files and TSV history files into ChromaDB (`scripts/LORE_REVIEW.md#L11`)
- `script_function_uses_vector_embeddings_for_semantic_search`:
  - Uses vector embeddings (hash-based or OpenAI) for semantic search (`scripts/LORE_REVIEW.md#L11`)
- `script_path`:
  - dnd/scripts/lore_inconsistencies.py (`scripts/LORE_REVIEW.md#L1`)
- `test_run_initial_pass_rate`:
  - 100% pass rate on initial run (`scripts/LORE_REVIEW.md#L23`)
- `tests_created_count`:
  - 20 new tests (`scripts/LORE_REVIEW.md#L23`)

### MCP Servers (Local)

- `folder_contents`:
  - This folder contains MCP servers that expose repo-local tooling to an MCP-capable client (e.g., Codex). (`scripts/mcp/README.md#L1`)
- `run_behavior`:
  - Running `make mcp` starts `scripts/mcp/server.py` over stdio. (`scripts/mcp/README.md#L5`)
- `run_command`:
  - Run with `make mcp`. (`scripts/mcp/README.md#L5`)
- `vscode_log_location`:
  - Check `View -> Output -> MCP Server Logs` to confirm `dnd-scripts` started and tools were detected. (`scripts/mcp/README.md#L11`)
- `vscode_registered_server_name`:
  - The workspace MCP config registers the `dnd-scripts` server. (`scripts/mcp/README.md#L11`)
- `vscode_setup_reload_step`:
  - Reload VS Code via Command Palette: `Developer: Reload Window`. (`scripts/mcp/README.md#L11`)
- `vscode_setup_venv_requirement`:
  - Ensure a venv exists at `./venv` (e.g., `uv sync` / `uv venv`). (`scripts/mcp/README.md#L11`)
- `vscode_workspace_mcp_config_path`:
  - .vscode/mcp.json (`scripts/mcp/README.md#L11`)

### Meaning Behind Faction Symbols

- `araethilion_symbol_description`:
  - Araethilion’s symbol is described as a nine-petaled flower, each petal a different shade, with a hollow center. (`adhok_notes/meaning-behind-facitons.symbols.md#L3`)
- `araethilion_symbol_meaning_outsider_view`:
  - Outsiders say you would have to ask an elf of Araethilion to learn what the symbol truly means, and that Araethilion’s people rarely leave their lands. (`adhok_notes/meaning-behind-facitons.symbols.md#L3`)
- `ardenhaven_blue_symbolism`:
  - Blue is said to honor the sea and the rivers that connect Ardenhaven’s towns and carry their people home. (`adhok_notes/meaning-behind-facitons.symbols.md#L6`)
- `ardenhaven_origin_age_of_roads`:
  - Ardenhaven is described as being born into power during the Age of Roads. (`adhok_notes/meaning-behind-facitons.symbols.md#L6`)
- `ardenhaven_spans_both_continents`:
  - Ardenhaven is described as the only faction that truly spans both continents. (`adhok_notes/meaning-behind-facitons.symbols.md#L6`)
- `dulgarum_outsider_characterization`:
  - Dulgarum is described (by outsiders) as royal, solitary, and inward-looking. (`adhok_notes/meaning-behind-facitons.symbols.md#L12`)
- `dulgarum_outsider_view_treaties`:
  - Outsiders say the Holds want to be left alone with their mines and that every “treaty” is really just a wall with better manners. (`adhok_notes/meaning-behind-facitons.symbols.md#L12`)
- `garrok_symbol_outsider_interpretation`:
  - Outsiders describe the Garrok symbol as a shield for strength and an eye for understanding, presented as proof the Garrok are strong, watchful, and capable of being reasoned with. (`adhok_notes/meaning-behind-facitons.symbols.md#L23`)
- `includes_section_araethilion_veiled_crown_theocracy`:
  - The document includes a section titled “Araethilion — Veiled Crown Theocracy.” (`adhok_notes/meaning-behind-facitons.symbols.md#L3`)
- `includes_section_ardenhaven_haven_realm`:
  - The document includes a section titled “Ardenhaven — The Haven Realm.” (`adhok_notes/meaning-behind-facitons.symbols.md#L6`)
- `includes_section_dulgarum_oathbound_holds`:
  - The document includes a section titled “Dulgarum — The Oathbound Holds.” (`adhok_notes/meaning-behind-facitons.symbols.md#L12`)
- `includes_section_garrok_confederation_western_orc_confederation`:
  - The document includes a section titled “Garrok Confederation — Western Orc Confederation.” (`adhok_notes/meaning-behind-facitons.symbols.md#L23`)
- `includes_section_merrowgate_city_of_bargains`:
  - The document includes a section titled “Merrowgate — The City of Bargains.” (`adhok_notes/meaning-behind-facitons.symbols.md#L26`)
- `includes_section_rakthok_horde_eastern_orc_horde`:
  - The document includes a section titled “Rakthok Horde — Eastern Orc Horde.” (`adhok_notes/meaning-behind-facitons.symbols.md#L29`)
- `merrowgate_fair_means_well_written`:
  - In Merrowgate, “fair” is said to often mean “well-written.” (`adhok_notes/meaning-behind-facitons.symbols.md#L26`)
- `merrowgate_fair_trade_nine_guilds`:
  - Merrowgate is described as “Fair trade,” according to the Nine Guilds that run the city-state. (`adhok_notes/meaning-behind-facitons.symbols.md#L26`)
- `rakthok_purple_dye_history`:
  - The royal purple dye is described as once prized across the world and now rare enough to feel like a legend. (`adhok_notes/meaning-behind-facitons.symbols.md#L29`)
- `rakthok_purple_marks_wealth_and_rank`:
  - Rakthok’s royal purple is described as marking wealth and rank. (`adhok_notes/meaning-behind-facitons.symbols.md#L29`)
- `rakthok_royal_purple_bog_snails`:
  - Rakthok uses royal purple said to be brewed from bog-snails. (`adhok_notes/meaning-behind-facitons.symbols.md#L29`)
- `rakthok_symbol_axes_represent_might`:
  - Rakthok’s symbol includes axes to represent might. (`adhok_notes/meaning-behind-facitons.symbols.md#L29`)

### players notes

- `dm_reviews_player_session_notes`:
  - The DM will review player session notes and add any missing details. (`CONTRIBUTING.md#L13`)
- `players_encouraged_to_help_with_session_notes`:
  - Players are encouraged to help with session notes. (`CONTRIBUTING.md#L13`)
- `previous_session_notes_used_as_reference_material`:
  - Previous session notes are listed as reference materials in session planning. (`templates/session-planning-template.md#L169`)
- `session_notes_process_copy_template`:
  - To take session notes, players copy `/templates/session-notes-template.md`. (`CONTRIBUTING.md#L13`)
- `session_notes_process_fill_in_what_you_remember`:
  - Players fill in what they remember in the session notes. (`CONTRIBUTING.md#L13`)
- `session_notes_process_save_path_pattern`:
  - Session notes are saved to `/sessions/notes/session-XX-YYYY-MM-DD.md`. (`CONTRIBUTING.md#L13`)

### Quests

- `directory_purpose`:
  - This directory contains all quest and adventure information. (`quests/README.md#L1`)
- `faction_template_quests_offered_links_to_active_quests`:
  - The faction template's 'Quests Offered' section includes links to quests in ../quests/active/ (example: ../quests/active/quest-name.md). (`templates/faction-template.md#L160`)
- `quest_type_faction_definition`:
  - Faction quests are missions given by or related to specific factions. (`quests/README.md#L48`)
- `quest_type_main_definition`:
  - Main quests are major storyline quests that advance the campaign's primary narrative. (`quests/README.md#L39`)
- `quest_type_personal_definition`:
  - Personal quests are quests tied to specific character backstories or goals. (`quests/README.md#L45`)
- `quest_type_side_definition`:
  - Side quests are optional adventures that provide character development, world-building, or additional rewards. (`quests/README.md#L42`)
- `quick_link_active_quests`:
  - active/ (`quests/README.md#L51`)
- `quick_link_completed_quests`:
  - completed/ (`quests/README.md#L51`)
- `quick_link_quest_template`:
  - ../templates/quest-template.md (`quests/README.md#L51`)
- `quick_link_side_quests`:
  - side-quests/ (`quests/README.md#L51`)
- `structure_active_dir_description`:
  - The active/ directory contains current, ongoing quests. (`quests/README.md#L5`)
- `structure_completed_dir_description`:
  - The completed/ directory contains finished quests. (`quests/README.md#L5`)
- `structure_side_quests_dir_description`:
  - The side-quests/ directory contains optional adventures. (`quests/README.md#L5`)

### Quick Start Guide

- `ai_follows_repo_structure_and_conventions`:
  - States that the AI will follow the repository's structure and conventions. (`QUICK-START.md#L130`)
- `chat_with_ai_example_prompt_add_magical_sword`:
  - Provides the example prompt: "Add a magical sword to the items folder". (`QUICK-START.md#L130`)
- `chat_with_ai_example_prompt_create_session_notes`:
  - Provides the example prompt: "Create session notes for today's game". (`QUICK-START.md#L130`)
- `chat_with_ai_example_prompt_level_3_fighter`:
  - Provides the example prompt: "Create a level 3 fighter character using the template". (`QUICK-START.md#L130`)
- `chat_with_ai_example_prompt_missing_caravans_quest`:
  - Provides the example prompt: "Generate a quest for investigating missing caravans". (`QUICK-START.md#L130`)
- `copilot_example_prompt`:
  - Provides the example prompt: "Create a new NPC tavern keeper". (`QUICK-START.md#L124`)
- `copilot_follows_structure_and_templates`:
  - States that Copilot will follow the structure and use templates. (`QUICK-START.md#L124`)
- `copilot_reads_instructions_file`:
  - States that GitHub Copilot automatically reads `.github/copilot-instructions.md`. (`QUICK-START.md#L124`)
- `during_session_notes_include_combat_outcomes`:
  - Lists "Combat outcomes" as a note item to capture during the session. (`QUICK-START.md#L157`)
- `during_session_notes_include_important_decisions`:
  - Lists "Important decisions" as a note item to capture during the session. (`QUICK-START.md#L157`)
- `during_session_notes_include_loot_acquired`:
  - Lists "Loot acquired" as a note item to capture during the session. (`QUICK-START.md#L157`)
- `during_session_notes_include_new_npcs_met`:
  - Lists "New NPCs met" as a note item to capture during the session. (`QUICK-START.md#L157`)
- `during_session_take_notes`:
  - Recommends taking notes during the session and keeping them brief during play. (`QUICK-START.md#L157`)
- `need_help_links_example_location`:
  - Links to an Example Location at `world/factions/ardenhaven/locations/example-rusty-dragon-inn.md`. (`QUICK-START.md#L198`)
- `need_help_links_example_npc`:
  - Links to an Example NPC at `characters/npcs/example-innkeeper.md`. (`QUICK-START.md#L198`)
- `need_help_links_example_quest`:
  - Links to an Example Quest at `quests/active/example-goblin-raid.md`. (`QUICK-START.md#L198`)
- `need_help_recommends_example_files`:
  - Directs readers to check the example files. (`QUICK-START.md#L198`)
- `purpose`:
  - Helps you get started quickly with a D&D 5.5e campaign management system. (`QUICK-START.md#L1`)
- `section_chat_with_ai`:
  - Contains a subsection titled "Chat with AI" under "Working with AI Assistants". (`QUICK-START.md#L130`)
- `section_example_workflow_during_session`:
  - Contains a subsection titled "During the Session" under "Example Workflow: Running a Session". (`QUICK-START.md#L157`)
- `section_github_copilot`:
  - Contains a subsection titled "GitHub Copilot" under "Working with AI Assistants". (`QUICK-START.md#L124`)
- `section_need_help`:
  - Contains a section titled "Need Help?". (`QUICK-START.md#L198`)
- `section_see_also`:
  - Contains a section titled "See Also". (`QUICK-START.md#L192`)
- `section_start_creating_content`:
  - Contains a section titled "3. Start Creating Content". (`QUICK-START.md#L26`)
- `section_tips_for_success`:
  - Contains a section titled "Tips for Success". (`QUICK-START.md#L184`)
- `see_also_includes_copilot_instructions_link`:
  - Links to `.github/copilot-instructions.md` described as an AI assistant guide. (`QUICK-START.md#L192`)
- `see_also_includes_full_readme_link`:
  - Links to "Full README" (README.md) described as complete documentation. (`QUICK-START.md#L192`)
- `see_also_includes_templates_readme_link`:
  - Links to "Templates README" (templates/README.md) described as template details. (`QUICK-START.md#L192`)
- `templates_have_comments_and_examples`:
  - States that each template has comments and examples to guide you. (`QUICK-START.md#L198`)
- `tips_for_success_be_consistent`:
  - Includes the tip: "Be consistent" (Use templates and follow naming conventions). (`QUICK-START.md#L184`)
- `tips_for_success_link_often`:
  - Includes the tip: "Link often" (Connect related content). (`QUICK-START.md#L184`)
- `tips_for_success_start_small`:
  - Includes the tip: "Start small" (Don't try to document everything at once). (`QUICK-START.md#L184`)
- `tips_for_success_update_regularly`:
  - Includes the tip: "Update regularly" (Keep information current after each session). (`QUICK-START.md#L184`)
- `tips_for_success_use_examples`:
  - Includes the tip: "Use examples" (Check the example files for inspiration). (`QUICK-START.md#L184`)
- `title`:
  - Quick Start Guide (`QUICK-START.md#L1`)

### Rules

- `directory_contents`:
  - This directory contains house rules, quick references, and game mechanics notes. (`rules/README.md#L1`)
- `house_rules_section_scope`:
  - House Rules document deviations from standard D&D 5.5e rules, including modified mechanics, homebrew systems, table conventions, character creation rules, death and resurrection rules, and resting variants. (`rules/README.md#L19`)
- `mechanics_notes_examples`:
  - Mechanics notes include detailed explanations of crafting systems, downtime activities, social interactions, and magic item creation. (`rules/README.md#L41`)
- `purpose`:
  - Helps maintain consistency and provides quick access to campaign-specific rule modifications, frequently referenced mechanics, clarifications on ambiguous rules, and commonly used procedures. (`rules/README.md#L11`)
- `quick_links`:
  - Includes links to House Rules (house-rules/), References (references/), and Mechanics (mechanics/). (`rules/README.md#L50`)
- `quick_references_examples`:
  - Quick references include combat action summary, condition effects, skill check DCs, travel pace and distance, encumbrance rules, and cover and concealment. (`rules/README.md#L30`)
- `structure_house_rules_dir`:
  - house-rules/ contains custom rules specific to this campaign. (`rules/README.md#L5`)
- `structure_mechanics_dir`:
  - mechanics/ contains notes on specific game mechanics. (`rules/README.md#L5`)
- `structure_references_dir`:
  - references/ contains quick reference guides and cheat sheets. (`rules/README.md#L5`)

### Session [Number] - [Date]

- `date_played_field`:
  - YYYY-MM-DD (`templates/session-notes-template.md#L1`)
- `has_section`:
  - Session Summary (`templates/session-notes-template.md#L14`)
  - Related Links (`templates/session-notes-template.md#L120`)
- `related_link_label`:
  - Previous Session (`templates/session-notes-template.md#L120`)
  - Next Session (`templates/session-notes-template.md#L120`)
  - Campaign Home (`templates/session-notes-template.md#L120`)
- `session_number_field`:
  - XX (`templates/session-notes-template.md#L1`)
- `tags`:
  - #session (`templates/session-notes-template.md#L1`)
- `title_format`:
  - Session [Number] - [Date] (`templates/session-notes-template.md#L1`)

### Session [Number] Planning - [Date]

- `has_field_expected_duration`:
  - X hours (`templates/session-planning-template.md#L1`)
- `has_field_planned_date`:
  - YYYY-MM-DD (`templates/session-planning-template.md#L1`)
- `has_field_session_number`:
  - XX (`templates/session-planning-template.md#L1`)
- `has_section_backup_plans_if_session_goes_long`:
  - If Session Goes Long (`templates/session-planning-template.md#L218`)
- `has_section_backup_plans_if_session_goes_short`:
  - If Session Goes Short (`templates/session-planning-template.md#L214`)
- `has_section_planned_story_beats_potential_climax`:
  - Potential Climax (`templates/session-planning-template.md#L52`)
- `has_section_post_session_notes`:
  - Post-Session Notes (`templates/session-planning-template.md#L226`)
- `has_section_session_goals`:
  - Session Goals (`templates/session-planning-template.md#L8`)
- `has_subsection_post_session_notes_for_next_session`:
  - For Next Session (`templates/session-planning-template.md#L236`)
- `if_session_goes_long_prompt`:
  - What can be cut or moved to next session: (`templates/session-planning-template.md#L218`)
- `if_session_goes_short_prompt`:
  - Additional content to extend if needed: (`templates/session-planning-template.md#L214`)
- `post_session_notes_instruction`:
  - Fill this out after the session: (`templates/session-planning-template.md#L226`)
- `potential_climax_description`:
  - Likely high point of the session. (`templates/session-planning-template.md#L52`)
- `session_goals_prompt`:
  - What do you want to accomplish this session? (`templates/session-planning-template.md#L8`)
- `tags`:
  - #session #planning (`templates/session-planning-template.md#L1`)
- `title_format`:
  - Session [Number] Planning - [Date] (`templates/session-planning-template.md#L1`)

### Sessions

- `best_practice_include_date_played`:
  - Include date played (`sessions/README.md#L25`)
- `best_practice_link_related_quests_locations`:
  - Link to related quests and locations (`sessions/README.md#L25`)
- `best_practice_note_cliffhangers`:
  - Note cliffhangers and unresolved threads (`sessions/README.md#L25`)
- `best_practice_number_sessions_consistently`:
  - Number sessions consistently (`sessions/README.md#L25`)
- `best_practice_track_xp_and_loot`:
  - Track XP and loot awarded (`sessions/README.md#L25`)
- `best_practice_update_character_info`:
  - Update character information after significant events (`sessions/README.md#L25`)
- `co_dm_collaboration_step_add_notes`:
  - Add notes or suggestions (`CONTRIBUTING.md#L42`)
- `co_dm_collaboration_step_coordinate_preparation`:
  - Coordinate who's preparing what (`CONTRIBUTING.md#L42`)
- `co_dm_collaboration_step_review_path`:
  - Review /sessions/planning/ for upcoming sessions (`CONTRIBUTING.md#L42`)
- `contains`:
  - session notes, planning documents, and campaign archives (`sessions/README.md#L1`)
- `planning_filename_format`:
  - session-XX-planning.md (`sessions/README.md#L19`)
- `planning_guideline_prepare`:
  - Prepare encounters, NPCs, and story beats (`sessions/README.md#L19`)
- `planning_guideline_review`:
  - Review player hooks and pacing (`sessions/README.md#L19`)
- `planning_save_directory`:
  - planning/ (`sessions/README.md#L19`)
- `planning_template_path`:
  - /templates/session-planning-template.md (`sessions/README.md#L19`)
- `recording_filename_format`:
  - session-XX-YYYY-MM-DD.md (`sessions/README.md#L13`)
- `recording_guideline_fill_timing`:
  - Fill out during or immediately after the session (`sessions/README.md#L13`)
- `recording_guideline_link_entities`:
  - Link to characters, locations, and quests involved (`sessions/README.md#L13`)
- `recording_save_directory`:
  - notes/ (`sessions/README.md#L13`)
- `recording_template_path`:
  - /templates/session-notes-template.md (`sessions/README.md#L13`)
- `session_numbering_example_1`:
  - session-01-2024-03-15.md (`sessions/README.md#L33`)
- `session_numbering_example_2`:
  - session-02-2024-03-22.md (`sessions/README.md#L33`)
- `structure_archive_directory_purpose`:
  - Old campaigns or completed story arcs (`sessions/README.md#L5`)
- `structure_notes_directory_purpose`:
  - Session recaps and summaries (what happened) (`sessions/README.md#L5`)
- `structure_planning_directory_purpose`:
  - Upcoming session preparation (what will happen) (`sessions/README.md#L5`)
- `where_things_go_sessions_archive`:
  - /sessions/archive (old) (`AGENTS.md#L10`)
- `where_things_go_sessions_notes`:
  - /sessions/notes (new) (`AGENTS.md#L10`)
- `where_things_go_sessions_planning`:
  - /sessions/planning (upcoming) (`AGENTS.md#L10`)

### Spork of Dining +1

- `attunement`:
  - Not Required (`items/magic-items/spork-of-dining-plus-1.md#L7`)
- `created_date`:
  - 2025-12-07 (`items/magic-items/spork-of-dining-plus-1.md#L1`)
- `detect_poison_always_active`:
  - Detect Poison property is always active and requires no action (`items/magic-items/spork-of-dining-plus-1.md#L45`)
- `detect_poison_indicator`:
  - Runes on the handle glow red if the spork touches poisoned food or drink (`items/magic-items/spork-of-dining-plus-1.md#L45`)
- `enhanced_utility_function`:
  - Functions as both a fork and spoon simultaneously (`items/magic-items/spork-of-dining-plus-1.md#L33`)
- `food_taste_effect`:
  - Food eaten with this spork tastes 10% better (`items/magic-items/spork-of-dining-plus-1.md#L33`)
- `food_temperature_effect`:
  - Food eaten with this spork is always at the perfect temperature (`items/magic-items/spork-of-dining-plus-1.md#L33`)
- `last_modified_date`:
  - 2025-12-07 (`items/magic-items/spork-of-dining-plus-1.md#L1`)
- `lore_creation_process`:
  - Legend says it was born after countless experiments combining utility with combat practicality (`items/magic-items/spork-of-dining-plus-1.md#L49`)
- `lore_origin_story`:
  - Legend says it was created by an eccentric wizard-chef who grew tired of carrying multiple utensils on adventures (`items/magic-items/spork-of-dining-plus-1.md#L49`)
- `lore_popularity_group`:
  - They became popular among adventuring gourmands who refused to sacrifice fine dining for dungeon delving (`items/magic-items/spork-of-dining-plus-1.md#L49`)
- `note_efficiency`:
  - Perfect for adventurers who value efficiency (`items/magic-items/spork-of-dining-plus-1.md#L53`)
- `note_popularity`:
  - Popular among halfling adventurers and traveling merchants (`items/magic-items/spork-of-dining-plus-1.md#L53`)
- `note_tavern_discounts`:
  - Some taverns offer discounts to patrons who provide their own enchanted cutlery (`items/magic-items/spork-of-dining-plus-1.md#L53`)
- `note_weapon_use`:
  - Can be used as a credible (if amusing) weapon in a pinch (`items/magic-items/spork-of-dining-plus-1.md#L53`)
- `prestidigitation_cleaning_action`:
  - While holding the spork, you can use a bonus action to clean it perfectly, removing all food residue and grime (`items/magic-items/spork-of-dining-plus-1.md#L41`)
- `prestidigitation_seasoning_effect`:
  - While holding the spork, you can use a bonus action to season food with salt, pepper, or other common spices (`items/magic-items/spork-of-dining-plus-1.md#L41`)
- `rarity`:
  - Uncommon (`items/magic-items/spork-of-dining-plus-1.md#L7`)
- `tags`:
  - #item, #magic-item, #weapon, #wondrous-item (`items/magic-items/spork-of-dining-plus-1.md#L1`)
- `type`:
  - Weapon (Simple Melee Weapon) / Wondrous Item (`items/magic-items/spork-of-dining-plus-1.md#L7`)
- `value_gp`:
  - 150 gp (`items/magic-items/spork-of-dining-plus-1.md#L7`)
- `weapon_bonus`:
  - +1 bonus to attack and damage rolls made with this magic weapon (`items/magic-items/spork-of-dining-plus-1.md#L37`)
- `weight`:
  - 0.5 lbs (`items/magic-items/spork-of-dining-plus-1.md#L7`)

### Templates

- `common_sections_detailed_sections`:
  - All templates include Detailed Sections with complete information. (`templates/README.md#L26`)
- `common_sections_metadata`:
  - All templates include Metadata such as dates, status, and key attributes. (`templates/README.md#L26`)
- `common_sections_quick_reference`:
  - All templates include a Quick Reference section for important information at a glance. (`templates/README.md#L26`)
- `common_sections_related_links`:
  - All templates include Related Links connecting to other documents. (`templates/README.md#L26`)
- `common_sections_tags`:
  - All templates include Tags for organization and searching. (`templates/README.md#L26`)
- `custom_template_process_document_in_readme`:
  - To create a custom template, document it in the templates README. (`templates/README.md#L51`)
- `custom_template_process_modify_sections`:
  - To create a custom template, modify sections to fit your needs. (`templates/README.md#L51`)
- `custom_template_process_save_in_directory`:
  - To create a custom template, save the new template in the templates directory. (`templates/README.md#L51`)
- `custom_template_process_start_similar`:
  - To create a custom template, start with the most similar existing template. (`templates/README.md#L51`)
- `custom_template_process_update_copilot_instructions`:
  - To create a custom template, update `.github/copilot-instructions.md`. (`templates/README.md#L51`)
- `customization_allowed_add_sections`:
  - Templates can be customized by adding sections as needed for the campaign. (`templates/README.md#L35`)
- `customization_allowed_create_new_templates`:
  - New templates can be created for unique content types. (`templates/README.md#L35`)
- `customization_allowed_modify_style`:
  - Templates can be customized by modifying them to fit your style. (`templates/README.md#L35`)
- `customization_allowed_remove_sections`:
  - Templates can be customized by removing sections that aren't relevant. (`templates/README.md#L35`)
- `directory_purpose`:
  - Contains all templates used for creating consistent content throughout the campaign. (`templates/README.md#L1`)
- `location_template_dangers_hazards_description`:
  - The "Dangers & Hazards" section covers environmental hazards, threats, or dangerous creatures in the area. (`templates/location-template.md#L123`)
- `location_template_section_dangers_hazards`:
  - The location template includes a section titled "Dangers & Hazards". (`templates/location-template.md#L123`)
- `templates_available_character`:
  - A Character Template is available at `templates/character-template.md`. (`README.md#L60`)
- `templates_available_creature`:
  - A Creature Template is available at `templates/creature-template.md`. (`README.md#L60`)
- `templates_available_faction`:
  - A Faction Template is available at `templates/faction-template.md`. (`README.md#L60`)
- `templates_available_item`:
  - An Item Template is available at `templates/item-template.md`. (`README.md#L60`)
- `templates_available_location`:
  - A Location Template is available at `templates/location-template.md`. (`README.md#L60`)
- `templates_available_quest`:
  - A Quest Template is available at `templates/quest-template.md`. (`README.md#L60`)
- `templates_available_session_notes`:
  - A Session Notes Template is available at `templates/session-notes-template.md`. (`README.md#L60`)
- `templates_available_session_planning`:
  - A Session Planning Template is available at `templates/session-planning-template.md`. (`README.md#L60`)
- `templates_directory_location`:
  - All templates are in the `/templates` directory. (`README.md#L44`)
- `usage_instruction_copy_not_edit`:
  - Users should copy the template and not edit the template files directly. (`templates/README.md#L18`)
- `usage_instruction_fill_sections`:
  - Users should fill in the sections and complete all relevant sections. (`templates/README.md#L18`)
- `usage_instruction_link_related_content`:
  - Users should link related content and connect to other documents. (`templates/README.md#L18`)
- `usage_instruction_rename_kebab_case`:
  - Users should rename the file using descriptive, kebab-case names. (`templates/README.md#L18`)
- `usage_instruction_save_correct_location`:
  - Users should save to the correct location and follow the directory structure. (`templates/README.md#L18`)

### The Living God

- `appearance_age`:
  - Appears forever in her prime (`world/factions/araethilion/the-living-god.md#L1`)
- `awareness_requires_reports`:
  - The Divinely Touched understand she requires them to report events and observations to maintain her awareness of the world (`world/factions/araethilion/the-living-god.md#L21`)
- `cleric_channeling_attention`:
  - Individual clerics can channel divine magic from her without attracting her direct attention (`world/factions/araethilion/the-living-god.md#L21`)
- `cleric_independence_condition`:
  - Elaerith will not know what clerics do unless they report or unless she specifically seeks them out through the Silver Thread (`world/factions/araethilion/the-living-god.md#L21`)
- `court_clerics_perception`:
  - Court clerics in the inner rings are treated with deep awe and assumed to speak for her (`world/factions/araethilion/the-living-god.md#L99`)
- `court_clerics_traits`:
  - Court clerics are described as living proof of her favor, with beauty almost painful to look upon and voices soft and certain (`world/factions/araethilion/the-living-god.md#L99`)
- `divine_magic_source`:
  - Those touched by her divinity channel their powers directly from her (literal, not metaphorical) (`world/factions/araethilion/the-living-god.md#L1`)
- `divinely_touched_ring`:
  - Divinely Touched (Clerics) are the 9th ring and are described as personal conduits (`world/factions/araethilion/the-living-god.md#L49`)
- `divinely_touched_traits`:
  - Divinely Touched have beauty described as unnerving even among elves and lifespans that blur into millennia (`world/factions/araethilion/the-living-god.md#L49`)
- `exchange_for_devotion`:
  - Trades Ardenite devotion for long life and a promised path to the eternal planes (`world/factions/araethilion/the-living-god.md#L1`)
- `favor_born_definition`:
  - A child of a Divinely Touched bound by petition is called a Favor-Born (a cleric by petition, not by proving) (`world/factions/araethilion/the-living-god.md#L49`)
- `lifebloom_called_is_chosen`:
  - To be called to the Lifebloom Ritual is to be chosen (`world/factions/araethilion/the-living-god.md#L19`)
- `lifebloom_ritual_function`:
  - The Lifebloom Ritual establishes a connection that transforms clerics into conduits of her power (`world/factions/araethilion/the-living-god.md#L1`)
- `name`:
  - Elaerith (`world/factions/araethilion/the-living-god.md#L1`)
- `nine_rings_structure`:
  - Her courts are organized as 'The Nine Rings of Proximity' (`world/factions/araethilion/the-living-god.md#L49`)
- `omniscience_common_belief`:
  - Common Ardenites believe Elaerith is all-knowing (`world/factions/araethilion/the-living-god.md#L21`)
- `perceived_eternity_in_history`:
  - The oldest elves cannot name a time without Elaerith's light, woven into the first songs of creation (`world/factions/araethilion/the-living-god.md#L1`)
- `portraits_consistency`:
  - Every portrait captures the same serene face (`world/factions/araethilion/the-living-god.md#L1`)
- `pronunciation`:
  - eh-LAIR-ith (`world/factions/araethilion/the-living-god.md#L1`)
- `regional_ceremony_meaning`:
  - To attend a regional ceremony is simply to remain faithful (`world/factions/araethilion/the-living-god.md#L19`)
- `role_to_ardenites`:
  - Both sovereign and savior (`world/factions/araethilion/the-living-god.md#L1`)
- `severance_can_be_temporary`:
  - If she is forgiving, Severance is temporary and she can restore the thread after seconds or minutes (`world/factions/araethilion/the-living-god.md#L75`)
- `severance_effect_withdrawal`:
  - Severance is comparable to severe withdrawal and causes overwhelming loneliness and isolation (`world/factions/araethilion/the-living-god.md#L75`)
- `severance_high_age_risk`:
  - Divinely Touched who have lived for centuries often die the fastest after Severance (`world/factions/araethilion/the-living-god.md#L75`)
- `severance_mortality`:
  - Many do not survive Severance; the body weakens rapidly without her sustaining flow (`world/factions/araethilion/the-living-god.md#L75`)
- `severance_requires_presence`:
  - To sever the Silver Thread, the accused must be brought before her and made to kneel; only then can she undo the Lifebloom Ritual (`world/factions/araethilion/the-living-god.md#L75`)
- `silver_thread_severance_distance_limit`:
  - Elaerith cannot sever the Silver Thread from a distance (`world/factions/araethilion/the-living-god.md#L75`)
- `status`:
  - A living god (`world/factions/araethilion/the-living-god.md#L1`)
- `worshipped_by`:
  - Ardenites (`world/factions/araethilion/the-living-god.md#L1`, `world/factions/araethilion/the-living-god.md#L21`)

### The Reckoning of the Fall

- `accord_day_date`:
  - 12 Veleara. (`world/calendar-reckoning-of-the-fall.md#L89`)
- `accord_day_meaning`:
  - Celebrates the signing of the Pentarch Accords in 4,200 A.F., ending the Imperial Wars. (`world/calendar-reckoning-of-the-fall.md#L89`)
- `current_year`:
  - 4,327 A.F. (`world/calendar-reckoning-of-the-fall.md#L153`, `world/calendar-reckoning-of-the-fall.md#L8`)
- `dating_system_label`:
  - Dates use the A.F. (After the Fall) system. (`world/calendar-reckoning-of-the-fall.md#L8`)
- `day_of_ashes_date`:
  - 1 Arumel. (`world/calendar-reckoning-of-the-fall.md#L84`)
- `day_of_ashes_meaning`:
  - Commemorates the fall of Ao Sathanum; a solemn day of remembrance and warning. (`world/calendar-reckoning-of-the-fall.md#L84`)
- `elven_external_calendar_usage`:
  - Elves (Araethilion) use the same months and A.F. system for external communication. (`world/calendar-reckoning-of-the-fall.md#L172`)
- `harvest_feast_date`:
  - 15 Saraenos. (`world/calendar-reckoning-of-the-fall.md#L99`)
- `harvest_feast_meaning`:
  - Celebration of the year's bounty. (`world/calendar-reckoning-of-the-fall.md#L99`)
- `key_date_fall_of_ao_sathanum`:
  - 1 A.F. — The Fall of Ao Sathanum; the ancient empire collapses. (`world/calendar-reckoning-of-the-fall.md#L153`)
- `key_date_first_dwarven_holds_elven_enclaves`:
  - ~600 A.F. — First dwarven holds delved; elven enclaves founded. (`world/calendar-reckoning-of-the-fall.md#L153`)
- `key_date_pentarch_accords`:
  - 4,200 A.F. — The Pentarch Accords signed; modern political order established. (`world/calendar-reckoning-of-the-fall.md#L153`)
- `key_date_rise_early_human_kingdoms`:
  - ~900 A.F. — Rise of early human kingdoms. (`world/calendar-reckoning-of-the-fall.md#L153`)
- `key_period_imperial_wars`:
  - 4,150–4,199 A.F. — The Imperial Wars; Calderon Imperium expands aggressively. (`world/calendar-reckoning-of-the-fall.md#L153`)
- `key_period_scattering`:
  - ~200–400 A.F. — The Scattering; surviving cultures migrate and establish early settlements. (`world/calendar-reckoning-of-the-fall.md#L153`)
- `long_night_date`:
  - 30 Aneumos. (`world/calendar-reckoning-of-the-fall.md#L94`)
- `long_night_meaning`:
  - The longest night; a time to honor the dead and prepare for the year ahead. (`world/calendar-reckoning-of-the-fall.md#L94`)
- `pentarch_accords_signing_year`:
  - 4,200 A.F. (`world/calendar-reckoning-of-the-fall.md#L153`, `world/calendar-reckoning-of-the-fall.md#L8`, `world/calendar-reckoning-of-the-fall.md#L89`)
- `pentarch_accords_time_since_signing`:
  - 127 years ago (relative to the current year stated). (`world/calendar-reckoning-of-the-fall.md#L8`)
- `time_reckoning_origin_event`:
  - Time is measured from the collapse (the Fall) of Ao Sathanum. (`world/calendar-reckoning-of-the-fall.md#L8`)
- `turning_date`:
  - 15 Aoruvan. (`world/calendar-reckoning-of-the-fall.md#L104`)
- `turning_meaning`:
  - The sun begins its descent; a day of reflection and bargains. (`world/calendar-reckoning-of-the-fall.md#L104`)
- `year_one_definition`:
  - 1 A.F. marks the first year after Ao Sathanum's destruction. (`world/calendar-reckoning-of-the-fall.md#L8`)

### The Rusty Dragon Inn

- `building_floors`:
  - two-story building (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L17`)
- `construction_material`:
  - well-maintained timber construction with a stone foundation (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L17`)
- `created_date`:
  - 2024-03-15 (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L1`)
- `demographics`:
  - Mix of locals enjoying meals and drinks, travelers passing through, merchants conducting business. (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L71`)
- `entity_type`:
  - inn (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L1`, `world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L17`)
- `ground_floor_uses`:
  - common room and kitchen (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L17`)
- `last_modified_date`:
  - 2024-03-15 (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L1`)
- `location_detail`:
  - Located on the main street of Sandpoint, near the town square. (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L32`)
- `location_town`:
  - Sandpoint (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L17`, `world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L32`)
- `name_origin`:
  - The name comes from Gareth's encounter with a rust-colored dragon during his adventuring days. (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L23`)
- `original_building_use`:
  - Originally a warehouse that fell into disrepair. (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L23`)
- `popularity_claim`:
  - Sandpoint's most popular inn (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L17`)
- `purchase_time_relative`:
  - Twenty years ago (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L23`)
- `purchased_by`:
  - Gareth Ironwood (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L23`)
- `related_link_gareth_ironwood`:
  - Gareth Ironwood (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L151`)
- `renovation_duration`:
  - spent a year renovating it into an inn (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L23`)
- `reputation`:
  - Known for its comfortable beds, hearty meals, and welcoming atmosphere. (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L17`)
- `rumor_goblin_troubles`:
  - Patrons whisper about increased goblin activity near the farms. (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L85`)
- `rumor_haunted_lighthouse`:
  - Local fishermen avoid the old lighthouse after dark. (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L85`)
- `rumor_missing_merchant`:
  - A merchant's caravan is overdue from the north. (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L85`)
- `rumor_old_ruins`:
  - Gareth sometimes mentions ancient ruins in the hinterlands. (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L85`)
- `second_floor_uses`:
  - guest rooms (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L17`)
- `sign_description`:
  - Weathered wooden sign depicting a red dragon perched atop a pile of rusted armor and weapons. (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L17`)
- `stable_capacity`:
  - A small stable out back can accommodate up to six horses. (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L17`)
- `status_in_town`:
  - Has become the premier lodging establishment in Sandpoint. (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L23`)
- `tags`:
  - #location #inn #sandpoint (`world/factions/ardenhaven/locations/example-rusty-dragon-inn.md#L1`)

### Timeline SVG + History System (Agent Notes)

- `config_defines_views`:
  - `_history.config.toml` defines one or more `[[views]]`. (`scripts/timeline_svg/AGENTS.md#L6`)
- `debug_preprocessed_exports_path`:
  - Preprocessed TSV exports are written under `.output/history/` for inspection/debugging. (`scripts/timeline_svg/README.md#L16`)
- `history_data_file_name`:
  - Any folder under `world/` may contain `_history.tsv` history data files. (`scripts/timeline_svg/AGENTS.md#L40`, `scripts/timeline_svg/AGENTS.md#L6`)
- `legacy_demo_input_path`:
  - In legacy/demo mode, the input TSV (created if missing) is `.timeline_data/timeline.tsv`. (`scripts/timeline_svg/README.md#L16`)
- `legacy_demo_output_path`:
  - In legacy/demo mode, the output SVG is `output/timeline.svg`. (`scripts/timeline_svg/README.md#L16`)
- `missing_tag_icons_render_unknown`:
  - Missing tag icons render as the “unknown” marker. (`scripts/timeline_svg/AGENTS.md#L35`)
- `per_scope_config_file_name`:
  - `_history.config.toml` in any `world/**` folder controls which SVG views get rendered for that scope (that folder + subfolders). (`scripts/timeline_svg/AGENTS.md#L40`)
- `present_year_config_option`:
  - An optional `present_year` value (e.g. `present_year = 4327`) can be set at the top of `world/_history.config.toml` to extend axis/ticks to “now” for all scopes; sub-scope configs inherit it unless they override. (`scripts/timeline_svg/README.md#L16`)
- `renderer_outputs_svgs_next_to_config`:
  - Running `scripts/build_timeline_svg.py` writes SVGs next to each `_history.config.toml` file (one SVG per `[[views]]` entry). (`scripts/timeline_svg/AGENTS.md#L6`, `scripts/timeline_svg/README.md#L16`)
- `renderer_script_discovers_configs`:
  - `scripts/build_timeline_svg.py` discovers configs recursively under `world/`. (`scripts/timeline_svg/AGENTS.md#L6`, `scripts/timeline_svg/README.md#L16`)
- `rendering_is_scoped`:
  - A config file at `world/X/_history.config.toml` only reads `_history.tsv` (and legacy `_timeline.tsv`) within `world/X/` and its subfolders. (`scripts/timeline_svg/AGENTS.md#L6`)
- `run_command`:
  - Run with `./venv/bin/python scripts/build_timeline_svg.py`. (`scripts/timeline_svg/README.md#L5`)
- `supports_legacy_timeline_tsv`:
  - The system supports legacy `_timeline.tsv` in addition to `_history.tsv`. (`scripts/timeline_svg/AGENTS.md#L6`, `scripts/timeline_svg/README.md#L16`)
- `tag_faction_slug_renders_icon`:
  - Tags may include faction slugs (e.g. `rakthok-horde`) to render the faction icon. (`scripts/timeline_svg/AGENTS.md#L35`)
- `tag_icons_directory`:
  - Other tag icons may be located under `scripts/timeline_svg/assets/tags/`. (`scripts/timeline_svg/AGENTS.md#L35`)
- `uses_tsv_driven_history`:
  - The repo uses TSV-driven history that renders to SVG timelines. (`scripts/timeline_svg/AGENTS.md#L2`)
- `writing_events_reference_faction_inspiration_doc`:
  - When writing new historical events, use faction real-world inspiration notes via `../../world/faction-insperation-sorces.md`. (`scripts/timeline_svg/AGENTS.md#L13`)
- `writing_events_reference_faction_proximity_doc`:
  - When writing new historical events, use faction adjacency/influence via `../../world/faction-proximity-and-influence.md`. (`scripts/timeline_svg/AGENTS.md#L13`)

### Timeline SVG Renderer

- `config_discovery_behavior`:
  - Running scripts/build_timeline_svg.py discovers all _history.config.toml files under world/ (`scripts/timeline_svg/README.md#L16`)
- `current_token_usage`:
  - Rendering uses <use href="#token_default" .../> for now (`scripts/timeline_svg/README.md#L53`)
- `debug_output_description`:
  - Preprocessed TSV exports are written under .output/history/ for inspection/debugging (`scripts/timeline_svg/README.md#L16`)
- `debug_output_directory`:
  - .output/history/ (`scripts/timeline_svg/README.md#L16`)
- `faction_icon_path_pattern`:
  - world/factions/<slug>/icon.svg (`scripts/timeline_svg/README.md#L65`, `scripts/timeline_svg/README.md#L89`)
- `faction_icon_placement`:
  - Faction icons are drawn in the event’s top-right tag strip (`scripts/timeline_svg/README.md#L89`)
- `faction_icon_relative_size`:
  - Faction icons are drawn larger than normal tag icons (`scripts/timeline_svg/README.md#L65`)
- `faction_icon_rendering_condition`:
  - When a matching world/factions/<slug>/icon.svg exists for a faction slug in an event’s tags, the renderer draws that faction icon (`scripts/timeline_svg/README.md#L65`, `scripts/timeline_svg/README.md#L89`)
- `faction_slug_tag_support`:
  - Tags may include faction slugs (e.g. "rakthok-horde") (`scripts/timeline_svg/README.md#L65`)
- `history_event_tags_column`:
  - History events can be tagged via the TSV "tags" column (`scripts/timeline_svg/README.md#L65`)
- `history_system_basis`:
  - TSV-driven history that renders to SVG timelines (`scripts/timeline_svg/AGENTS.md#L2`)
- `history_tsv_filename_convention`:
  - Put "_history.tsv" (or legacy "_timeline.tsv") anywhere under world/ (`scripts/timeline_svg/README.md#L16`)
- `input_format`:
  - TSV timelines generated elsewhere in the repo (`scripts/timeline_svg/README.md#L1`)
- `kind_symbol_mapping_status`:
  - Today all kinds resolve to token_default (`scripts/timeline_svg/README.md#L53`)
- `legacy_input_tsv_path`:
  - .timeline_data/timeline.tsv (`scripts/timeline_svg/README.md#L16`)
- `legacy_output_svg_path`:
  - output/timeline.svg (`scripts/timeline_svg/README.md#L16`)
- `missing_tag_icon_behavior`:
  - Missing tag icons render as an “unknown” marker (`scripts/timeline_svg/README.md#L65`)
- `present_year_config_option`:
  - Optional config setting: present_year = 4327 (or similar) at the top of world/_history.config.toml (`scripts/timeline_svg/README.md#L16`)
- `present_year_effect`:
  - Setting present_year extends axis/ticks to “now” for all scopes; sub-scope configs inherit it unless they override (`scripts/timeline_svg/README.md#L16`)
- `run_command`:
  - ./venv/bin/python scripts/build_timeline_svg.py (`scripts/timeline_svg/README.md#L5`)
- `scope_config_effect`:
  - Putting _history.config.toml in a world/** folder renders SVG views for that folder scope (that folder + subfolders) (`scripts/timeline_svg/README.md#L16`)
- `scope_config_filename`:
  - _history.config.toml (`scripts/timeline_svg/README.md#L16`)
- `svg_output_location`:
  - SVGs are written next to the discovered _history.config.toml files (`scripts/timeline_svg/README.md#L16`)
- `svg_token_definitions_file`:
  - scripts/timeline_svg/templates/defs_symbols.svgfrag (`scripts/timeline_svg/README.md#L53`)
- `tag_appearance_config_file`:
  - scripts/timeline_svg/assets/tags/tags.toml (`scripts/timeline_svg/README.md#L65`)
- `tag_icons_directory`:
  - scripts/timeline_svg/assets/tags/ (`scripts/timeline_svg/README.md#L65`)
- `type`:
  - experimental SVG timeline renderer (`scripts/timeline_svg/README.md#L1`)

### Vorzug Dakmar'nak (VOR-zug DAHK-mar-nak) — “Ledger-Scar”

- `affiliation`:
  - Rakthok Horde (Dakmar'nak) (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12`)
  - Ardenhaven (resident-in-good-standing, pending) (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12`)
- `alignment`:
  - Neutral Good (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12`)
- `appearance_build`:
  - Lean and long-armed for an orc (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L23`)
- `appearance_hands`:
  - Careful hands stained by pitch and iron-black (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L23`)
- `appearance_necklace`:
  - Wears a simple cord necklace bearing a stamped brass tag from the labor camp he refuses to throw away (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L23`)
- `appearance_scar`:
  - A pale band of scar tissue circles his wrists where Garhammar shackles once sat (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L23`)
- `appearance_tusks`:
  - Keeps his tusks filed short (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L23`)
- `backstory_event`:
  - Bazgar Dakmar'nak recognized Vorzug as a “brother” of the tribe—kin by hearth and oath, not blood (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L42`)
  - Bazgar demanded an arbiter and forced foremen to produce the contract that supposedly bound Vorzug (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L42`)
  - The contract that supposedly bound Vorzug did not exist (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L42`)
  - Under League rules, with no contract there was no claim, and Vorzug was allowed to leave (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L42`)
- `bond`:
  - Owes a life-debt to Bazgar (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27`)
  - Still considers himself answerable to the Dakmar'nak Fire Council (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27`)
- `epithet`:
  - Ledger-Scar (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L8`)
- `flaw`:
  - Prideful about competence (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27`)
  - Resents being treated as “muscle” and can turn coldly sarcastic (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27`)
- `ideal`:
  - A spoken oath is breath; a written oath is stone. If you cannot read the stone, it will bury you. (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27`)
- `language`:
  - Orcish (fluent) (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12`)
  - Common (serviceable) (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12`)
  - Dwarven (basic; learned from Bazgar) (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12`)
- `location`:
  - Ardenford (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12`)
- `name`:
  - Vorzug Dakmar'nak (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L8`)
- `occupation_current`:
  - Day laborer on bridge repairs in Ardenford (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L60`)
- `personality_trait`:
  - Watchful (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27`)
  - Patient (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27`)
  - Literal-minded about promises (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27`)
  - Speaks softly until cornered (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L27`)
- `profession`:
  - Engineer (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L8`)
- `pronunciation`:
  - VOR-zug DAHK-mar-nak (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L8`)
- `race`:
  - Orc (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12`)
- `role`:
  - Bridgewright / smith’s helper / labor advocate (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12`)
- `tribe`:
  - Dakmar'nak tribe (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L12`)
- `work_reputation`:
  - Rapidly becoming the foreman’s “problem-solver” for ironwork that keeps failing in winter damp (`world/factions/ardenhaven/npc/vorzug-ledger-scar.md#L60`)
