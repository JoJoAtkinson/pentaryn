---
created: 2025-12-24
last-modified: 2025-12-24
tags: ["#world", "#history", "#factions", "#draft", "#templates"]
status: draft
---

# Faction History Drafts (Natural Language → `_history.tsv`)

This file is a **fast writing surface** for faction timelines. Each entry is intentionally *natural language* so it’s easy to edit and expand; later, an LLM can convert it into structured TSV rows.

Scope choices (per current campaign needs):
- Most factions: start around **4150 A.F.** (Imperial Wars era) through **4327 A.F.** (present year).
- Rakthok: treat the conflict as **ongoing** (they are still “in war” even if others call it trade-era border incidents).
- Araethilion: start roughly **2,500 years ago** (c. **1827 A.F.**) and keep events **more spread out** (long lives, long memory, different time sense).

References:
- Inspiration: [Faction Inspiration Sources](../faction-insperation-sorces.md)
- Proximity/Influence: [Faction Proximity & Influence](../faction-proximity-and-influence.md)
- Dating system: [The Reckoning of the Fall](../calendar-reckoning-of-the-fall.md)
- TSV rules + header: [Timeline System Overview](../history/README.md)
- Existing canonical TSV: [world/history/_history.tsv](../history/_history.tsv)
- Existing Rakthok TSV: [world/factions/rakthok-horde/_history.tsv](rakthok-horde/_history.tsv)

## LLM Instructions: Convert This File Into TSV Rows (No `truth` Yet)

You are converting natural-language entries into `*_history.tsv` rows. **Do not write any `pov=truth` rows**; the DM will add truth later.

### 1) Event granularity
- Each `###` entry below is one event candidate.
- If an entry clearly includes multiple beats (“first X, then Y”), split into multiple events.
- Keep titles short and reusable (they often become TSV `title`).

### 2) POV rows to create (no `truth` yet)
For each event candidate under a faction section:
- Always create `pov=<that-faction-slug>` (this is the player-facing timeline).
- Additionally create `pov=public` when the entry is widely known **within or about** that faction.

**Note:** TSV rules require each `event_id` to have at least one `pov=public` or `pov=truth` row somewhere in the repo. Since we’re skipping truth for now, some “secret-only” entries will need either a public row later or a truth row later.

### 3) When to split into multiple factions’ POV (rare, opt-in)
Default: keep events *owned* by a single faction.

Split into multiple factions only when the event is strongly tied to another faction (e.g., direct battle, treaty, scandal, border incident) **and** that other faction would plausibly remember it with a distinct account.

### 4) Dates → TSV date columns
- Use A.F. years; include month/day only when it matters.
- Acceptable natural formats to parse:
  - Exact date: `12 Veleara 4200 A.F.`
  - Year-only: `4206 A.F.`
  - Circa: `c. 4182 A.F.`
  - Range: `4150–4199 A.F.`
  - Ongoing: `since 4315 A.F.`

### 5) “Visibility” mapping
- `Visibility: public` → create both `pov=<faction-slug>` and `pov=public`.
- `Visibility: internal` → create only `pov=<faction-slug>` (public row comes later or via truth).
- `Visibility: propaganda` → create both; put the propaganda in `pov=public` and the internal rationale in `pov=<faction-slug>` if they differ.

## Faction Slugs (use these in TSV)
- Ardenhaven → `ardenhaven`
- Calderon Imperium → `calderon-imperium`
- Merrowgate → `merrowgate`
- Elderholt → `elderholt`
- Garrok Confederation → `garrok-confederation`
- Rakthok Horde → `rakthok-horde`
- Dulgarum Oathholds → `dulgarum-oathholds`
- Garhammar Trade League → `garhammar-trade-league`
- Araethilion → `araethilion`

## Entry Template (copy/paste)

### [When] — Title
- Visibility: public | internal | propaganda
- Faction account: …
- Public version (if any): …
- Notes (optional): …

---

## Ardenhaven (`ardenhaven`) — 4150–4327 A.F.
Link: [Ardenhaven overview](ardenhaven/_overview.md)

Tone anchors: charter governance under strain; reform through crisis; “good intentions with hard choices.”

