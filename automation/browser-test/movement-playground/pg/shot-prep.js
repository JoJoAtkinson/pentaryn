// hide the Foundry UI and any stuck Dice So Nice canvas, view ZZ Playground, pan to PGSHOT = {x,y,scale}
for (const sel of ["#interface", "#notifications", "#ui-top", "#ui-left", "#ui-right", "#ui-bottom", "#hud", "#dice-box-canvas", ".dice-so-nice", "#pause", ".notification", "#scene-controls"]) document.querySelectorAll(sel).forEach(e => { e.style.display = "none"; });
const sc = game.scenes.getName("ZZ Playground");
if (canvas.scene?.id !== sc.id) { await sc.view(); for (let i = 0; i < 60 && !(canvas.ready && canvas.scene?.id === sc.id); i++) await new Promise(r => setTimeout(r, 250)); }
const s = globalThis.PGSHOT ?? { x: 5000, y: 5000, scale: 0.1 };
await canvas.animatePan({ x: s.x, y: s.y, scale: s.scale, duration: 0 });
await new Promise(r => setTimeout(r, 1200));
return [canvas.scene.name, canvas.stage.scale.x];
