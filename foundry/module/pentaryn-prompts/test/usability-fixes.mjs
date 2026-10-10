/**
 * The usability-run fixes (2026-10), pure: the over-5 dry-run guard counts what was asked for, the
 * `remaining:` line never reads "none" when nothing reached a scene, MARKER_GONE says why, and a
 * MARKER_GONE row has no misleading "(markerDeleted=false)". Called from run.mjs.
 */

export async function run({ check, ok }) {
  const R = await import("../readback-core.mjs");

  /* ── the dry-run guard counts every requested replacement ───────────── */
  check("guard: 6 requested, none seen → required", R.needsDryRun({ requested: 6 }), true);
  check("guard: 5 requested → not required", R.needsDryRun({ requested: 5 }), false);
  check("guard: 6 requested, dry-run seen → not required", R.needsDryRun({ requested: 6, seen: true }), false);
  check("guard: 6 requested, skipDryRun → not required", R.needsDryRun({ requested: 6, skip: true }), false);

  /* ── remaining: unknown, not none, when every row failed before a scene ─ */
  check("remaining: counts", R.remainingLine({ s1: 3, s2: 0 }, [{ ok: true }]), "remaining: s1=3 s2=0");
  ok("remaining: all failed, no scene → unknown", R.remainingLine({}, [{ ok: false }, { ok: false }]).startsWith("remaining: unknown"));
  check("remaining: nothing asked → none", R.remainingLine({}, []), "remaining: none");
  check("remaining: no object → no line", R.remainingLine(undefined, []), null);

  /* ── MARKER_GONE says why ────────────────────────────────────────────── */
  const replaced = R.goneMessage({ pid: "p1", markerId: "m1", sceneName: "ZZ Arena", replacedBy: 'Token "ZZ Goblin" [t1]' });
  ok("gone: already replaced names the replacement", replaced.includes("already replaced") && replaced.includes('Token "ZZ Goblin" [t1]'));
  ok("gone: resized names the new marker", R.goneMessage({ pid: "p2", sceneName: "A", resizedTo: "m9" }).includes("resized on A (now marker m9)"));
  ok("gone: plain names the prompt and scene", R.goneMessage({ markerId: "m3", sceneName: "A" }).startsWith("m3 no longer on A"));

  /* ── the readback: no markerDeleted note on a MARKER_GONE row; unknown remaining ─ */
  {
    const rows = [{ id: "p1", label: "p1", kind: "npc", ok: false, code: "MARKER_GONE", error: "MARKER_GONE: " + replaced, markerDeleted: false }];
    const text = R.renderReplace({ dryRun: false, call: "pm-1", rows, remaining: { s: 2 } });
    ok("readback: MARKER_GONE row has no markerDeleted note", !text.includes("markerDeleted=false"));
    const other = R.renderReplace({ dryRun: false, call: "pm-1", rows: [{ ...rows[0], code: "CREATE_FAILED" }], remaining: { s: 2 } });
    ok("readback: other failures keep the markerDeleted note", other.includes("(markerDeleted=false)"));
    const dry = R.renderReplace({ dryRun: true, call: "pm-x", rows: [{ id: "p1", label: "p1", ok: false, code: "CALL_UNKNOWN", error: "CALL_UNKNOWN: pm-x" }], remaining: {} });
    ok("readback: failed dry run says remaining unknown", dry.includes("remaining: unknown") && !dry.includes("remaining: none"));
  }
}