### [c. 4150 A.F.] — The First Council Musters
- Visibility: public
- Faction account: The Council of Havens votes emergency levies and bridge militias, arguing all night over what they can demand without becoming what they fear.
- Public version (if any): “Citizens stood as one; Ardenford answered the call.”

### [4161–4162 A.F.] — Ardenford Holds Under Siege
- Visibility: public
- Faction account: Ardenford learns to fight wars of ferries, granaries, and bridge denial; heroism is measured in patience and mud.
- Public version (if any): “The city never bent.”

### [4173–4174 A.F.] — The Grain Crisis and the Quiet Cartel
- Visibility: public
- Faction account: Winter stores nearly fail; reformers break a cartel, but the new “solution” still leaves someone holding the lever.
- Public version (if any): “Smugglers were punished; prices stabilized.”

### [4200 A.F.] — The Charter Reaffirmed After the Accords
- Visibility: public
- Faction account: After the Pentarch Accords, Ardenhaven rewrites sections of the charter for wartime powers—then argues for decades about rolling them back.
- Public version (if any): “Peace returns; the Charter protects us.”

### [c. 4277–4285 A.F.] — The Border Patrol Professionalization
- Visibility: public
- Faction account: Ardenhaven tries to professionalize without building an empire: better signal towers, better ledgers, better discipline—still no appetite for secret police.
- Public version (if any): “Safer roads; fewer raids.”

### [c. 4300–4315 A.F.] — Merrowgate Credit Winter
- Visibility: internal
- Faction account: A run of bad harvests and “market corrections” turns into leverage; the Council learns how expensive neutrality can be.
- Public version (if any): “A temporary austerity package.”

### [c. 4320–4327 A.F.] — The Permit Debate (Ardenhaven Edition)
- Visibility: public
- Faction account: Ardenhaven tightens travel rules and hates itself for it; every new permit feels like a small surrender to Calderonic logic.
- Public version (if any): “Common-sense safety measures.”

---

## Calderon Imperium (`calderon-imperium`) — 4150–4327 A.F.
Link: [Calderon overview](calderon-imperium/_overview.md)

Tone anchors: predictable law as weapon; bureaucracy as power; “order before all.”

### [4150–4199 A.F.] — The Marches Become Doctrine
- Visibility: propaganda
- Faction account: The legions are taught that hesitation is treason; the frontier is framed as a permanent test of worth.
- Public version (if any): “Civilization advances; roads and courts follow.”

### [4206–4208 A.F.] — The Censorate Tightens the World
- Visibility: public
- Faction account: Registries and permits turn movement into permission; the paper trail becomes a blade that never rusts.
- Public version (if any): “Fraud and sedition are reduced through modern oversight.”

### [c. 4210–4277 A.F.] — The Border Is Kept Bleeding
- Visibility: internal
- Faction account: Peace is a posture, not a state; the frontier is maintained as an instrument—training, fear, and justification.
- Public version (if any): “Unfortunate incidents caused by raiders and bandits.”

### [c. 4277–4327 A.F.] — The Rakthok “Monster” Storyline
- Visibility: propaganda
- Faction account: Calderon messaging reduces spirit-law conflict into “trade disputes” and “savage rites,” making harsh policy feel inevitable.
- Public version (if any): “Border security protects merchants from barbarism.”

### [c. 4310–4327 A.F.] — The Sealed Facility Incident
- Visibility: internal
- Faction account: A lab fire, a missing ledger, a reassigned cohort—everyone in the apparatus knows something happened; nobody is allowed to name it.
- Public version (if any): “Industrial accident; no threat to citizens.”

### [c. 4325–4327 A.F.] — The Amnesty That Maps You
- Visibility: internal
- Faction account: “Mercy” becomes intake; intake becomes lists; lists become control.
- Public version (if any): “A humane program for refugees and deserters.”

---

## Merrowgate (`merrowgate`) — 4150–4327 A.F.
Link: [Merrowgate overview](merrowgate/_overview.md)

Tone anchors: contract supremacy; neutrality as leverage; crime and law sharing an office.

### [4162 A.F.] — Neutrality Proclamation (No Banners in the Streets)
- Visibility: public
- Faction account: Merrowgate sells the illusion of impartiality while quietly pricing everyone’s desperation.
- Public version (if any): “The Gate remains open to all peaceful traders.”

