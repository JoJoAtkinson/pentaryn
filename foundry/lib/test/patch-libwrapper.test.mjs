import { test } from "node:test";
import assert from "node:assert/strict";
import { libWrapperRoute } from "../patch-libwrapper.mjs";
import { unwrapAll, wrapMethod } from "../patch.mjs";

const spec = target => ({ target, label: "Token#_onClickLeft2", name: "_onClickLeft2", marker: "__pentarynLW", path: "CONFIG.Token.objectClass.prototype._onClickLeft2", type: "MIXED", adjustments: "x-dblclick" });

function env({ active = true, fails = false } = {}) {
  const regs = [];
  const warns = [];
  return {
    regs, warns,
    game: { modules: new Map([["lib-wrapper", { active }]]) },
    libWrapper: {
      register(pkg, path, fn, type) { if (fails) throw new Error("bad target"); regs.push([pkg, path, type]); return 7; },
      unregister(pkg, id) { regs.push(["unregister", pkg, id]); },
    },
    console: { warn: (...a) => warns.push(a[0]) },
  };
}

test("active libWrapper registers with the module id, path and type", () => {
  const g = env();
  const target = { _onClickLeft2() { return "orig"; } };
  const h = wrapMethod("pentaryn-x", spec(target), function (w, e) { return w(e); }, { via: libWrapperRoute({ g }), g });
  assert.equal(h.via, "libWrapper");
  assert.deepEqual(g.regs, [["pentaryn-x", "CONFIG.Token.objectClass.prototype._onClickLeft2", "MIXED"]]);
  assert.equal(target._onClickLeft2(), "orig");
  unwrapAll();
  assert.deepEqual(g.regs.at(-1), ["unregister", "pentaryn-x", 7]);
});

test("inactive, or a failed registration, falls through to a direct wrap (prompts' semantics)", () => {
  const off = env({ active: false });
  const t1 = { _onClickLeft2() { return "orig"; } };
  assert.equal(wrapMethod("pentaryn-x", spec(t1), (w) => "wrapped", { via: libWrapperRoute({ g: off }), g: off }).via, "direct");
  const bad = env({ fails: true });
  const t2 = { _onClickLeft2() { return "orig"; } };
  assert.equal(wrapMethod("pentaryn-x", spec(t2), (w) => "wrapped", { via: libWrapperRoute({ g: bad }), g: bad }).via, "direct");
  assert.deepEqual(bad.warns, ["pentaryn-x | libWrapper registration failed, wrapping by hand"]);
  assert.equal(t2._onClickLeft2(), "wrapped");
  unwrapAll();
});
