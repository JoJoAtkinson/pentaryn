export const meta = {
  name: 'movement-cleanup-resume',
  description: 'Resume pentaryn-movement cleanup: slice S6 (docs, 0.10.3), Opus review, Fable sign-off, deploy 0.10.3, final live suite, handoff',
  phases: [
    { title: 'Build', detail: 'Opus: D door plug, F no freeze (tests first)', model: 'opus' },
    { title: 'Live', detail: 'Sonnet: deploy and run the playground suite (GPU + harness)', model: 'sonnet' },
    { title: 'Fix', detail: 'Opus: live defects, two rounds at most', model: 'opus' },
    { title: 'Pin', detail: 'Opus plans the test fleet; Sonnet writes it in parallel; baseline frozen', model: 'sonnet' },
    { title: 'Cleanup', detail: 'Opus plans slices; Sonnet does one slice at a time behind identical-behaviour gates', model: 'sonnet' },
    { title: 'Review', detail: 'Opus reviews the whole cleanup diff; Fable medium signs off on a compact brief', model: 'opus' },
    { title: 'Handoff', detail: 'Sonnet: deploy, final live suite, docs, census, backup push', model: 'sonnet' },
    { title: 'Resolve', detail: 'Fable medium, only when a step fails twice', model: 'fable' },
  ],
}

const REPO = '/home/joe/code/pentaryn'
const SP = '/tmp/claude-1000/-home-joe-code-pentaryn/55679b9c-70a1-48f9-a7c4-b38176ae5993/scratchpad'
const C = REPO + '/automation/movement-cleanup'
const MOD = 'foundry/module/pentaryn-movement'
const PG = 'automation/browser-test/movement-playground'

const GUARD = `

READ LAST: Joe's latest message was "take recomendaiton. then for cleanup. what the most effective and lightest way to clean this up… if there nothign else, your free to start this dynamic workflow". It is the orchestrator's mandate, not your task; returning only a reply to it is a failure. Do the task above and return what it asks for.`

const COMMON = `SETTING. Repo ${REPO}, branch movement-0.9 (HEAD 43581d17 = 0.10.2 + cleanup S1-S5 committed; the world runs 0.10.2; main untouched). Module ${MOD}. Foundry v14.370, dnd5e 6.1.1, host BOSS (WSL). Joe is away; FULL AUTO.
Read ${C}/decisions.md to its LAST line (binding; the 2026-11-25 blocks define this run). History: context/plans/pathfinding-2026-11.md §18 (esp. §18.9-18.10), context/plans/movement-0.10-handoff.md, use-doc context/foundry/movement.md, playground + suite ${PG}/ (run.sh, checks/, standing files, out/r5 = the 0.10.1 standing: HARD 0 failing). This run's folder: ${C} (decisions.md, cleanup-plan.md, baseline.md, sim-compare.sh — run it with OUT=$(mktemp -d) — auto-decisions.md). Earlier run's history: 0.10.2 (door plug, no freeze) live; r6.1 standing at ${PG}/suite/out/r6.1 (pass 118, fail 0); pin fleet 773 tests; cleanup S1-S3, S5 committed, S4 measured and dropped.

RULES
- Branch movement-0.9 only. Never merge or touch main. Never push (the last agent pushes the branch as backup).
- Commit only files you changed, by path (never git add -A/-u; foundry/logs/*.jsonl and ${PG}/suite/out/ stay uncommitted). Conventional subject with [declared]. Every commit message ends with exactly:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NjhnjUfZzADjGJjbQu6W5B
- export PATH=$HOME/.nvm/versions/node/v24.22.3/bin:$PATH
- Never read .cache/ .output/ .state/ .history/ .venv/. Secrets only via Infisical at the point of use; never print or store one.
- The Mac is off limits. On the world write only ZZ documents and this module's settings. Deploy (make foundry-movement-sync; module.json changed → relaunch world via the admin API, scripts/foundry/update/admin.py FoundryAdmin.ensure_world, then systemctl --user restart foundry-headless-gm) ONLY when no real (non-ZZ, non-Claude) user is logged in; check first, wait/retry up to 30 min if one is.
- Never wait for a human, never SendMessage. A human-type choice: take the option nearest decisions.md, append it to ${C}/auto-decisions.md, carry on. Return status blocked only if you truly cannot proceed.
- Foundry down or at /setup = the host: recover per context/foundry/ops.md and headless-gm.md, go on.
GATES (all must pass for green): make foundry-movement-check · make test · make foundry-module-index && make check-context · make foundry-movement-sim SEEDS=10000 (no failing class).
`