### [c. 4170–4199 A.F.] — Licensed Crime Becomes Policy
- Visibility: internal
- Faction account: The city discovers that regulating vice is more profitable than outlawing it; enforcement becomes a market.
- Public version (if any): “Orderly districts; reduced street violence.”

### [4210 A.F.] — The Forgery Purge
- Visibility: public
- Faction account: Counterfeiters vanish, and identity trade becomes *cleaner* rather than smaller.
- Public version (if any): “Fraud is rooted out; trust in contracts restored.”

### [c. 4277–4300 A.F.] — The Arbitration Boom
- Visibility: public
- Faction account: Merrowgate becomes a second battlefield: clients lose wars on paper and pay for it in tariffs for a generation.
- Public version (if any): “Peace through lawful dispute resolution.”

### [c. 4300–4320 A.F.] — The Insurance Panic Years
- Visibility: public
- Faction account: Premiums rise, policies tighten, and whole towns become collateral; the Gate calls it prudence.
- Public version (if any): “Responsible risk management after instability.”

### [c. 4326 A.F.] — A High-Value Contract Goes Missing
- Visibility: internal
- Faction account: A single document disappears and the city’s factions move like sharks; someone is testing the Silent Patron’s reach.
- Public version (if any): “A clerical discrepancy under review.”

---

## Elderholt (`elderholt`) — 4150–4327 A.F.
Link: [Elderholt overview](elderholt/_overview.md)

Tone anchors: favors and wards instead of treaties; secrecy as survival doctrine; terrifying restraint.

### [4150–4199 A.F.] — The War-Petitions (Rare, Expensive, Quiet)
- Visibility: internal
- Faction account: A handful of war petitions are accepted during the Imperial Wars; every accepted favor creates a debt that outlives the petitioners.
- Public version (if any): Rumors of “forest witches” turning battles with fog and misfortune.

### [c. 4180–4210 A.F.] — The Missing Threadlings Year
- Visibility: internal
- Faction account: More children are taken than usual, and the coven does not explain why; the Voice is louder, and the Axiom hums wrong.
- Public version (if any): “A plague took them.” / “Bandits.” / “They ran away.”

### [c. 4200–4277 A.F.] — The Doctrine of Non-Rule (Reaffirmed)
- Visibility: internal
- Faction account: The Elders restate the rule: Elderholt does not govern by banner; it intervenes by petition and ward, or not at all.
- Public version (if any): “They don’t care about the wider world.”

### [since 4315 A.F.] — The Veil Project (Sea Lane Shrouding)
- Visibility: internal
- Faction account: Wards thicken over a sea lane; the coven treats it as triage, not ambition.
- Public version (if any): “Strange fogs; missing compasses; a cursed route.”

### [c. 4320–4327 A.F.] — An Elder Wakes Wrong
- Visibility: internal
- Faction account: A retired Elder Witch stirs and the wards strain; the coven quietly moves people, locks halls, and burns evidence.
- Public version (if any): A single night of unnatural silence in the forest, followed by a month of bad dreams in nearby villages.

---

## Garrok Confederation (`garrok-confederation`) — 4150–4327 A.F.
Link: [Garrok overview](garrok-confederation/_overview.md)

Tone anchors: oath-law; recompense over feuds; terrifying unity when betrayed.

### [c. 4150–4165 A.F.] — The Moot Debates the Human War
- Visibility: internal
- Faction account: Garrok clans argue whether the human war is a chance to raid, a chance to trade, or a chance to build a future by treaty.
- Public version (if any): Outsiders hear only that “orcs are gathering.”

### [4165 A.F.] — The Ardenic Treaties (Oathfire Peace)
- Visibility: public
- Faction account: Garrok agrees to mutual defense and limited trade under oathfire law; both sides discover that “law” can mean different things.
- Public version (if any): “Civilized orcs sign a peace.”

### [c. 4200–4277 A.F.] — Blood-Price Cases at the Border Markets
- Visibility: internal
- Faction account: Small insults become formal cases; judges build precedent one scar at a time.
- Public version (if any): “Orc courts are barbaric.” / “Orc courts are honest.”

