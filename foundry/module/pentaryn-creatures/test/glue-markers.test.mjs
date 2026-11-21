// Unit N — public and hidden token markers, the glue (markers.mjs, markers-menu.mjs). A player
// client with a stand-in ActiveEffect5e whose isConcealed is dnd5e 6.1.1's (dnd5e.mjs ~7713), so the
// wrap is checked against the rule it wraps: dnd5e's own reasons stand, owners/observers and the GM
// see everything, Bloodied follows the table whatever dnd5e.bloodied says, a dormant token shows
// nothing, and with the switch off dnd5e answers alone (the regression pin). Direct patch path;
// glue-markers-libwrapper.test.mjs covers the libWrapper route.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";
import { GM, MODULE, PLAYER, drain, registerSelf, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });

const W = await setupWorld({ player: true });
const { F } = W;

/* dnd5e stand-ins: the setting, the effect class, the status list */
globalThis.dnd5e = { settings: { bloodied: "player" } };
const BLOODIED_ID = "dnd5ebloodied000";
class ActiveEffect5e {
  static ID = { BLOODIED: BLOODIED_ID };
  constructor(o) {
    Object.assign(this, { system: {}, ...o, statuses: new Set(o.statuses ?? []) });
  }
  /** dnd5e 6.1.1 ActiveEffect5e#isConcealed, verbatim but for the stand-in names. */
  get isConcealed() {
    if (this.system.isConcealed) return true;
    if (this.dependentOrigin?.active === false) return true;
    if ((this.item?.system?.identified === false) && !game.user.isGM) return true;
    if (this.target?.testUserPermission(game.user, "OBSERVER")) return false;
    if ((this.id === this.constructor.ID.BLOODIED) && (dnd5e.settings.bloodied === "player")) {
      return this.target?.token?.disposition !== 1;
    }
    return false;
  }
  get isTemporary() {
    return !this.isConcealed;
  }
}
const dnd5eGetter = Object.getOwnPropertyDescriptor(ActiveEffect5e.prototype, "isConcealed").get;
F.CONFIG.ActiveEffect = { documentClass: ActiveEffect5e };
F.CONFIG.statusEffects = {
  bloodied: { id: "bloodied", name: "Bloodied", img: "icons/bloodied.svg" },
  prone: { id: "prone", name: "Prone", img: "icons/prone.svg" },
  charmed: { id: "charmed", name: "Charmed", img: "icons/charmed.svg" },
  concentrating: { id: "concentrating", name: "Concentrating", img: "icons/conc.svg" },
  dead: { id: "dead", name: "Dead <b>", img: "icons/dead.svg" },
};

/* registerMenu, which the stub lacks */
F.game.settings.menus = new Map();
F.game.settings.registerMenu = (ns, key, data) => F.game.settings.menus.set(`${ns}.${key}`, data);

/* the goblin (nobody's) on Alpha, hostile; the imp is the player's own */
const gob = F.game.actors.get("aGob");
const imp = F.game.actors.get("aImp");
const tGob = W.tok("tGob");
tGob.disposition = -1;
gob.getActiveTokens = () => [tGob];
F.canvas.ready = true;

