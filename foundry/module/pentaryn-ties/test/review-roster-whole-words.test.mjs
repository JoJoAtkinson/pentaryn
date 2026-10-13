/**
 * ext-11 [declared] (final review ties-core, 2026-10-12; defect wave 2): `tablePCs` dropped any
 * character whose name merely *contained* "marker", "crowd" or "hotspot", so a PC named "Crowder"
 * (or "Hotspotter", "Markerson") lost its Share switch in the GM's inspect window. The exclusion is
 * on whole words now — `/\b(marker|crowd|hotspot)\b/i` — which still drops the scene markers
 * ("Marker · 1", "Drow Commoner (crowd) 1", "Hotspot · Look") and keeps "Crowder". Pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tablePCs } from "../core/roster.mjs";

const pc = (id, name) => ({ id, name, type: "character", playerOwnerIds: [] });
const ids = actors => tablePCs(actors, [{ id: "gm", isGM: true }]).map(a => a.id);

test("ext-11: a PC whose name only contains marker/crowd/hotspot keeps its Share switch", () => {
  const actors = [pc("c", "Crowder"), pc("h", "Hotspotter Vane"), pc("m", "Markerson"), pc("k", "Ballad Quinn")];
  assert.deepEqual(ids(actors), ["c", "h", "m", "k"]);
});

test("ext-11: scene markers, crowd actors and hotspots named as whole words still stay out", () => {
  const actors = [
    pc("crowder", "Crowder"),
    pc("mk", "Marker · 1"),
    pc("cr", "Drow Commoner (crowd) 1"),
    pc("hs", "Hotspot · Look"),
    pc("hst", "Hotspot · Look (template)"),
    pc("up", "CROWD of Gawkers")
  ];
  assert.deepEqual(ids(actors), ["crowder"]);
});
