# Movement cleanup: paused 2026-11-25, resume with "start up"

Paused on purpose (Joe, to save tokens for other work; planned for Friday). Nothing is half done.

## Where it stands
- **Live on the world:** pentaryn-movement **0.10.2** (door plug fills the squares beside the leader; no page freeze on big drops over narrow ways). Live suite r6.1: pass 118, fail 0, no regressions.
- **Branch movement-0.9** (not merged; main untouched), HEAD `43581d17`:
  - pin-test fleet: 4 files, 248 new tests (773 module tests total), all green;
  - cleanup slices S1 dead code, S2 stop.mjs shared plumbing, S3 dedupe, S5 cores behind `core/` barrels: committed, behaviour identical (10,000-seed simulator digest identical);
  - S4 (walkFrom keys) measured and dropped: gain too small.
- **Not deployed:** the cleanup commits. The world keeps 0.10.2 until the final step.

## What is left (the resume workflow does all of it)
1. Slice S6: docs to the blueprint pattern, version 0.10.3 (see `cleanup-plan.md` S6).
2. Opus review of the whole cleanup diff (from `5debda95` to HEAD) and a Fable medium sign-off.
3. Deploy 0.10.3 (only when no real player is logged in), the final live playground suite (no regressions vs r6.1), docs, real-data census, backup push of the branch.
Estimate: about 4 to 5 hours, roughly 8 agents.

## How to start it
Say **"start up"** in a Claude Code session in `~/code/pentaryn`. Claude then:
1. checks `git log -1` is `43581d17` or a descendant, the tree is clean, and the world runs 0.10.2;
2. runs the Workflow tool with `scriptPath: automation/movement-cleanup/resume.wf.js` (absolute: `/home/joe/code/pentaryn/automation/movement-cleanup/resume.wf.js`).

## Files here
- `decisions.md`: Joe's binding decisions (read to the last line).
- `cleanup-plan.md`, `baseline.md`, `auto-decisions.md`: the cleanup plan, the test and simulator baseline, choices made without Joe.
- `sim-compare.sh` (+ `sim-digest.mjs`, `sim-baseline.txt`, `sim-digest-baseline.txt`): exits 0 only when the simulator over 10,000 seeds is identical to the pre-cleanup baseline. Outputs go to /tmp.
- `resume.wf.js`: the workflow for what is left.