registerSelf(F, manifestOf(new URL("..", import.meta.url)));
await import("../creatures.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
await drain();
mock.timers.tick(60);
await drain();
const api = F.game.pentaryn.creatures;
const { patches } = await import("../lib/patch.mjs");
const markers = await import("../markers.mjs");
const { menuHTML } = await import("../markers-menu.mjs");

const fx = (statuses, o = {}) => new ActiveEffect5e({ id: `fx${statuses.join("")}`, target: gob, statuses, ...o });
const bloodied = (o = {}) => new ActiveEffect5e({ id: BLOODIED_ID, target: gob, statuses: ["bloodied"], ...o });
const set = async (key, value) => {
  await F.game.settings.set(MODULE, key, value);
  await drain();
};

test("setup wraps ActiveEffect5e#isConcealed once, directly, recorded with its adjustments row", () => {
  const mine = patches().filter(p => p.name === "isConcealed");
  assert.deepEqual(mine, [{
    moduleId: MODULE, label: "ActiveEffect5e#isConcealed", name: "isConcealed", marker: "__pentarynCreaturesConcealed",
    via: "direct", adjustments: "creatures-dnd5e-effect-isconcealed",
  }]);
  const get = Object.getOwnPropertyDescriptor(ActiveEffect5e.prototype, "isConcealed").get;
  assert.notEqual(get, dnd5eGetter);
  assert.equal(get.__pentarynCreaturesConcealed, true);
  assert.equal(api.status().markersPatched, "direct");
  assert.equal(api.status().markers, true);
  assert.deepEqual(W.lines(), []);
});

test("a hostile creature, the defaults: Public statuses show, GM-only ones and spell icons do not", () => {
  assert.equal(fx(["prone"]).isConcealed, false, "Prone");
  assert.equal(fx(["dead"]).isConcealed, false, "Dead");
  assert.equal(fx(["charmed"]).isConcealed, true, "Charmed");
  assert.equal(fx(["concentrating"]).isConcealed, true, "Concentrating on an enemy: GM only");
  assert.equal(fx([]).isConcealed, true, "Mage Armor: an 'other' effect, GM only");
  assert.equal(fx([]).isTemporary, false, "a concealed effect draws no token icon");
  assert.equal(fx(["prone"]).isTemporary, true);
});

test("Bloodied follows its row whatever dnd5e.bloodied says (Public by default)", () => {
  dnd5e.settings.bloodied = "player";
  assert.equal(bloodied().isConcealed, false, "player: dnd5e would hide it; the table shows it");
  dnd5e.settings.bloodied = "all";
  assert.equal(bloodied().isConcealed, false, "all: shown, as dnd5e does");
  dnd5e.settings.bloodied = "player";
});

test("Bloodied set to GM only hides it even under dnd5e.bloodied = all", async () => {
  await set("markerTable", { statuses: { bloodied: "gm" } });
  dnd5e.settings.bloodied = "all";
  assert.equal(bloodied().isConcealed, true);
  dnd5e.settings.bloodied = "player";
  assert.equal(bloodied().isConcealed, true);
  await set("markerTable", {});
});

test("dnd5e's own reasons stand: system.isConcealed, a disabled origin, an unidentified item", () => {
  assert.equal(fx(["prone"], { system: { isConcealed: true } }).isConcealed, true);
  assert.equal(bloodied({ system: { isConcealed: true } }).isConcealed, true, "not mistaken for the Bloodied rule");
  assert.equal(fx(["prone"], { dependentOrigin: { active: false } }).isConcealed, true);
  assert.equal(fx(["prone"], { item: { system: { identified: false } } }).isConcealed, true);
});

test("the owner (and so an observer) sees every marker on their own creature", () => {
  const own = new ActiveEffect5e({ id: "fxOwn", target: imp, statuses: ["charmed"] });
  assert.equal(own.isConcealed, false);
  assert.equal(new ActiveEffect5e({ id: "fxOwn2", target: imp, statuses: [] }).isConcealed, false);
});

test("the GM sees everything, even on a dormant token", () => {
  tGob.flags[MODULE] = { dormant: { look: { name: "Goblin" } } };
  F.become({ userId: GM });
  try {
    assert.equal(fx(["charmed"]).isConcealed, false);
    assert.equal(fx([]).isConcealed, false);
  } finally {
    F.become({ userId: PLAYER });
    delete tGob.flags[MODULE];
  }
});

test("a friendly creature shows every marker; with the toggle off it follows the table", async () => {
  tGob.disposition = 1;
  try {
    assert.equal(fx(["charmed"]).isConcealed, false);
    assert.equal(fx([]).isConcealed, false);
    await set("markerTable", { friendlyAll: false });
    assert.equal(fx(["charmed"]).isConcealed, true);
    assert.equal(fx(["prone"]).isConcealed, false);
  } finally {
    tGob.disposition = -1;
    await set("markerTable", {});
  }
});

test("a dormant token conceals everything until it wakes, friendly or not", () => {
  tGob.flags[MODULE] = { dormant: { look: { name: "Goblin" } } };
  try {
    assert.equal(fx(["prone"]).isConcealed, true);
    assert.equal(bloodied().isConcealed, true, "a damaged statue does not give itself away");
    tGob.disposition = 1;
    assert.equal(fx(["prone"]).isConcealed, true);
  } finally {
    tGob.disposition = -1;
    delete tGob.flags[MODULE];
  }
  assert.equal(fx(["prone"]).isConcealed, false, "woken: the table again");
});

test("no token on the scene: the prototype token's disposition decides friendly", () => {
  const saved = gob.getActiveTokens;
  gob.getActiveTokens = () => [];
  gob.prototypeToken = { disposition: 1 };
  try {
    assert.equal(fx(["charmed"]).isConcealed, false);
    gob.prototypeToken = { disposition: -1 };
    assert.equal(fx(["charmed"]).isConcealed, true);
  } finally {
    gob.getActiveTokens = saved;
    delete gob.prototypeToken;
  }
});

test("the switch off: dnd5e answers alone (regression: Bloodied under player / all, everything else public)", async () => {
  await set("markers", false);
  try {
    dnd5e.settings.bloodied = "player";
    assert.equal(bloodied().isConcealed, true, "player: hidden on a hostile token, as dnd5e does");
    dnd5e.settings.bloodied = "all";
    assert.equal(bloodied().isConcealed, false, "all: shown");
    assert.equal(fx(["charmed"]).isConcealed, false, "every other marker is public, as before");
    assert.equal(fx([]).isConcealed, false);
    tGob.disposition = 1;
    gob.token = tGob;   // dnd5e reads target.token: an unlinked token's synthetic actor
    dnd5e.settings.bloodied = "player";
    assert.equal(bloodied().isConcealed, false, "player: shown on a friendly token");
  } finally {
    delete gob.token;
    tGob.disposition = -1;
    dnd5e.settings.bloodied = "player";
    await set("markers", true);
  }
});

test("a failure inside the check answers dnd5e's value and warns once", () => {
  W.lines();
  const broken = fx(["charmed"]);
  Object.defineProperty(broken, "statuses", { get() { throw new Error("renamed"); } });
  assert.equal(broken.isConcealed, false, "dnd5e's answer");
  assert.equal(broken.isConcealed, false);
  const lines = W.lines();
  assert.equal(lines.length, 1);
  assert.match(String(lines[0][1]), /marker check failed/);
});

test("a setting change redraws every token's effects; an arm, wake or disposition change redraws that token", async () => {
  W.flags = [];
  await set("markerTable", { other: "public" });
  const ids = F.canvas.tokens.placeables.map(p => p.id);
  assert.deepEqual(W.flags.filter(([, f]) => f.redrawEffects).map(([id]) => id), ids);
  await set("markerTable", {});
  W.flags = [];
  await tGob.update({ [`flags.${MODULE}.dormant`]: { look: { name: "Goblin" } } });
  assert.deepEqual(W.flags.filter(([, f]) => f.redrawEffects), [["tGob", { redrawEffects: true }]]);
  W.flags = [];
  await tGob.update({ name: "Goblin boss" });
  assert.deepEqual(W.flags.filter(([, f]) => f.redrawEffects), [], "other changes redraw nothing");
  await tGob.update({ [`flags.${MODULE}.dormant`]: null });
});

test("the Token markers menu: registered GM only, one row per status, the save stores overrides only", async () => {
  const menu = F.game.settings.menus.get(`${MODULE}.markerMenu`);
  assert.ok(menu, "registered");
  assert.equal(menu.restricted, true);
  assert.equal(menu.name, "PENTARYN_CREATURES.settings.markerMenu.name");
  assert.equal(typeof menu.type, "function");
  for (const k of [menu.name, menu.label, menu.hint]) assert.ok(F.game.i18n.has(k), k);

  const html = menuHTML(F.CONFIG.statusEffects, markers.currentTable(), k => k);
  for (const id of Object.keys(F.CONFIG.statusEffects)) assert.match(html, new RegExp(`name="status\\.${id}"`), id);
  assert.match(html, /name="status\.prone">\s*<option value="public" selected>/);
  assert.match(html, /name="status\.charmed">\s*<option value="public">[^<]*<\/option>\s*<option value="gm" selected>/);
  assert.match(html, /name="friendlyAll" checked/);
  assert.match(html, /Dead &lt;b&gt;/, "labels are escaped");
  for (const k of html.matchAll(/(PENTARYN_CREATURES\.[\w.]+)/g)) assert.ok(F.game.i18n.has(k[1]), k[1]);

  await menu.type.DEFAULT_OPTIONS.form.handler({}, null, { object: { "status.prone": "gm", "status.charmed": "public", other: "gm", friendlyAll: true } });
  await drain();
  assert.deepEqual(F.game.settings.get(MODULE, "markerTable"), { statuses: { prone: "gm", charmed: "public" } });
  assert.equal(fx(["prone"]).isConcealed, true);
  assert.equal(fx(["charmed"]).isConcealed, false);
  await set("markerTable", {});
});

test("uninstall restores dnd5e's getter and drops the record", () => {
  markers.uninstall();
  assert.equal(Object.getOwnPropertyDescriptor(ActiveEffect5e.prototype, "isConcealed").get, dnd5eGetter);
  assert.deepEqual(patches().filter(p => p.name === "isConcealed"), []);
  dnd5e.settings.bloodied = "player";
  assert.equal(bloodied().isConcealed, true, "dnd5e's rule again");
});