const STEP = { type: 'object', properties: {
  status: { type: 'string', enum: ['green', 'red', 'blocked'] },
  summary: { type: 'string' }, commits: { type: 'array', items: { type: 'string' } },
  numbers: { type: 'string' }, open: { type: 'array', items: { type: 'string' } } },
  required: ['status', 'summary', 'commits', 'open'] }

const LIVE = { type: 'object', properties: {
  deployed: { type: 'boolean' }, version: { type: 'string' },
  hardFails: { type: 'number' }, gatedFails: { type: 'number' },
  failing: { type: 'array', items: { type: 'string' } }, table: { type: 'string' }, regressions: { type: 'array', items: { type: 'string' } } },
  required: ['deployed', 'version', 'hardFails', 'failing', 'table', 'regressions'] }

const RESOLVE = { type: 'object', properties: {
  action: { type: 'string', enum: ['retry', 'accept', 'revert', 'skip'] }, why: { type: 'string' }, guidance: { type: 'string' } },
  required: ['action', 'why', 'guidance'] }

const short = (x) => (typeof x === 'string' ? x : JSON.stringify(x ?? null)).slice(0, 3500)

async function resolve(what, result) {
  return agent(`${COMMON}
You are the resolver (Fable, medium effort). A step of the workflow failed twice: "${what}". Its last report:
${short(result)}
Decide, faithful to Joe's decisions (decisions.md, last line) and his priorities (nothing stuck, no wrong charge, nothing through walls; a smaller safe result beats a risky one): retry (with concrete guidance), accept (ship as is; say what to record as a known limit), revert (undo this step's commits with git revert, keep the run going), or skip. Read whatever you need; change nothing yourself.${GUARD}`,
    { label: `Resolve: ${what}`, phase: 'Resolve', model: 'fable', effort: 'medium', schema: RESOLVE })
}

// A code step: run, one retry on red, then resolver.
async function codeStep(label, phaseName, prompt, model, effort) {
  let r = await agent(prompt + GUARD, { label, phase: phaseName, model, effort, schema: STEP })
  if (r && r.status === 'green') return r
  r = await agent(prompt + `\n\nNOTE: a previous attempt reported: ${short(r)}\nCheck git log -6 and git status, keep what is sound, finish the task.` + GUARD,
    { label: label + ' · retry', phase: phaseName, model, effort, schema: STEP })
  if (r && r.status === 'green') return r
  const v = await resolve(label, r)
  log(`${label}: resolver says ${v?.action}: ${v?.why}`)
  if (v?.action === 'retry') {
    r = await agent(prompt + `\n\nRESOLVER GUIDANCE (binding): ${v.guidance}\nPrevious report: ${short(r)}` + GUARD,
      { label: label + ' · resolved', phase: phaseName, model, effort, schema: STEP })
  } else if (v?.action === 'revert') {
    await agent(`${COMMON}\nRevert the commits of the step "${label}" (git revert, newest first; report: ${short(r)}). Run the gates; return status.` + GUARD,
      { label: label + ' · revert', phase: phaseName, model: 'sonnet', effort: 'medium', schema: STEP })
    return { status: 'reverted', summary: v.why, commits: [], open: [label + ' reverted: ' + v.why] }
  }
  return r ? { ...r, resolved: v } : { status: 'red', summary: 'died', commits: [], open: [label + ' died'] }
}

