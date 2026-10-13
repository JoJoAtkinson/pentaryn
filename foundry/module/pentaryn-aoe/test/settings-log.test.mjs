// [declared] R8: the settings migration wrote its one line with a raw console.info, the only
// console call outside the kit log. It now goes through makeLog(MODULE).info. The line itself is
// byte-identical — glue.test.mjs still pins `info: pentaryn-aoe | npcSaveRollMode gmroll → gm`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../settings.mjs", import.meta.url), "utf8");

test("R8: settings.mjs makes no raw console call", () => {
  assert.doesNotMatch(src, /\bconsole\.(log|info|warn|error|debug)\s*\(/);
});

test("R8: the migration line goes through the kit log", () => {
  assert.match(src, /import \{[^}]*\bmakeLog\b[^}]*\} from "\.\/lib\/log\.mjs"/);
  assert.match(src, /\blog\.info\(`npcSaveRollMode \$\{stored\} → \$\{next\}`\)/);
});
