/**
 * Final code review (ties-ui-rob-7): six async click handlers disabled their button, awaited a write
 * and had no catch — the inspect eye (token-hud), Study and Lore (Known tab), Mark as learned, Tell
 * them and Release (Attributes tab). A write that threw left the button disabled for good and the
 * failure surfaced as an unprefixed unhandled rejection with nothing on screen.
 * Ruling [declared]: one `guardClick(op, btn, fn, …)` in core/html.mjs disables the button, awaits the
 * work, logs `pentaryn-ties | <op>` (error) and shows an error toast on a throw, and re-enables the
 * button in `finally`.
 *
 * Integration with ties-core R8 (defect wave 2, deployed): `markLearned`, `grantKnowledge` and
 * `repairAllAncestry` no longer throw on a refused save — they answer `{ ok: false, reason:
 * "writeFailed" }`. That answer is guardClick's failure path too: the handler returns it, and the
 * player sees what a throw showed — the button enabled again, `pentaryn-ties | <op>` (error) in the
 * console, one "That didn't go through" toast. The write's own warning keeps the real error.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, LANG } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

const PC = "zzRob7Pc00000001";
const NPC = "zzRob7Npc0000001";
const REGISTRY = [
  { id: "city", title: "Vel", category: "City", secret: false, lore: [{ id: "c1", label: "Walls", dc: 11, skill: "his", text: "<p>Three rings.</p>", miss: "" }] },
  { id: "ward", title: "Salt Ward", category: "District", parent: "city", secret: false, lore: [] },
];

const F = await bootWorld({
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [
    { id: PC, name: "ZZ Rob7 PC", type: "character", flags: { "pentaryn-ties": { attributes: ["city"] } } },
    { id: NPC, name: "ZZ Rob7 NPC", flags: { "pentaryn-ties": { attributes: ["city"] } } },
  ],
  tokens: [
    { id: "zzRob7TokPc00001", actorId: PC, x: 100, y: 100 },
    { id: "zzRob7TokNpc0001", actorId: NPC, x: 300, y: 100 },
  ],
});
const { guardClick } = await import("../core/html.mjs");
const Known = await import("../known-ui.mjs");
const AUI = await import("../attributes-ui.mjs");
const pc = game.actors.get(PC);
const FAILED = LANG["PENTARYN_TIES.notify.clickFailed"];

/** An actor whose every read throws — the write behind the button fails on its first touch. */
const broken = new Proxy({}, {
  get() {
    throw new Error("zz write failed");
  },
});

/** Click `btn` with `lever` active; report what is left behind. */
async function press(btn, lever = () => () => {}) {
  const c0 = F.console.length;
  const n0 = F.calls.length;
  const undo = lever();
  let escaped = null;
  try {
    await btn.dispatch("click");
  } catch (err) {
    escaped = err; // today: the rejection escapes the listener
  } finally {
    undo();
  }
  return {
    escaped: escaped?.message ?? null,
    disabled: btn.disabled,
    console: F.console.slice(c0),
    toasts: F.calls.slice(n0).filter(c => c.op === "notify" && c.level === "error").map(c => c.message),
  };
}

/** game.actors.get hands back the broken actor for `id`. */
const brokenGet = id => () => {
  const real = game.actors.get.bind(game.actors);
  const m = mock.method(game.actors, "get", x => (x === id ? broken : real(x)));
  return () => m.mock.restore();
};

function assertGuarded(op, seen, { err = "zz write failed" } = {}) {
  assert.equal(seen.escaped, null, `${op}: the failure does not escape the listener`);
  assert.equal(seen.disabled, false, `${op}: the button is enabled again`);
  assert.ok(
    seen.console.some(l => l.level === "error" && l.text === `pentaryn-ties | ${op}` && l.err === err),
    `${op}: logged with the prefix: ${JSON.stringify(seen.console)}`
  );
  assert.deepEqual(seen.toasts, [FAILED], `${op}: one error toast`);
}

