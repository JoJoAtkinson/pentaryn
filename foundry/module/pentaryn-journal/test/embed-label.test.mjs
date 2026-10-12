// journal-EC-5 (final review, journal-core.mjs embedsToLinks): an `@Embed[…]{label}` with no uuid was
// reduced to escapeHTML(label), but the label comes from page HTML and is already escaped, so
// "Tom &amp; Jerry" became "Tom &amp;amp; Jerry" (the player saw a literal "&amp;"). Now the label is
// kept as-is, exactly as the uuid branch keeps it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { embedsToLinks, sanitize } from "../journal-core.mjs";

test("journal-EC-5: a uuid-less embed keeps its already-HTML label unescaped", () => {
  assert.equal(embedsToLinks(`@Embed[caption=false]{Tom &amp; Jerry}`), "Tom &amp; Jerry");
  assert.equal(sanitize(`<p>@Embed[caption=false inline=true]{<em>Map</em> &lt;old&gt;}</p>`), "<p><em>Map</em> &lt;old&gt;</p>");
});

test("journal-EC-5: same label treatment as the uuid branch; no label gives empty", () => {
  assert.equal(embedsToLinks(`@Embed[X]{Tom &amp; Jerry}`), "@UUID[X]{Tom &amp; Jerry}");
  assert.equal(embedsToLinks(`@Embed[caption=false]`), "");
});

test("journal-EC-5: sanitize stays idempotent on a uuid-less embed", () => {
  const once = sanitize(`@Embed[caption=false inline=true]{A &amp; B}`);
  assert.equal(sanitize(once), once);
});