### [c. 4277–4320 A.F.] — The Rival Horde Question (Rakthok)
- Visibility: internal
- Faction account: Garrok argues about Rakthok legitimacy: are they kin in tragedy or kin in shame?
- Public version (if any): “Orcs fighting orcs; nothing new.”

### [c. 4320–4327 A.F.] — The Oathbreaker Banner
- Visibility: propaganda
- Faction account: Someone uses false oaths (or forged testimony) to paint an enemy as oathbreaker; the confederation treats the claim itself as a weapon.
- Public version (if any): “A notorious outlaw violates ancient law.”

---

## Rakthok Horde (`rakthok-horde`) — 4150–4327 A.F. (Ongoing War)
Link: [Rakthok overview](rakthok-horde/_overview.md)

Tone anchors: refugee alliance; spirit-law and survival; paranoia after betrayal; war that never ended.

Note: `rakthok-horde/_history.tsv` already covers many **Age of Trade** incidents (4277–4326). This draft focuses on **4150–4277** foundations and gives space to add more entries later without duplicating what already exists.

### [c. 4150–4160 A.F.] — The Border Learns the Horde’s Name
- Visibility: propaganda
- Faction account: Calderon learns to fear mobile warbands; the Horde learns that “permits” can be chains.
- Public version (if any): “Raids escalate without provocation.”

### [c. 4160–4180 A.F.] — Fire Councils Harden Into Law
- Visibility: internal
- Faction account: What began as emergency councils becomes governance; arguments are public, loud, and binding.
- Public version (if any): “Orc mobs choose warlords.”

### [c. 4180–4200 A.F.] — The White-Flag Lesson (First Betrayal Era)
- Visibility: internal
- Faction account: A parley becomes a trap; after that, the Horde treats white cloth as a warning, not a promise.
- Public version (if any): “Orcs broke peace talks.”

### [c. 4200–4277 A.F.] — The Heart-Rite Becomes Doctrine
- Visibility: internal
- Faction account: The rite is framed as protection: deny collectors and gravewrights the bodies they need to bind the dead.
- Public version (if any): “Savage heart-eating.”

### [c. 4250–4277 A.F.] — The Vision War Within
- Visibility: internal
- Faction account: Tribes disagree over omens and targets; unity is chosen again and again, never guaranteed.
- Public version (if any): “Unpredictable violence.”

### [4277–4327 A.F.] — The War Continues Under Trade Names
- Visibility: propaganda
- Faction account: The world calls it tolls, audits, disputes; the Horde calls it war and remembers every collector’s hook.
- Public version (if any): “Border incidents and tariff enforcement.”

---

## Dulgarum Oathholds (`dulgarum-oathholds`) — 4150–4327 A.F.
Link: [Dulgarum overview](dulgarum-oathholds/_overview.md)

Tone anchors: duty-first; secrecy as survival; pride on the surface, horror below.

### [4150–4199 A.F.] — The Holds Sell Safety (Without Explaining Why)
- Visibility: public
- Faction account: Dulgarum signs defensive contracts and sends disciplined troops to passes; they never name the deeper reason they cannot afford surface chaos.
- Public version (if any): “Dwarves honor their agreements.”

### [c. 4182 A.F.] — The Whispered Schism Becomes a Break
- Visibility: public
- Faction account: Dissidents leave; the Holds call them oathbreakers; the leavers call the Holds a tomb that eats its heirs.
- Public version (if any): “A dwarven split over tradition.”

### [c. 4200–4277 A.F.] — Deep Watch Rotations Lengthen
- Visibility: internal
- Faction account: Rotations get longer and the casualty ledgers get quieter; families learn to stop asking.
- Public version (if any): “Austerity measures to meet new threats.”

### [c. 4277–4310 A.F.] — The Schism Turns Economic
- Visibility: public
- Faction account: Garhammar’s charters and Dulgarum’s oaths collide in courts, tariffs, and sabotage that never quite becomes open war.
- Public version (if any): “Trade disagreements among kin.”

### [c. 4310–4327 A.F.] — The Supply Train That Didn’t Return
- Visibility: internal
- Faction account: A shipment vanishes below the sealed levels; official reports contradict one another; the Deep Watch goes silent.
- Public version (if any): “Cave-in; tragic accident.”

