// Guard for the settings routing: every SETTINGS row's onChange reaches the handler registered
// for its own key (and no other). Pure: settings.mjs loads without Foundry globals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SETTINGS, onSettingChange } from "../settings.mjs";

test("every SETTINGS row's onChange reaches the handler registered for its own key", () => {
  const calls = Object.fromEntries(SETTINGS.map(row => [row.key, []]));
  for (const row of SETTINGS) onSettingChange(row.key, value => calls[row.key].push(value));
  SETTINGS.forEach((row, i) => {
    const value = `value-${i}`;
    row.onChange(value);
    for (const other of SETTINGS) {
      assert.deepEqual(calls[other.key], other.key === row.key ? [value] : [], `${row.key} → ${other.key}`);
    }
    calls[row.key].length = 0;
  });
});
