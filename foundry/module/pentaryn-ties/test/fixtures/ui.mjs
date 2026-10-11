/**
 * A generic "press every control" harness for the ties UI (wave 3 checkpoint). Mount a surface (its
 * HTML parsed by the fake DOM, then its own bind), inventory every node that got a listener, and for
 * each listener: mount afresh, find the node by its path, fire the event with a plausible payload
 * (a typed value, the next option, a toggled box, Enter), let promises and the mocked timers run out,
 * and record what it did — the ordered effect log, console lines, rerender requests.
 *
 * State carries from one control to the next (a write lands on the actor), so the rows are an
 * ordered script, deterministic for a given surface and world.
 */
import { mock } from "node:test";
import { settle } from "./world.mjs";

const flush = async (n = 4) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
};

/**
 * A node's identity across re-renders — not its position: tag, data-* and name when it has data-*
 * (its classes may carry state, e.g. a pip's `fill`), else tag, classes and name.
 */
const sigOf = n => {
  const data = Object.keys(n.dataset).length ? n.dataset : null;
  return JSON.stringify([n.tagName, data ? "" : n.className || "", data, n.name ?? null]);
};

/** Every node under root that holds a listener: `{ sig, nth, tag, className, dataset, events }`. */
export function listenersIn(root) {
  const out = [];
  const seen = new Map();
  const walk = n => {
    for (const c of n.nodes) {
      const sig = sigOf(c);
      const nth = seen.get(sig) ?? 0;
      seen.set(sig, nth + 1);
      const events = Object.keys(c.listeners).filter(k => c.listeners[k].length);
      if (events.length) out.push({ sig, nth, tag: c.tagName, className: c.className || undefined, dataset: Object.keys(c.dataset).length ? { ...c.dataset } : undefined, name: c.name, events });
      walk(c);
    }
  };
  walk(root);
  return out;
}

/** The nth node under root with this signature, or null. */
export function nodeBySig(root, sig, nth) {
  let k = 0;
  let hit = null;
  const walk = n => {
    for (const c of n.nodes) {
      if (hit) return;
      if (sigOf(c) === sig && k++ === nth) {
        hit = c;
        return;
      }
      walk(c);
    }
  };
  walk(root);
  return hit;
}

/** The value a user would put there. */
function interact(node, type) {
  if (type === "input" || type === "change" || type === "blur" || type === "focusout") {
    if (node.tagName === "SELECT") {
      const opts = node.options;
      const cur = opts.findIndex(o => (o.value ?? o.textContent) === node.value);
      const next = opts[(cur + 1) % Math.max(1, opts.length)];
      if (next) node.value = next.value ?? next.textContent;
    } else if (node.type === "checkbox" || node.type === "radio") node.checked = !node.checked;
    else if (node.type === "number" || node.type === "range") node.value = "7";
    else if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") node.value = `zz typed ${node.dataset.field ?? node.name ?? ""}`.trim();
  }
  if (type === "keydown" || type === "keyup") return { key: "Enter", code: "Enter" };
  return { clientX: 10, clientY: 10, button: 0 };
}

/**
 * @param {object} F       the world
 * @param {() => object} mount   builds the surface and returns its root (a FakeElement)
 * @returns {Promise<{ inventory, rows }>}
 */
export async function exercise(F, mount, { skip = () => false } = {}) {
  const first = await mount();
  const inventory = listenersIn(first);
  const listed = inventory.map(({ sig, ...rest }) => rest);
  const rows = [];
  for (const item of inventory) {
    for (const type of item.events) {
      if (skip(item, type)) continue;
      const root = await mount();
      const node = nodeBySig(root, item.sig, item.nth);
      if (!node) {
        rows.push({ tag: item.tag, className: item.className, dataset: item.dataset, nth: item.nth, type, missing: true });
        continue;
      }
      const mark = F.calls.length;
      const c0 = F.console.length;
      const extra = interact(node, type);
      let error = null;
      try {
        await settle(node.dispatch(type, extra));
        mock.timers.tick(2000);
        await settle(flush());
        mock.timers.tick(2000);
        await settle(flush());
      } catch (err) {
        error = String(err?.message ?? err);
      }
      rows.push({
        nth: item.nth,
        tag: item.tag,
        className: item.className,
        dataset: item.dataset,
        type,
        ...(error ? { error } : {}),
        calls: F.calls.slice(mark).filter(c => !c.op.startsWith("Hooks.")),
        console: F.console.slice(c0),
        after: { className: node.className || undefined, parent: node.parent?.className || undefined, hidden: node.hidden || undefined, value: node.value, checked: node.checked },
      });
    }
  }
  return { inventory: listed, rows };
}
