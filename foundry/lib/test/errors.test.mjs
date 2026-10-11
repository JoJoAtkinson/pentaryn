import { test } from "node:test";
import assert from "node:assert/strict";
import { CODES, KIT_VERSION, PentarynError, RESERVED, codedError, errorCode, fail, isCoded, ok, toFail } from "../errors.mjs";

test("codedError carries the code in the property and the message prefix", () => {
  const e = codedError("NOT_FOUND", "actor Esren", { tried: 3 });
  assert.ok(e instanceof PentarynError && e instanceof Error);
  assert.equal(e.message, "NOT_FOUND: actor Esren");
  assert.equal(e.code, "NOT_FOUND");
  assert.deepEqual(e.extra, { tried: 3 });
  assert.equal(codedError("NOT_GM").message, "NOT_GM");
});

test("errorCode reads the property, then the prefix (what survives the socket)", () => {
  assert.equal(errorCode(codedError("AMBIGUOUS", "x")), "AMBIGUOUS");
  assert.equal(errorCode(new Error("NO_GM: pentaryn-x.inspect")), "NO_GM");
  assert.equal(errorCode(new Error("plain failure")), null);
  assert.equal(errorCode(new Error("lower: no")), null);
  assert.equal(errorCode(new Error("CUSTOM_X: y"), CODES), null);
  assert.equal(errorCode(null), null);
  assert.ok(isCoded(new Error("TIMEOUT: 10s"), "TIMEOUT"));
});

test("ok / fail / toFail shapes", () => {
  assert.deepEqual(ok({ n: 1 }), { ok: true, n: 1 });
  assert.deepEqual(fail("REFUSED", "no", { id: "a" }), { ok: false, code: "REFUSED", reason: "no", id: "a" });
  assert.deepEqual(toFail(codedError("CONFLICT", "held")), { ok: false, code: "CONFLICT", reason: "CONFLICT: held" });
  assert.deepEqual(toFail(new Error("boom")), { ok: false, code: "INTERNAL", reason: "boom" });
});

test("constants are frozen and the version is a semver", () => {
  assert.ok(Object.isFrozen(CODES) && Object.isFrozen(RESERVED));
  assert.match(KIT_VERSION, /^\d+\.\d+\.\d+$/);
  assert.deepEqual([...RESERVED].sort(), ["contract", "describe", "inspect", "selftest", "settings", "trace", "uninstall", "version"]);
});
