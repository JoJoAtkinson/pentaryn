/**
 * Pentaryn Feedback — ADAPTER: the report store, one JSON file per report under the server's Data
 * folder (`Data/pentaryn-feedback/<worldId>/<id>.json`).
 *
 * Writes go through core's `FilePicker.upload` (only a GM client may upload — the reporter relays
 * through the active GM); reads are a plain static `fetch` of the Data path (Foundry serves Data/
 * at its route root). The repo's `scripts/feedback_reports.py` reads the same files from disk with
 * Foundry up or down. Precedents: dropbin's disk mirror, prompts' createDirectory.
 *
 * Injectable for tests: `fileStore({ fp, fetch, route })`; the defaults are read at CALL time from
 * `g`, so a test may also swap the globals after import.
 */

import { codedError } from "./lib/errors.mjs";

/** Parent folders of a Data-relative directory, outermost first: "a/b/c" → ["a", "a/b", "a/b/c"]. */
export function dirChain(dir) {
  const parts = String(dir).split("/").filter(Boolean);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** "a/b/c.json" → ["a/b", "c.json"]. */
export function splitPath(path) {
  const i = path.lastIndexOf("/");
  return i < 0 ? ["", path] : [path.slice(0, i), path.slice(i + 1)];
}

/**
 * @param {{ g?: object, fp?: object, fetch?: Function, route?: (path: string) => string, log?: object }} [opts]
 */
export function fileStore({ g = globalThis, fp = null, fetch: fetchFn = null, route = null, log = null } = {}) {
  const made = new Set();   // folders this tab already created (or found existing)
  const FP = () => fp ?? g.foundry?.applications?.apps?.FilePicker?.implementation ?? g.FilePicker;
  const doFetch = (...a) => (fetchFn ?? g.fetch)(...a);
  const url = path => (route ?? g.foundry?.utils?.getRoute ?? (p => `/${p}`))(path);

  /** Create every missing folder of `dir`. "Already exists" is the normal case after the first. */
  async function ensureDir(dir) {
    for (const d of dirChain(dir)) {
      if (made.has(d)) continue;
      try {
        await FP().createDirectory("data", d, {});
      } catch (err) {
        // EEXIST is expected; anything else surfaces at the upload that follows
        log?.debug?.(`createDirectory ${d}`, err?.message ?? err);
      }
      made.add(d);
    }
  }

  /** Write `value` as pretty JSON at the Data-relative `path`. Throws a coded error on refusal. */
  async function put(path, value) {
    const [dir, name] = splitPath(path);
    await ensureDir(dir);
    const File_ = g.File ?? globalThis.File;
    const file = new File_([JSON.stringify(value, null, 1)], name, { type: "application/json" });
    // v14 FilePicker.upload: the response (with `path`) on success; false, undefined or {} on failure
    const res = await FP().upload("data", dir, file, {}, { notify: false });
    if (!res?.path) throw codedError("INTERNAL", `upload of ${path} refused: ${res?.message ?? "no path in the response"}`);
    return path;
  }

  /** The parsed JSON at `path`, or null when there is no such file. */
  async function get(path) {
    const res = await doFetch(`${url(path)}?t=${Date.now()}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw codedError("INTERNAL", `fetch ${path}: HTTP ${res.status}`);
    return res.json();
  }

  async function exists(path) {
    return (await get(path)) !== null;
  }

  /** Data-relative paths of the `.json` files directly in `dir` ([] when the folder is missing). */
  async function list(dir) {
    let res;
    try {
      res = await FP().browse("data", dir);
    } catch (err) {
      log?.debug?.(`browse ${dir}`, err?.message ?? err);
      return [];
    }
    return (res?.files ?? []).map(f => decodeURIComponent(String(f))).filter(f => f.endsWith(".json")).sort();
  }

  return { ensureDir, put, get, exists, list };
}

let active = null;

/** The store the reporter and the API share (created on first use). */
export function store() {
  return (active ??= fileStore());
}

/** Swap the shared store — tests pass an in-memory one; `null` goes back to the default. */
export function useStore(s) {
  active = s;
}