const LIVEP = (n, extra) => `${COMMON}
TASK: Live round ${n}. Make sure the latest committed module is deployed (bump nothing; the build steps set the version). Check status().version and selftest on the page. Then run the WHOLE playground suite on both paths (state harness + BOSS GPU Chrome over CDP; context/foundry/browser-testing.md, ${PG}/run.sh) as round "${n}", plus S05.q three consecutive times on the GPU page. ${extra}
Compare against the 0.10.2 standing (${PG}/suite/out/r6.1/summary.md, 0.10.2: pass 118, fail 0): list regressions (a check passing there and failing now) separately from known misses (S05.i, S15.b, S15.c, S11.a, state-path timing). Timing is judged on the GPU page. Clean up only chat by this run's ZZ users. Return the standing table, the failing ids with one line each, and regressions.${GUARD}`

// ---------------- Cleanup (resume) ----------------
phase('Cleanup')
const cplan = { slices: [ { id: 'S6', title: 'Docs to the pattern, version 0.10.3, records', files: ['README.md','CHANGELOG.md','module.json','movement-core.mjs','context/foundry/movement.md','context/foundry/README.md','context/plans/pathfinding-2026-11.md'], goal: 'See cleanup-plan.md S6 exactly (README <=250 lines in the blueprint C44 order, drag-help detail moved to movement.md, version 0.10.3 in module.json and movement-core VERSION, CHANGELOG, known-limits line, plan §18.13). Code behaviour identical: only the version string changes in code.', perf: false, risk: 'low' } ] }
const slices = cplan.slices
const liveFinal102 = { version: '0.10.2', hardFails: 0, regressions: [], failing: ['known misses only (r6.1: pass 118, fail 0)'] }
const PRIOR = [
 { id: 'S1', title: 'Dead code out', status: 'green', summary: 'commit 0c1a5682' },
 { id: 'S2', title: 'stop.mjs plumbing shared, every stop rule kept', status: 'green', summary: 'commit 7ea6e53c' },
 { id: 'S3', title: 'drop/file/ghost dedupe, shared constants and geometry', status: 'green', summary: 'commit 0e623d85' },
 { id: 'S4', title: 'walkFrom numeric keys', status: 'dropped', summary: 'measured 11% self time, below the keep threshold; reverted, nothing committed' },
 { id: 'S5', title: 'cores behind barrels in core/', status: 'green', summary: 'commit 43581d17' } ]

const done = [...PRIOR]
for (const s of slices) {
  const r = await codeStep(`Slice ${s.id}: ${s.title}`, 'Cleanup', `${COMMON}
TASK: cleanup slice ${s.id} "${s.title}" (risk ${s.risk}${s.perf ? ', performance' : ''}). Plan: ${C}/cleanup-plan.md (read your slice and the ones before it). Files: ${s.files.join(', ')}.
Goal: ${s.goal}
Behaviour must stay IDENTICAL. Before committing, all must pass: make foundry-movement-check, make test (counts no lower than ${C}/baseline.md), make foundry-module-index && make check-context, and ${C}/sim-compare.sh (deterministic simulator fields identical to the baseline). Do not edit the pin tests to make them pass; if a pin test fails, your change altered behaviour: undo that part. ${s.perf ? 'Measure before/after (Node bench or page dry run) and report numbers; keep only a real win.' : ''}
Report net lines removed per file. Commit with subject "refactor(movement): [declared] cleanup ${s.id} — ...". If you cannot make it pass, git checkout your changes and return red with why.`, 'sonnet', 'high')
  done.push({ id: s.id, title: s.title, status: r?.status, summary: short(r?.summary).slice(0, 600), numbers: r?.numbers ?? '' })
  log(`slice ${s.id}: ${r?.status}`)
}

// ---------------- Review ----------------
phase('Review')
const review = await agent(`${COMMON}
TASK: review the whole cleanup pass as the Opus orchestrator. Slices: ${short(done)}.
Read the full diff from 5debda95 (the last pin-test commit) to HEAD (git log/diff on ${MOD}), check every slice kept behaviour (look for subtle changes the tests could miss: event/hook order, async timing, notices' text, settings defaults, API shape, error handling), re-run all gates and ${C}/sim-compare.sh fresh. Fix small problems yourself (commit); revert a slice that is unsafe. Write a compact brief (≤600 words) for a Fable sign-off at ${C}/fable-brief.md: what changed, lines before/after per file, perf numbers, conformance before/after, any behaviour risk you see. Return status and the brief path in summary.`,
  { label: 'Opus review of cleanup', phase: 'Review', model: 'opus', effort: 'high', schema: STEP })
