### World Naming Conventions

When generating **world** content (files in the `world/` folder), follow these culture-based naming rules. These are designed to be machine-readable and unambiguous.

**Important: Phonetic Pronunciation**

- For any complex or unusual name (especially Elven, Dwarven, Orc, and Ancient names), include phonetic spelling in parentheses immediately after the first use.
- Format: `Name (phonetic spelling)`
- Example: `Aeralithil (AIR-ah-LITH-il)`, `Khargun-dur (KHAR-gun-DOOR)`, `Ao Sathanum (AY-oh sah-THAH-noom)`
- Use CAPS for stressed syllables
- Use simple phonetic spelling that matches common English pronunciation patterns

1. **Shared Proto-Root**

   - Proto-root syllable: `ar`.
   - Meaning: home, foundation, power, origin.
   - Each culture mutates `ar` differently.
   - Ancient names keep `ar` pure and usually central.
2. **Human Names**

   - Tone: grounded, practical, often geography-based.
   - Structure: `base syllable(s)` + `geography suffix`.
   - Proto-root mutation: `ar` → `ar` or `er` inside the name.
   - Avoid: elven-style vowel pairs (`ae`, `ia`, `io`, `ui`), long vowel chains, apostrophes, overly melodic sounds.
   - **Regional note:** Human naming varies by realm. Use the rules below for most human place-names/surnames; use the **Elderholt** protocol for Elderholtian personal names (witch-adjacent).

   **Core Roots (pick 1):**
   `Ar`, `Arden`, `Ash`, `Bren`, `Bright`, `Cal`, `Dun`, `Glen`, `Hawk`, `Iron`, `Mer`, `Oak`, `Raven`, `Red`, `Stone`, `Thorn`, `Tor`, `Wolf`

   **Prefix Modifiers (optional, pick 0-1):**
   `North`, `South`, `East`, `West`, `High`, `Low`, `Old`, `New`, `Far`, `Near`, `Black`, `White`, `Grey`, `Gold`, `Silver`, `Frost`, `Mist`, `Storm`, `Sun`, `Star`, `Crow`, `Fox`, `Hart`, `Pine`, `Rose`

   **Geography Suffixes:**
   `-ford`, `-wick`, `-gate`, `-mouth`, `-har`, `-stead`, `-holt`, `-march`, `-haven`, `-dale`, `-ridge`, `-ton`, `-bridge`, `-croft`, `-field`, `-mill`, `-barrow`, `-watch`, `-keep`, `-cross`, `-wall`, `-hold`, `-port`, `-point`, `-pass`, `-fall`, `-crest`, `-cliff`, `-hollow`, `-hearth`, `-yard`, `-market`, `-way`, `-run`, `-bank`, `-fen`, `-moor`, `-wood`

   **Construction Steps:**

   1. Pick 1 core root (prefer 1 for simplicity)
   2. Optional: add 1 prefix modifier (especially for surnames and settlements)
   3. Add a geography suffix
   4. If generating a set of names, rotate suffix types (don’t reuse the same suffix over and over)
   5. Check that proto-root `ar`/`er` appears if using ancient connection

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

   **Elderholt Naming (Human & Witch-Adjacent)**

   Use for personal names from **Elderholt (EL-der-HOLT)** and its surrounding villages: human-rooted, restrained, and quietly haunted by coven culture. (Setting context: [Elderholt overview](../factions/elderholt/_overview.md).)

   - Tone: intimate, not geographic; burdened, not heroic; eerie without melodrama.
   - Prefer 2–3 syllables (2 is the “default heartbeat”).
   - Names should pass the “mouth test” (say it twice; if you stumble, simplify).

   **Sound palette (aim for contrast):**

   - Include at least one **soft** consonant: `l r w m n v s th`
   - Include at least one **firm** consonant: `k t d b g p x c`
   - Avoid 3+ liquid sounds in a row (`r l w`) across syllables.

   **Vowel contrast:**

   - Use at least **two different vowels** (`a e i o u`).
   - Repeat a vowel only on purpose (to imply obsession, power, instability, or heavy Voice-touched drift).

   | Vowel | Feel |
   | --- | --- |
   | `a` | grounded, physical |
   | `e` | alert, precise |
   | `i` | sharp, uncanny |
   | `o` | ancient, heavy |
   | `u` | distant, strange |

   **Endings (pick one based on role):**

   - Commonfolk / unthreaded: `-en`, `-in`, `-an`, `-er`, `-el`, `-yn`, `-ren`, `-den`
   - Coven-grown / elders: `-ith`, `-or`, `-ir`, `-reth`, `-var`, `-dren`
   - Deep-Witch / Voice-touched (rare): `-rix`, `-yrr`, `-yx`, `-eth`, `-aeth` (use only when you *want* it to read as not-quite-human)

   **Uniqueness guardrails (avoid “name drift”):**

   - Before finalizing, check for duplicates and near-duplicates in `world/naming_conventions/character-registry.tsv` and Elderholt lore docs.
   - Don’t reuse the same **root + ending** pair as a prominent name. Example: avoid `mar` + `wen` (too close to **Marwen**) and `mar` + `rith` (too close to **Marrith**).

   **Keep it readable (and keep it human):**

   - Avoid strong cross-culture signatures **unless** you intend the name to read as “borrowed,” “elder,” or “Voice-touched.”
     - Elven markers to avoid: `ae`, `ia`, `io`, `ui`, `-ael`, `-thil`, `-il`
     - Dwarven markers to avoid: `kh`, `gr`, `dr`, `br`, `-dur`, `-kar`
     - Orc markers to avoid: `kr`, `ug`, `zor`, `-gar`, `-rok`
     - Ancient markers to avoid: central pure `ar` as the whole core, obvious palindromes, `-os/-um/-eum`, excessive vowel chains

   **Proto-roots (emotional, not geographic; optional building blocks):**

   | Root | Feeling |
   | --- | --- |
   | `mar` | burn, remain, rebirth |
   | `bre` | shelter, breath, binding |
   | `row` | memory, persistence |
   | `cal` | fracture, division |
   | `ar` | endurance, ash |
   | `wen` | longing, hope |
   | `rith` | restraint, oath |
   | `lyn` | listening, watchfulness |
   | `nel` | growth, waiting |
   | `nor` | cold patience, watchful quiet |
   | `tav` | duty, restlessness, wandering service |
   | `sel` | silence, inwardness |
   | `var` | vow, burden |
   | `rin` | vigilance, listening |
   | `den` | shelter, hearth |
   | `rix` | transformation, cost |

   **Common drift/mutation (keep subtle):**

   - `mar` → `mar / mer / mor`
   - `bre` → `bre / bri`
   - `cal` → `cal / kel`
   - `wen` → `wen / win`
   - `rith` → `rith / rit`
   - `row` → `row / ro`

   **Examples (baseline Elderholt):**

   - `Brenor` (BREH-nor)
   - `Kelrith` (KELL-rith)
   - `Kelric` (KELL-rik)
   - `Silreth` (SILL-reth)
   - `Norben` (NOR-ben)
   - `Norren` (NOR-ren)
   - `Tavren` (TAV-ren)
   - `Calyrix` (CAL-ee-riks)

