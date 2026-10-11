// ORACLE for the spellList dedupe and the names() grouping: books.mjs's inline code as it stood at
// f4553b7b, pasted verbatim except that index reads are injected (`readIndex(id, fields)` → index or
// null). The core functions that replace it (groupListUuids, spellListRows, groupNames) are asserted
// equal to this in test/lists.test.mjs. Never edit to make a test pass.

export async function spellListSpells(listUuids, readIndex, level = null) {
  const byPack = new Map();
  for (const u of listUuids) {
    const m = /^Compendium\.([^.]+\.[^.]+)\.Item\.(.+)$/.exec(u);
    if (!m) continue;
    if (!byPack.has(m[1])) byPack.set(m[1], []);
    byPack.get(m[1]).push([u, m[2]]);
  }
  const packs = [...byPack.keys()].sort((a, b) => (b.startsWith("dnd-players-handbook") ? 1 : 0) - (a.startsWith("dnd-players-handbook") ? 1 : 0));
  const seen = new Set(), out = [];
  for (const id of packs) {
    const idx = await readIndex(id, ["system.level"]);
    for (const [u, docId] of byPack.get(id)) {
      const e = idx?.get(docId);
      const name = e?.name ?? u, lvl = e?.system?.level ?? null;
      if (seen.has(name)) continue;
      if (level !== null && lvl !== Number(level)) continue;
      seen.add(name);
      out.push({ name, level: lvl, uuid: u });
    }
  }
  out.sort((a, b) => ((a.level ?? 0) - (b.level ?? 0)) || String(a.name).localeCompare(String(b.name)));
  return out;
}

export async function names(readIndex, kind = null) {
  const out = { classes: [], subclasses: {}, species: [], backgrounds: [], feats: {} };
  const read = async (id, fields) => (await readIndex(id, fields)) ?? [];
  for (const e of await read("dnd-players-handbook.classes", ["type", "system.identifier", "system.classIdentifier"])) {
    if (e.type === "class") out.classes.push(e.name);
    if (e.type === "subclass") (out.subclasses[e.system?.classIdentifier ?? "?"] ??= []).push(e.name);
  }
  for (const e of await read("dnd-players-handbook.origins", ["type", "system.type.value"])) {
    if (e.type === "race") out.species.push(e.name);
    if (e.type === "background") out.backgrounds.push(e.name);
  }
  for (const e of await read("dnd-players-handbook.feats", ["type", "system.type.value", "system.type.subtype"])) {
    if (e.type !== "feat") continue;
    (out.feats[e.system?.type?.subtype || "other"] ??= []).push(e.name);
  }
  const sort = a => a.sort((x, y) => x.localeCompare(y));
  sort(out.classes); sort(out.species); sort(out.backgrounds);
  for (const k of Object.keys(out.subclasses)) sort(out.subclasses[k]);
  for (const k of Object.keys(out.feats)) sort(out.feats[k]);
  const parts = { class: "classes", classes: "classes", subclass: "subclasses", subclasses: "subclasses",
                  species: "species", race: "species", background: "backgrounds", backgrounds: "backgrounds",
                  feat: "feats", feats: "feats" };
  if (kind && parts[String(kind).toLowerCase()]) return { [parts[String(kind).toLowerCase()]]: out[parts[String(kind).toLowerCase()]] };
  return out;
}
