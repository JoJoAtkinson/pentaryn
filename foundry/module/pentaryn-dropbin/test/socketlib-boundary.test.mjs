// dropbin-M12 [declared]: socketlib-adapter.mjs is the only file that touches `socketlib`. The
// ledger's hot-reimport branch (install() after ready) asks the adapter's socketlibPresent()
// instead of probing globalThis.socketlib itself; behaviour is unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("only socketlib-adapter.mjs reads globalThis.socketlib (dropbin-M12)", () => {
  const offenders = readdirSync(root)
    .filter(f => f.endsWith(".mjs") && f !== "socketlib-adapter.mjs")
    .filter(f => /globalThis\.socketlib\b/.test(readFileSync(root + f, "utf8")));
  assert.deepEqual(offenders, []);
});

test("socketlibPresent() reports whether socketlib is loaded (dropbin-M12)", async () => {
  const { socketlibPresent } = await import("../socketlib-adapter.mjs");
  assert.equal(typeof socketlibPresent, "function");
  const saved = globalThis.socketlib;
  try {
    delete globalThis.socketlib;
    assert.equal(socketlibPresent(), false);
    globalThis.socketlib = { registerModule: () => ({ register() {} }) };
    assert.equal(socketlibPresent(), true);
  } finally {
    if (saved === undefined) delete globalThis.socketlib; else globalThis.socketlib = saved;
  }
});
