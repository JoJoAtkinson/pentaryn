# World

This directory contains all world-building information for the campaign setting.

## Structure

- **locations/** - Cities, dungeons, regions, and other places
- **factions/** - Organizations, guilds, and groups
- **lore/** - Mythology, legends, and world lore

## Creating World Content

## Naming Conventions (World)

Use these rules when naming places, cultures, and ancient sites in the `world/` folder. They are designed to be explicit and easy for an LLM to follow.

**Important: Phonetic Pronunciation**
- For any complex or unusual name (especially Elven, Dwarven, Orc, and Ancient names), include phonetic spelling in parentheses immediately after the first use.
- Format: `Name (phonetic spelling)`
- Example: `Aeralithil (AIR-ah-LITH-il)`, `Khargun-dur (KHAR-gun-DOOR)`, `Ao Sathanum (AY-oh sah-THAH-noom)`
- Use CAPS for stressed syllables
- Use simple phonetic spelling that matches common English pronunciation patterns

### Shared Proto-Root

- **Proto-root syllable:** `ar`
- **General meaning:** home, foundation, power, origin
- **Rules:**
	- Each culture mutates `ar` differently.
	- **Ancient** names keep `ar` pure and usually central.

### Locations
1. Use `/templates/location-template.md`
2. Save to `locations/`
3. Include maps when available
4. Link to NPCs and quests associated with the location

### Cultural Naming Rules

These rules describe **how to build names** for different cultures. When generating names, pick a culture and follow its rules.

#### Human Naming Rules

- **Tone:** grounded, practical, often geography-based.
- **Structure:** `base syllable(s)` + `geography suffix`.
- **Proto-root mutation:** `ar` → `ar` or `er` inside the name.
- **Avoid:** double vowels, apostrophes, overly melodic sounds.

**Base Syllables (pick 1-2):**
`Ar`, `Arden`, `Stone`, `Red`, `Dun`, `Cal`, `Tor`, `Mer`, `Bren`, `Ash`, `Oak`, `Raven`, `Thorn`, `Glen`, `Wolf`, `Iron`, `Hawk`, `Bright`

**Geography Suffixes:**
`-ford`, `-wick`, `-gate`, `-mouth`, `-har`, `-stead`, `-holt`, `-march`, `-haven`, `-dale`, `-ridge`, `-ton`, `-bridge`

**Construction Steps:**
1. Pick 1-2 base syllables (prefer 1 for simplicity)
2. Add geography suffix
3. Check that proto-root `ar`/`er` appears if using ancient connection

**Examples:**
- `Arden` + `-ford` = `Ardenford`
- `Stone` + `-march` = `Stonemarch`
- `Dun` + `-har` (with `ar`) = `Dunharrow` (note: `har` contains proto-root)
- `Cal` + `der` + `-wick` = `Calderwick` (proto-root as `er`)
- `Mer` (contains `er`) + `-row` + `-gate` = `Merrowgate`

**❌ Avoid:**
- `Aealithford` (elven vowel pairs)
- `Kragwick` (harsh orc consonants)
- `Ardenthil` (elven suffix)

#### Elven Naming Rules

- **Tone:** melodic, flowing, vowel-rich.
- **Structure:** `2–3 syllable base` + `soft ending`.
- **Soft consonants only:** `L`, `S`, `Th`, `Sh`, `R`, `V`.
- **Proto-root mutation:** `ar` → `aer` or `ara`.

**Syllable Building Blocks:**
`Ae`, `Lua`, `Lun`, `Sil`, `Ser`, `Tha`, `Thae`, `Shi`, `Ral`, `Vel`, `Ves`, `Ith`, `Il`, `Ara`, `Aer`, `Io`, `Ui`, `Ela`, `Lith`

**Soft Endings:**
`-il`, `-ir`, `-el`, `-aris`, `-ion`, `-thil`, `-ael`, `-aen`, `-iel`

**Construction Steps:**
1. Pick 2-3 syllable building blocks (ensure vowel-rich flow)
2. Use soft consonants only (`L`, `S`, `Th`, `R`, `V`, `Sh`)
3. Include at least one vowel pair (`ae`, `ia`, `io`, `el`, `il`, `ui`)
4. Add soft ending
5. For proto-root connection, use `Aer` or `Ara` as first syllable

**Examples:**
- `Aer` + `al` + `ith` + `-il` = `Aeralithil`
- `Lun` + `ar` + `-ael` = `Lunarael`
- `Ves` + `har` + `-ion` = `Vesharion`
- `Ser` + `ith` + `ara` (reversed) = `Serithara`
- `Ith` + `lir` + `-aen` = `Ithliraen`

**❌ Avoid:**
- `Kragthil` (harsh consonants)
- `Dunaris` (human-style base)
- `Uglion` (orc consonants)

#### Dwarven Naming Rules

- **Tone:** heavy, solid, stone-like.
- **Structure:** `hard base` + `weighty suffix`.
- **Strong consonants:** `Kh`, `Gr`, `Dr`, `Br`, `Th`, `M`, `D`, `B`.
- **Preferred vowels:** short `a`, `o`, `u`.
- **Proto-root mutation:** `ar` → `gar`, `bar`, or `kar`.

**Base Syllables (pick 1-2):**
`Khar`, `Khor`, `Grum`, `Grom`, `Drak`, `Drog`, `Bor`, `Bar`, `Thar`, `Thor`, `Mok`, `Dug`, `Dul`, `Brog`, `Krag`, `Thrum`

**Weighty Suffixes:**
`-dur`, `-grum`, `-dun`, `-kar`, `-hammar`, `-drak`, `-bor`, `-dum`, `-gar`, `-thrum`

**Construction Steps:**
1. Pick 1 base syllable (2 if name needs to be longer/more important)
2. Add weighty suffix
3. Use hyphen if base is 2+ syllables: `Khargun-dur`
4. Use apostrophe for emphasis before suffix: `Thar'kar`
5. Proto-root appears as `gar`, `bar`, or `kar` in base or suffix

**Generation Template:**
`[Kh/Gr/Dr/Br/Th][a/o/u][r/m/g/k]` + `[-dur/-grum/-kar]`

**Examples:**
- `Khar` + `gun` + `-dur` = `Khargun-dur` (hyphen for multi-syllable base)
- `Bar` + `-drak` = `Bardrak` (proto-root as `bar`)
- `Dul` + `gar` + `-um` = `Dulgarum` (proto-root as `gar`)
- `Thar` + `'` + `-kar` = `Thar'kar` (apostrophe for emphasis)
- `Grum` + `-hammar` = `Grumhammar`

**❌ Avoid:**
- `Aeraldur` (elven vowel pairs)
- `Kharwickford` (human geography suffixes)
- `Kharael` (soft elven ending)

#### Orc Naming Rules

- **Tone:** raw, short, aggressive.
- **Structure:** `1–2 clipped syllables` + `punchy ending`.
- **Harsh consonants:** `G`, `K`, `R`, `Z`, `Kr`, `Gr`, `Ug`, `Dak`.
- **Proto-root mutation:** `ar` → `gar` or `rak`.

**Base Syllables (pick 1-2):**
`Urt`, `Krag`, `Vor`, `Zok`, `Grak`, `Dak`, `Mog`, `Ug`, `Zor`, `Rok`, `Gul`, `Drok`, `Naz`, `Ghor`, `Thrak`, `Krul`, `Baz`, `Gruk`, `Vorg`, `Durz`

**Punchy Endings:**
`-gar`, `-gath`, `-rok`, `-zug`, `-nak`, `-gul`, `-dak`, `-zar`, `-thok`, `-rak`

**Construction Steps:**
1. Pick 1 base syllable (rarely use 2 for warlords/chieftains)
2. Add punchy ending
3. Optional: use apostrophe before ending for emphasis: `Zor'gar`
4. Proto-root appears as `gar` or `rak` in ending or base

**Generation Template:**
`[G/K/Z/Gr/Kr][o/u/a][r/k/g]` + `[-gar/-rok/-zug]`

**Examples:**
- `Krag` + `-ath` = `Kragath`
- `Zor` + `'` + `-gar` = `Zor'gar` (apostrophe for emphasis, proto-root as `gar`)
- `Ug` + `'` + `-rok` = `Ug'rok` (proto-root as `rok`)
- `Gar` + `-nak` = `Garnak` (proto-root as base `gar`)
- `Vor` + `-zug` = `Vorzug`

**❌ Avoid:**
- `Aeragar` (elven vowel pairs)
- `Stonemarch` (human geography)
- `Thil'gar` (soft elven consonants)

#### Ancient Naming Rules

- **Tone:** eerie, symmetrical, vowel-dominant, ritualistic.
- **Identity rule:** Ancient names should be easily recognizable and distinct from other cultures.
- **Proto-root usage:** `ar` stays pure and usually appears in the **center** of the name.
- At least one of the following must apply:
  - Unique vowel pairs: `aeu`, `ao`, `uea`, `eae`, `iae`.
  - Internal symmetry or semi-palindrome (e.g., `Arua`, `Velerev`, `Saanas`).
  - Distinctive endings: `-os`, `-um`, `-atheon`, `-orun`, `-eum`.
- Additional rules:
  - Vowel-heavy; minimal consonants.
  - Uses repeating vowel sequences.
  - Employs symmetry or mirroring.
  - Never describes geography literally.
  - Uses unmistakable suffixes.

**Construction Algorithm:**

**Method 1: Pure Proto-Root Center**
1. Start with `ar` as center: `___ar___`
2. Add unique vowel pair before: `[ao/aeu/uea]` + `ar` → `aoar`, `aeuar`, `uear`
3. Mirror or echo ending: `aoar` + `ua` → `aoarua`
4. Add distinctive suffix: `aoarua` + `-os` → `Aoaruaos`

**Method 2: Symmetrical Construction**
1. Pick consonant: `V`, `Th`, `L`, `S`
2. Build palindrome pattern: `V-e-l-e-r-e-v` → `Velerev`
3. Add proto-root in center variant: `S-ar-a-n-a-s` → `Saanas`

**Method 3: Vowel-Heavy with Ancient Ending**
1. Start with proto-root: `Ar` or `An`
2. Add unique vowel pairs: `Ar` + `uea` → `Aruea`
3. Add minimal consonant: `Aruea` + `m` → `Arueam`
4. Add ancient ending: `Arueam` + `-os` → `Arueamos` (simplify to `Arumos`)

**Ancient Markers Checklist** (include at least 2):
- ✓ Unique vowel pair (`aeu`, `ao`, `uea`, `eae`, `iae`)
- ✓ Pure `ar` (unmutated)
- ✓ Symmetry/palindrome structure
- ✓ Ancient ending (`-os`, `-um`, `-atheon`, `-orun`, `-eum`)
- ✓ Vowel-dominant (70%+ vowels)

**Examples:**
- `Ar` + `ua` + `-os` = `Aruaos` (proto-root + vowel echo + ending)
- `An` + `eum` + `-a` = `Aneuma` (unique vowel pair `eu`)
- `Thae` + `or` + `-um` = `Thaeorum` (ancient vowels + ending)
- `Vel` + `ere` + `v` = `Velerev` (palindrome)
- `Ao` + `Sathan` + `-um` = `Ao Sathanum` (unique `ao` pair, space for emphasis)
- `Ar` + `um` + `-os` = `Arumos` (proto-root center)
- `Ulea` + `'` + `thos` = `Ulea'thos` (unique vowels + ancient ending)

**❌ Avoid:**
- `Stoneatheon` (literal geography)
- `Krag-os` (harsh orc consonants)
- `Merroweum` (human-style base)

### Factions
1. Use `/templates/faction-template.md`
2. Save to `factions/`
3. Track party reputation with each faction
4. Link to key NPCs and headquarters

### History
- Create timeline documents
- Reference important dates in other documents
- Link historical events to current situations

### Lore
- Myths and legends
- Religious beliefs
- Cultural information
- World mysteries

## Quick Links

- [Location Template](../templates/location-template.md)
- [Faction Template](../templates/faction-template.md)
- [Factions (Regions & Locations)](factions/)
- [History](history/)
- [Lore](lore/)