/** A write that ANSWERS writeFailed (R8): guarded like a throw, and the write's warning keeps the real error. */
function assertAnsweredFailed(op, seen, warning) {
  assertGuarded(op, seen, { err: "writeFailed" });
  assert.ok(
    seen.console.some(l => l.level === "warn" && l.text === `pentaryn-ties | ${warning}` && l.err === "zz write failed"),
    `${op}: the refused write's own warning carries the cause: ${JSON.stringify(seen.console)}`
  );
}

/** Every update / setFlag on `actor` is refused by the server. */
const refusing = actor => () => {
  const m = mock.method(actor, "setFlag", () => Promise.reject(new Error("zz write failed")));
  const u = mock.method(actor, "update", () => Promise.reject(new Error("zz write failed")));
  return () => (m.mock.restore(), u.mock.restore());
};

test("ties-ui-rob-7 guardClick: disabled while the work runs, re-enabled after, a throw logged and toasted", async () => {
  assert.equal(typeof guardClick, "function", "core/html.mjs exports guardClick");
  const btn = el("button");
  const lines = [];
  const toasts = [];
  const report = { log: { error: (...a) => lines.push(a) }, notify: op => toasts.push(op) };
  let during = null;
  await guardClick("zz ok", btn, async () => {
    during = btn.disabled;
  }, report);
  assert.equal(during, true, "disabled while running");
  assert.equal(btn.disabled, false, "enabled after success");
  assert.deepEqual([lines, toasts], [[], []]);

  const boom = new Error("zz boom");
  await guardClick("zz op", btn, async () => {
    throw boom;
  }, report);
  assert.equal(btn.disabled, false, "enabled after a throw");
  assert.deepEqual(lines, [["zz op", boom]]);
  assert.deepEqual(toasts, ["zz op"]);
});

test("ties-core R8 x ties-ui-rob-7 guardClick: a writeFailed answer is the failure path, like a throw", async () => {
  const btn = el("button");
  const lines = [];
  const toasts = [];
  const report = { log: { error: (...a) => lines.push([a[0], a[1]?.message]) }, notify: op => toasts.push(op) };
  const refused = { ok: false, reason: "writeFailed" };
  assert.equal(await guardClick("zz refused", btn, async () => refused, report), refused, "the answer comes back");
  assert.equal(btn.disabled, false, "enabled after a refused write");
  assert.deepEqual(lines, [["zz refused", "writeFailed"]]);
  assert.deepEqual(toasts, ["zz refused"]);

  // any other answer — ok, another refusal reason, nothing — is not a failure
  for (const out of [{ ok: true }, { ok: false, reason: "noLore" }, undefined, false, 3]) {
    await guardClick("zz quiet", btn, async () => out, report);
  }
  assert.equal(lines.length, 1, "nothing else logged");
  assert.equal(toasts.length, 1, "nothing else toasted");
});

test("ties-ui-rob-7 the HUD inspect eye: a throwing inspect re-enables the eye, logs and toasts", async () => {
  canvas.tokens.controlled = [canvas.tokens.get("zzRob7TokPc00001")];
  const left = el("div", { className: "col left" });
  const root = el("div", { className: "token-hud", children: [left, el("div", { className: "col right" })] });
  F.fire("renderTokenHUD", { object: canvas.tokens.get("zzRob7TokNpc0001") }, root);
  const eye = left.querySelector(".pt-inspect-btn");
  assert.ok(eye, "the eye is drawn");
  const seen = await press(eye, () => {
    const own = Object.getOwnPropertyDescriptor(pc, "isOwner");
    Object.defineProperty(pc, "isOwner", { configurable: true, get: () => broken.isOwner });
    return () => (own ? Object.defineProperty(pc, "isOwner", own) : delete pc.isOwner);
  });
  canvas.tokens.controlled = [];
  assertGuarded("inspect", seen);
});