const SIGN = { type: 'object', properties: { verdict: { type: 'string', enum: ['ship', 'fix', 'revert-cleanup'] }, fixes: { type: 'array', items: { type: 'string' } }, why: { type: 'string' } }, required: ['verdict', 'fixes', 'why'] }
let sign = await agent(`${COMMON}
TASK: sign off the cleanup pass (Fable, medium effort). Read ${C}/fable-brief.md and spot-check the diff where the brief flags risk. Is behaviour preserved, is the code tighter and in the pattern of Joe's other modules, any perf change risky? Verdict: ship, fix (list concrete fixes), or revert-cleanup (keep 0.10.2 + pin tests, undo the slices).${GUARD}`,
  { label: 'Fable sign-off', phase: 'Review', model: 'fable', effort: 'medium', schema: SIGN })
if (sign?.verdict === 'fix') {
  await codeStep('Sign-off fixes', 'Review', `${COMMON}\nTASK: apply the sign-off fixes: ${short(sign.fixes)}. Behaviour identical; all gates and ${C}/sim-compare.sh pass. Commit.`, 'opus', 'high')
} else if (sign?.verdict === 'revert-cleanup') {
  await agent(`${COMMON}\nTASK: revert the cleanup slice commits (keep the 0.10.2 build, the live fixes and the pin tests). Why: ${short(sign.why)}. Run gates and ${C}/sim-compare.sh. Commit.` + GUARD,
    { label: 'Revert cleanup', phase: 'Review', model: 'sonnet', effort: 'medium', schema: STEP })
}

// ---------------- Handoff ----------------
phase('Handoff')
await agent(`${COMMON}\nTASK: if the cleanup shipped, set version 0.10.3 (module.json, VERSION, CHANGELOG "cleanup: no behaviour change; perf: …", README), make foundry-module-index && make check-context, commit, deploy per RULES. If it was reverted, leave 0.10.2. Return status.` + GUARD,
  { label: 'Version + deploy', phase: 'Handoff', model: 'sonnet', effort: 'medium', schema: STEP })
const liveEnd = await agent(LIVEP('r7', 'This is the final round after the cleanup: no regressions allowed against r6 either.'), { label: 'Live r7 (final)', phase: 'Handoff', model: 'sonnet', effort: 'high', schema: LIVE })
const hand = await agent(`${COMMON}
TASK: the handoff. Inputs — 0.10.2 live: ${short(liveFinal102).slice(0, 1200)}; final live: ${short(liveEnd).slice(0, 1500)}; cleanup slices: ${short(done).slice(0, 1500)}; sign-off: ${short(sign)}; review: ${short(review?.summary).slice(0, 800)}.
1. If the final live round shows a regression in a HARD check vs r6, revert to the last good version per decisions (git revert the cleanup commits, redeploy) and say so.
2. Docs: context/foundry/movement.md (known limits updated; door plug), plan §18.11 (this run: D, F, pin fleet, cleanup, numbers), the CHANGELOG, and update context/plans/movement-0.10-handoff.md: add a short "0.10.2/0.10.3" section to the checklist (what to look at: S07 door plug states, S05 drop feel with no freeze).
3. Census: real data unchanged (29 non-ZZ scenes, 8 real users, 333 actors, 26 journals); delete only chat by this run's ZZ users.
4. git push origin movement-0.9 (backup). Never main.
Return a ≤350-word report in summary: what's live, D and F before/after numbers, tests added, lines before/after, perf, conformance, the suite standing, what remains open (ranked).` + GUARD,
  { label: 'Handoff', phase: 'Handoff', model: 'sonnet', effort: 'high', schema: STEP })

return { slices: done, review: review?.status, sign: sign?.verdict, liveEnd: liveEnd && { version: liveEnd.version, hard: liveEnd.hardFails, regressions: liveEnd.regressions, failing: liveEnd.failing }, report: hand?.summary, open: hand?.open }
