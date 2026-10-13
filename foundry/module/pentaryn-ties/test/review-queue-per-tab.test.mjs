/**
 * ties-core-U2 [declared] (final review ties-core, 2026-10-12; defect wave 2): the attribute registry
 * and the world-knowledge / attribute-belief settings queue their writes per tab, not across tabs. The
 * queue (`writeChain` in attributes.mjs, the `serialStore`s in settings.mjs) is an in-memory promise
 * chain, so it protects writes made from ONE client. A Review-panel save in the GM's browser racing an
 * `A.update` from the MCP bridge tab is a read-modify-write of a whole setting with a one-round-trip
 * window and no server-side merge: the second write wins. A world setting cannot be claimed or
 * compare-and-set written, so there is no storage redesign — the comments (and the README's "who
 * writes" section) now say what the queue does and does not cover. Pinned against the source text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

/** The comment block that ends right before `anchor`. */
function commentBefore(src, anchor) {
  const at = src.indexOf(anchor);
  assert.ok(at > 0, `anchor ${anchor} found`);
  const head = src.slice(0, at);
  const open = head.lastIndexOf("/*");
  return head.slice(open);
}

test("ties-core-U2: the registry queue comment says it covers one client, and a cross-tab race is last-write-wins", () => {
  const c = commentBefore(read("attributes.mjs"), "let writeChain");
  assert.doesNotMatch(c, /panel save racing Claude's `A\.update`\)/, "no longer lists the bridge-tab race as protected");
  assert.match(c, /one client/i);
  assert.match(c, /second write wins/i);
  assert.match(c, /cannot be claimed/i);
});

test("ties-core-U2: the knowledge/beliefs store comment says it covers one client, and a cross-tab race is last-write-wins", () => {
  const c = commentBefore(read("settings.mjs"), "const stores = {}");
  assert.match(c, /one client/i);
  assert.match(c, /second write wins/i);
  assert.match(c, /cannot be claimed/i);
});

test("ties-core-U2: the README's who-writes section says the setting queues are per tab", () => {
  const readme = read("README.md");
  const section = readme.slice(readme.indexOf("## Two sessions / who writes"), readme.indexOf("## Extending"));
  assert.match(section, /per tab/i);
  assert.match(section, /second write wins/i);
});
