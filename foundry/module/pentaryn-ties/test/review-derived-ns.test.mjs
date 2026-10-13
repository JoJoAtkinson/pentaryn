/**
 * ext-2 [declared] (final review ties-core, 2026-10-12; defect wave 2): a derived namespace's label,
 * icon and derive slot live in separate hand-kept lists — `DERIVED_NAMESPACES` (core), the
 * `deriveAttributes` pushes (core), `NS_LABEL` and `DERIVED_ICONS` (attributes.mjs) and the
 * `PENTARYN_TIES.attributes.ns.*` strings (lang/en.json). This guard fails the day a namespace is
 * added to one list and not the others, instead of a row silently drawing a raw key or the generic
 * icon. Standalone world; pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootWorld } from "./fixtures/world.mjs";
import { DERIVED_NAMESPACES, deriveAttributes } from "../known-core.mjs";

await bootWorld({});
const { NS_LABEL, DERIVED_ICONS } = await import("../attributes.mjs");
const EN = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
const langHas = key => key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), EN);
// the kind slot takes an actor id under its own name (`kindId`); every other slot is the namespace
const slotOf = ns => (ns === "kind" ? "kindId" : ns);

test("ext-2: NS_LABEL and DERIVED_ICONS are module exports", () => {
  assert.equal(typeof NS_LABEL, "object", "NS_LABEL is exported from attributes.mjs");
  assert.equal(typeof DERIVED_ICONS, "object", "DERIVED_ICONS is exported from attributes.mjs");
});

for (const ns of DERIVED_NAMESPACES) {
  test(`ext-2: derived namespace "${ns}" has a label in lang/en.json, an icon and a derive slot`, () => {
    const key = NS_LABEL?.[ns];
    assert.equal(typeof key, "string", `NS_LABEL.${ns}`);
    assert.equal(typeof langHas(key), "string", `${key} in lang/en.json`);
    assert.match(String(DERIVED_ICONS?.[ns] ?? ""), /^icons\/.+\.(webp|svg|png)$/, `DERIVED_ICONS.${ns}`);
    const ids = deriveAttributes({ [slotOf(ns)]: "x" });
    assert.ok(ids.some(id => id.startsWith(`${ns}:`)), `deriveAttributes emits ${ns}:… (got ${JSON.stringify(ids)})`);
  });
}

test("ext-2: no label or icon for a namespace that is not derived", () => {
  assert.deepEqual(Object.keys(NS_LABEL ?? {}).sort(), [...DERIVED_NAMESPACES].sort());
  assert.deepEqual(Object.keys(DERIVED_ICONS ?? {}).sort(), [...DERIVED_NAMESPACES].sort());
});