test("ties-ui-rob-7 Known tab Study and Lore: a throwing request re-enables the button, logs and toasts", async () => {
  const root = el("div");
  root.innerHTML =
    `<div><button type="button" data-action="study" data-id="${NPC}"></button>` +
    `<button type="button" data-action="lore" data-id="${NPC}" data-lore="l1"></button></div>`;
  Known.bindKnown(root, pc, () => {});
  const [study] = root.querySelectorAll('[data-action="study"]');
  const [lore] = root.querySelectorAll('[data-action="lore"]');
  assertGuarded("study", await press(study, brokenGet(NPC)));
  assertGuarded("lore", await press(lore, brokenGet(NPC)));
});

test("ties-ui-rob-7 Attributes tab Mark as learned: a refused grant (writeFailed, R8) re-enables the button, logs and toasts", async () => {
  game.user.character = pc;
  const section = el("section");
  section.innerHTML = AUI.buildAttributesHTML(game.actors.get(NPC));
  AUI.bindAttributes(section.firstElementChild, game.actors.get(NPC), () => {});
  const [btn] = section.querySelectorAll(".pt-lore-btn").filter(b => b.dataset.action === "attr-learned");
  assert.ok(btn, "the button is drawn");
  const n0 = F.calls.length;
  const seen = await press(btn, refusing(pc));
  game.user.character = null;
  assertAnsweredFailed("attr-learned", seen, "mark as learned failed");
  assert.ok(
    !F.calls.slice(n0).some(c => c.op === "notify" && c.level === "info"),
    "no 'learned' toast for a grant that did not land"
  );
});

test("ties-core R8 x ties-ui-rob-7 Tell them and Fix it: a refused write (writeFailed) re-enables the button, logs and toasts", async () => {
  const section = el("section");
  section.innerHTML =
    `<div class="pentaryn-attributes"><div class="pt-world" data-character="${PC}">` +
    `<button type="button" class="pt-tell-btn" data-action="tell-one" data-id="city"></button>` +
    `</div><button type="button" data-action="attr-repair"></button></div>`;
  const npc = game.actors.get(NPC);
  AUI.bindAttributes(section.firstElementChild, npc, () => {});
  const [tell] = section.querySelectorAll('[data-action="tell-one"]');
  const [repair] = section.querySelectorAll('[data-action="attr-repair"]');
  assert.ok(tell.listeners.click?.length && repair.listeners.click?.length, "both are bound");
  // the knowledge ledger is a world setting: the server refuses that write
  const refuseSetting = () => {
    const real = game.settings.set.bind(game.settings);
    const m = mock.method(game.settings, "set", (mod, key, v) =>
      key === "attributeKnowledge" ? Promise.reject(new Error("zz write failed")) : real(mod, key, v));
    return () => m.mock.restore();
  };
  assertAnsweredFailed("tell-one", await press(tell, refuseSetting), "knowledge grant failed");

  // a membership whose parent is missing (ward without city), so Fix it has something to write
  const flags = npc.flags["pentaryn-ties"];
  const before = flags.attributes;
  flags.attributes = ["ward"];
  try {
    assertAnsweredFailed("attr-repair", await press(repair, refusing(npc)), "attribute link write failed");
  } finally {
    flags.attributes = before;
  }
});

test("ties-ui-rob-7 world tree Tell them and Release: a throwing write re-enables the button, logs and toasts", async () => {
  const section = el("section");
  section.innerHTML =
    `<div class="pentaryn-attributes"><div class="pt-world" data-character="${PC}">` +
    `<button type="button" class="pt-tell-btn" data-action="tell-one" data-id="city"></button>` +
    `<button type="button" class="pt-tell-btn" data-action="release-one" data-id="city"></button>` +
    `</div></div>`;
  AUI.bindAttributes(section.firstElementChild, game.actors.get(NPC), () => {});
  const [tell] = section.querySelectorAll('[data-action="tell-one"]');
  const [release] = section.querySelectorAll('[data-action="release-one"]');
  assert.ok(tell.listeners.click?.length && release.listeners.click?.length, "both are bound");
  assertGuarded("tell-one", await press(tell, brokenGet(PC)));
  assertGuarded("release-one", await press(release, brokenGet(PC)));
});