3. **Elven Names**

   - Tone: melodic, flowing, vowel-rich.
   - Structure: `2–3 syllable base` + `soft ending`.
   - Soft consonants only: `L`, `S`, `Th`, `Sh`, `R`, `V`.
   - Proto-root mutation: `ar` → `aer` or `ara`.

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
4. **Dwarven Names**

   - Tone: heavy, solid, stone-like.
   - Structure: `hard base` + `weighty suffix`.
   - Strong consonants: `Kh`, `Gr`, `Dr`, `Br`, `Th`, `M`, `D`, `B`.
   - Preferred vowels: short `a`, `o`, `u`.
   - Proto-root mutation: `ar` → `gar`, `bar`, or `kar`.

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
5. **Orc Names**

   - Tone: raw, short, aggressive.
   - Structure: `1–2 clipped syllables` + `punchy ending`.
   - Harsh consonants: `G`, `K`, `R`, `Z`, `Kr`, `Gr`, `Ug`, `Dak`.
   - Proto-root mutation: `ar` → `gar` or `rak`.

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
6. **Ancient Names**

   - Tone: eerie, symmetrical, vowel-dominant, ritualistic.
   - Identity rule: Ancient names should be easily recognizable and distinct from other cultures.
   - Proto-root usage: `ar` stays pure and usually appears in the **center** of the name.
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

7. **Neogi Names**

   - Tone: alien, sibilant, insectile; the name should feel *hissed*, not spoken.
   - Culture note: Neogi are widely misunderstood—harmless (if unsettling), deeply communal, and intensely *transactional* without being cruel. Their language (`K'azz'jak'n`) is sibilant-heavy and apostrophe-marked; outsiders often mistake “nest-ledger” formality for malice.
   - Structure (default): `2–4 morphemes` split by apostrophes. Keep it compact; avoid “heroic” flow.
   - Avoid: human geography suffixes (`-ford`, `-haven`, etc.), long vowel chains, “pretty” vowel pairs (`ae`, `ia`, `io`, `ui`), and dwarven-style hyphenated weight-suffixes (`-dur`, `-kar`, etc.) unless you explicitly want a *borrowed* name.

   **Sound palette (required):**

   - Include at least one **sibilant cluster**: `s`, `ss`, `sh`, `z`, `zh`, `x`
   - Include at least one **hard stop**: `k`, `q`, `g`, `t`, `kz`, `k'`
   - Prefer short vowels: `a`, `i`, `u` (use `e/o` sparingly)

   **Forms:**

   - Personal name: `core` + `'` + `bite` (rank/role marker)
   - Clutch/house: `core` + `'` + `core` (often harsher and longer than personal names)
   - Ritual/deity reference: allow longer strings and extra apostrophes (but still avoid vowel chains)

   **Core morphemes (pick 1–2):**
   `kazz`, `zhak`, `ssak`, `zix`, `kith`, `vrul`, `qath`, `xul`, `graz`, `jakh`, `thru`, `skra`, `zul`

   **“Bite” markers (pick 1):**
   `-ix`, `-ul`, `-za`, `-zha`, `-k`, `-q`, `-th`, `-kz`

   **Construction Steps:**

   1. Pick 1–2 core morphemes (keep each 1 syllable if possible).
   2. Join with `'` (apostrophe) to force the staccato/glottal feel.
   3. Append a bite marker (or add a final clipped consonant).
   4. If it starts to look like a human/elf/dwarf/orc name, regenerate.

   **Examples (personal):**

   - `Kazz'vrulix` (KAZH-vrul-IKS)
   - `Zhak'ssak` (ZHAK-ssak)
   - `Xul'kithq` (ZULL-kithk)
   - `Qath'zhul` (KATH-zhull)
   - `Skra'jakhkz` (SKRA-jakh-kz)

   **Examples (places/titles):**

   - `Ssak'vash` (ssak-VASH) — market/auction
   - `Kazz'gru` (KAZH-groo) — pit/cistern
   - `Zhakh'sik` (ZHAK-sik) — silk-works/hatchery
