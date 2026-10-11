/**
 * Characterisation (prompts checkpoint, wave 1): the gather readout — what `renderGather` prints
 * for the two scenario boards, a built thing whose description is HTML (live SF12: `<p>` paragraphs,
 * entities, cut at a sentence), and which `chars` `gather()` uses when the world setting cannot be
 * read (live SF13 / prompts-lookup-16). Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { buildView, renderGather } from "../geometry-core.mjs";
import * as F from "./fixtures.mjs";

const boards = () => buildView([F.warrenScene(), F.commonScene(true)]).view;

test("gather text for the two boards at the default chars (400) and at 160", () => {
  const view = boards();
  pinJSON("gather-text", { default: renderGather(view).split("\n"), chars160: renderGather(view, { chars: 160 }).split("\n") }, import.meta.url);
});

/** A built npc whose biography is HTML, as dnd5e stores it (live: 893 chars of `<p>…</p>`). */
const HTML_BIO = [
  "<p>Brakka keeps the toll bridge &amp; the ferry both. She took the post from her uncle and never gave it back.</p>",
  "<p><strong>Tactics.</strong> Fights from the bridge&#39;s narrow middle so only one attacker reaches her at a time; ",
  "throws the lantern into the river if the fight turns, then swims for the far bank.</p>",
  "<p>Carries the only key to the chain winch. She will trade it for safe passage &mdash; never for gold.</p>",
  "<p>Secret: she sold the old ferryman to the Ashfall Company and keeps his boots under the toll box.</p>"
].join("\n");

function htmlBoard() {
  const items = [
    F.prompt("p", "mid", 2, 2, "a toll keeper's dog"),
    F.built("brakka", 4, 2, { name: "Brakka", kind: "npc", type: "humanoid", description: HTML_BIO,
      prov: { prompt: "toll keeper", size: "mid", at: Date.UTC(2026, 9, 11), call: "pm-0b0b", pid: "p1", note: "holds the bridge" } })
  ];
  return buildView([F.sceneOf("h", "Bridge", items, [])]).view;
}

test("a built HTML description: stripped, paragraphs joined with ' / ', cut at a sentence (SF12)", () => {
  const view = htmlBoard();
  const rows = {};
  for (const chars of [60, 160, 240, 400, 2000]) {
    rows[chars] = renderGather(view, { chars }).split("\n").filter(l => l.startsWith("Description: "));
  }
  rows.stripped = view.built[Object.keys(view.built)[0]].description;
  pinJSON("gather-html-description", rows, import.meta.url);
});

test("gather() falls back to chars 400 when the gatherChars setting cannot be read", async () => {
  // D6 [declared] flipped this pin (was 160, prompts-lookup-16 / live SF13): one default, GATHER_CHARS = 400,
  // shared by the registered setting, gather.mjs's fallback and renderGather. Reachable only when the read throws.
  const { installFoundry } = await import("./kit/foundry-stub.mjs");
  const S = await installFoundry({ user: { id: "zzPlayerUser0001", name: "ZZ Player", isGM: false } });
  globalThis.performance ??= { now: () => 0 };
  try {
    const { gather } = await import("../gather.mjs");
    const log = console.log;
    console.log = () => {};
    let res;
    try {
      res = await gather({ scenes: "all", crops: "off" });   // nothing registered: every setting read throws
    } finally {
      console.log = log;
    }
    pinJSON("gather-fallback-chars", { opts: res.manifest.opts, counts: res.counts }, import.meta.url);
    assert.equal(res.manifest.opts.chars, 400);
  } finally {
    S.restore();
  }
});
