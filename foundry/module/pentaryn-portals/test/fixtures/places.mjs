/**
 * The standard synthetic world: a Prison with four teleport regions and a Fighting Pit they lead
 * to. Built fresh per call (new ids via `tag`) so tests that write do not leak into each other.
 */
export function places(W, tag = "") {
  const id = s => `${s}${tag}`;
  const pit = W.scene({
    id: id("ScnPit"), name: "Drow City — Fighting Pit (set-piece)", navName: "Fighting Pit", thumb: "thumbs/pit.webp", background: "maps/pit.webp",
    regions: [
      { id: id("RegPit"), name: "Pit gate", bounds: { x: 1000, y: 500, width: 100, height: 100 },
        flags: { "pentaryn-portals": { title: " The Fighting Pit ", img: "cards/pit.webp?v=abc", description: "Sand, <script>alert(1)</script>\nand cheering." } } },
      { id: id("RegStair"), name: "Stair", bounds: { x: 300, y: 300, width: 100, height: 100 } },
    ],
  });
  const prison = W.scene({
    id: id("ScnPrison"), name: "Drow Prison", background: null,
    regions: [
      { id: id("RegPassage"), name: "Passage → Pit", bounds: { x: 100, y: 200, width: 100, height: 100 },
        behaviors: [{ id: id("BhvPassage"), destinations: [`Scene.${id("ScnPit")}.Region.${id("RegPit")}`] }] },
      { id: id("RegFork"), name: "Fork", bounds: { x: 500, y: 200, width: 100, height: 100 },
        behaviors: [{ id: id("BhvFork"), destinations: [`Scene.${id("ScnPit")}.Region.${id("RegPit")}`, `..${id("RegCell")}`] }] },
      { id: id("RegCell"), name: "Cell", bounds: { x: 800, y: 800, width: 200, height: 100 } },
      { id: id("RegSecret"), name: "Secret", hidden: true, bounds: { x: 1200, y: 200, width: 100, height: 100 },
        behaviors: [{ id: id("BhvSecret"), revealed: false, destinations: [`Scene.${id("ScnPit")}.Region.${id("RegStair")}`] }] },
    ],
    tokens: [{ id: id("TokCaven"), name: "Caven", x: 100, y: 200 }],
  });
  const r = k => prison.regions.get(id(k)) ?? pit.regions.get(id(k));
  return {
    pit, prison,
    passage: r("RegPassage"), fork: r("RegFork"), cell: r("RegCell"), secret: r("RegSecret"), pitGate: r("RegPit"), stair: r("RegStair"),
    bPassage: r("RegPassage").behaviors.get(id("BhvPassage")),
    bFork: r("RegFork").behaviors.get(id("BhvFork")),
    bSecret: r("RegSecret").behaviors.get(id("BhvSecret")),
    caven: prison.tokens.get(id("TokCaven")),
  };
}

/** The core teleport dialog as Foundry 14 renders it, with the id `dialog-<behaviorUuid>-<tokenId>`. */
export function teleportDialog(W, behavior, tokenId, { question = "Teleport Caven to Passage → Pit in Drow City?", select = null } = {}) {
  const sel = select
    ? `<select name="destination">${select.options.map(u => `<option value="${u}"${u === select.value ? " selected" : ""}>${u}</option>`).join("")}</select>`
    : "";
  const root = W.doc.createElement("div");
  root.className = "application dialog";
  root.innerHTML = `<section class="window-content"><div class="dialog-content"><p>${question}</p>${sel}</div>
    <footer class="form-footer"><button type="button" data-action="yes">Teleport</button><button type="button" data-action="no" autofocus>Don't Teleport</button></footer></section>`;
  const app = {
    id: `dialog-${behavior.uuid}-${tokenId}`,
    position: { width: 400 },
    setPosition(p) { W.F.calls.push({ op: "setPosition", id: this.id, p }); },
  };
  return { app, root };
}