---

## Garhammar Trade League (`garhammar-trade-league`) — 4150–4327 A.F.
Link: [Garhammar overview](garhammar-trade-league/_overview.md)

Tone anchors: charter votes weighted by capital; innovation and exploitation; neutrality weaponized.

### [c. 4150–4199 A.F.] — The League Learns the War Market
- Visibility: internal
- Faction account: Prototype weapons are “tested” on paying clients; the League convinces itself that profit prevents wars even as it feeds them.
- Public version (if any): “Supplying both sides keeps trade lanes stable.”

### [c. 4182–4200 A.F.] — The Charters Become Religion
- Visibility: internal
- Faction account: Capital-weighted governance hardens; arbitration becomes a priesthood with ledgers instead of hymns.
- Public version (if any): “A modern dwarven experiment in freedom.”

### [c. 4200–4277 A.F.] — The Debt Precedent
- Visibility: public
- Faction account: A client defaults; Garhammar takes assets by contract and calls it justice.
- Public version (if any): “Rule of law in commerce.”

### [c. 4277–4315 A.F.] — Arbitration Halls Spread (Merrowgate Partnership)
- Visibility: public
- Faction account: Two contract cultures interlock; decisions made in clean rooms change who eats and who bleeds.
- Public version (if any): “Efficient dispute resolution between civilized powers.”

### [c. 4315–4327 A.F.] — Labor Unrest in the Foundries
- Visibility: internal
- Faction account: Non-dwarf laborers organize; the League answers with clauses, guards, and “voluntary” relocations.
- Public version (if any): “Isolated criminal agitation.”

---

## Araethilion (`araethilion`) — c. 1827–4327 A.F. (Long View)
Link: [Araethilion overview](araethilion/_overview.md), [Elaerith](araethilion/the-living-god.md)

Tone anchors: beautiful tyranny; proximity as power; exile and Severance; time measured in lifetimes, not seasons.

### [c. 1827 A.F.] — The Courts Settle Into the Nine Rings
- Visibility: internal
- Faction account: Proximity becomes civic structure; access becomes reward; the realm learns to treat closeness as holiness.
- Public version (if any): “A golden age of order and ceremony.”

### [c. 2000 A.F.] — The First “Voluntary Pilgrimages” (Exiles Begin)
- Visibility: propaganda
- Faction account: Dissidents depart and are never named again; the court teaches that forgetting is mercy.
- Public version (if any): “Those called to wander sought enlightenment beyond the borders.”

### [c. 2500 A.F.] — The Silver Thread Becomes Commonplace
- Visibility: internal
- Faction account: The Lifebloom and Thread doctrine spreads; devotion becomes infrastructure.
- Public version (if any): “Elaerith’s blessings reach every grove.”

### [c. 3300 A.F.] — The Border Harmonies (Soft Power Era)
- Visibility: public
- Faction account: Healing, artistry, and controlled diplomacy become the realm’s outward face; outsiders learn to trade for beauty without asking its cost.
- Public version (if any): “Araethilion is aloof but benevolent.”

### [c. 4150–4200 A.F.] — The Human Wars Watched From the Heights
- Visibility: internal
- Faction account: The court tracks the Imperial Wars as weather: dangerous, predictable, not to be invited inside.
- Public version (if any): “Araethilion remained neutral.”

### [c. 4200–4277 A.F.] — The Whisper-Schism Resurfaces
- Visibility: internal
- Faction account: Forbidden prophecies circulate through exile channels; the court answers by tightening access and increasing Severance threats.
- Public version (if any): “Heresies are compassionately corrected.”

### [c. 4277–4327 A.F.] — The Pass Markets and the Price of Peace
- Visibility: public
- Faction account: Controlled exchanges with neighbors (especially through Merrowgate channels); every deal is also surveillance.
- Public version (if any): “Harmony through trade and healing.”

### [c. 4320–4327 A.F.] — The Rumor of a Faltering Thread
- Visibility: internal
- Faction account: A few rites fail; the faithful refuse to name it; the exiles whisper that Elaerith can bleed.
- Public version (if any): “Slander by enemies and frightened peasants.”
