// riders-maint-02 (pure refactor): claimedHeal releases its claim stamp through one `release()`
// helper instead of two copies of the same finally block, and waitForResult reads the winner's
// record through recordedAnswer instead of its own result/error branches. Behaviour is pinned by
// battle-medic.test.mjs and its goldens (unchanged); this pins the shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../battle-medic.mjs", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
const fn = name => {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const next = src.indexOf("\nfunction ", start + 1), nextAsync = src.indexOf("\nasync function ", start + 1);
  const ends = [next, nextAsync, src.indexOf("\nexport ", start + 1)].filter(i => i > -1);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
};

test("riders-maint-02: claimedHeal writes its claim release once, through one release() helper", () => {
  const body = fn("claimedHeal");
  assert.equal(body.match(/claim not released/g)?.length ?? 0, 1, "one release block");
  assert.equal(body.match(/await release\(\)/g)?.length ?? 0, 2, "both finally blocks call release()");
});

test("riders-maint-02: waitForResult answers through recordedAnswer, not its own result/error branches", () => {
  const body = fn("waitForResult");
  assert.match(body, /recordedAnswer\(/);
  assert.doesNotMatch(body, /entry\?\.(result|error)/);
});
