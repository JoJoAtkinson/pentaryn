/**
 * Pentaryn Dice — the API: implementations for the manifest rows.
 *
 * GLUE. May import core, adapter, settings and lib — never a feature file.
 */

import { HOOKS, NS, bindingLabel, clampCount, spawnGroups, statusOf } from "./dice-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, selectAllBinding, setting, settingsSnapshot } from "./settings.mjs";
import { clearSelection, dice3d, internals, listDice, ready, selectMine, selectedIds, spawn as spawnDice } from "./dsn-adapter.mjs";
import { buildApi } from "./lib/api.mjs";
import { fail, ok } from "./lib/errors.mjs";
import { publishedOf } from "./lib/publish.mjs";

const userId = () => globalThis.game?.user?.id ?? null;

async function spawn(opts = {}) {
  const { type, count = 1, dryRun = false } = opts ?? {};
  const groups = spawnGroups(type, count);
  if (!groups) return fail("BAD_ARGS", `not a die type: ${JSON.stringify(type ?? null)}`);
  if (dryRun) return ok({ dryRun: true, type, requested: groups.length, dice: groups.flat().map(d => d.type) });
  if (!ready()) return fail("NOT_READY", "Dice So Nice's persistent dice are not available (module off, setting off, or not built yet)");
  const out = await spawnDice({ type, count: clampCount(count) });
  return ok(out);
}

function status() {
  return statusOf({
    enabled: setting("enabled"),
    active: !!dice3d(),
    persistentDice: ready(),
    dice: listDice(),
    selectedIds: selectedIds(),
    userId: userId(),
    shortcut: bindingLabel(selectAllBinding()),
    internals: internals(),
  });
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, {
    spawn,
    selectMine: (opts = {}) => selectMine({ userId: userId(), type: opts?.type ?? null }),
    clearSelection: () => clearSelection(),
    status,
    selftest: () => internals(),
  }, {
    contributions: ctx.contributions,
    members: {
      settings: () => settingsSnapshot(),
      trace: () => ctx.log.traces(),
      uninstall: () => ctx.uninstall(),
    },
    extras: () => ({
      settings: SETTINGS,
      events: HOOKS,
      hooks: ctx.reg.ids(),
      patches: [],
      published: publishedOf(NS),
    }),
  });
}
