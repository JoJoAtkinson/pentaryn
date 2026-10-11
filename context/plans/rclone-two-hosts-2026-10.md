---
title: "Two hosts, one cloud — rclone storage layer, host.py and the boot choice"
status: built 2026-10-11 on feature/rclone-hosts — see §14 for what differs from the design
last_modified: 2026-10-11
tags: [context, plans, foundry, cloud, rclone, hosts, backups]
---

# Two hosts, one cloud — rclone storage layer, host.py and the boot choice

**Read this when:** building or reviewing the change that lets the Mac and BOSS (Windows 11,
Foundry in WSL) share the OneDrive `DnD/foundry` folder through rclone, tag snapshots by
host, and ask Joe at boot whether to start from the newest cloud snapshot or the local
world. This is the design (history); the use-doc is `context/foundry/ops.md` §3. What the
build changed from this design, and why, is §14.
Recon of the code as it stands today (line numbers, Mac-only sites, bugs) is folded into
the sections below, so you do not need to re-map `cloud.py` first.

Decisions are Joe's (2026-10-11) and override anything older: **both machines go through
rclone; no lease or lock; a per-machine role (`primary` / `alt`) gates only the tunnel and
the Saturday updater; snapshots are tagged by host and pruned per host; boot defaults to
the newest cloud snapshot after telling Joe, never silently, and never when there is no
TTY.** Joe almost always boots on the primary (the Mac); the alt is for building addons and
testing in parallel, and when it does boot it wants the primary's latest world.

---

## 0. Shape of the change

```
scripts/foundry/
  host.py          NEW   platform defaults, ~/.config/pentaryn/env, HOST, ROLE, start/stop
  storage.py       NEW   Storage interface + FolderStorage + RcloneStorage + PENTARYN_CLOUD pick
  boot.py          NEW   based-on state file + the boot-choice algorithm + `choose` CLI
  cloud.py         MOD   all CLOUD_ROOT I/O via storage; host tag in names; per-host prune
  ops/service.py   MOD   up() calls boot.choose() first; tunnel_up() role-gated
  ops/config.py    MOD   FOUNDRY_DATA/APP from host.py (same value on the Mac as today)
  update/admin.py  MOD   process control from host.py; paths from host.py
  update/apply.py  MOD   gate() refuses off-primary; rollback point = own host's newest
  update/recover.py MOD  tar download-to-temp; newest_world_snapshot(host=HOST)
  update/plan.py   MOD   core version from host.py, not /Applications
Makefile           MOD   foundry-boot target; FROM= passthrough; role-gate messages
scripts/tests/test_cloud_storage.py, test_boot_choice.py, test_host.py   NEW
```

Nothing in the Mac flow changes shape: `make vtt-up` still backs up, unpacks assets,
starts Foundry, raises the tunnel — with one new step in front (§7) and one new question
when the cloud is ahead of the local world.

---

## 1. Storage layer — `scripts/foundry/storage.py`

Every operation `cloud.py` does on `CLOUD_ROOT` today goes through one small interface.
`cloud.py` keeps its *policy* (one-way rules, retention, coalescing, promotion); the
*mechanics* of touching the cloud move here.

### 1.1 Interface

```python
@dataclass(frozen=True)
class Entry:
    name: str          # basename
    size: int          # bytes
    mtime: float       # epoch seconds, UTC (rclone ModTime / os.stat st_mtime)

class Storage(Protocol):
    root: str                                            # display only
    def ls(self, sub: str) -> list[Entry]: ...           # one level, files only, no junk
    def exists(self, rel: str) -> bool: ...
    def read_text(self, rel: str) -> str | None: ...     # None when missing
    def write_text(self, rel: str, text: str) -> None: ...
    def download(self, rel: str, dest: Path) -> Path: ... # whole file to a local path
    def upload(self, src: Path, rel: str) -> None: ...   # atomic: temp name, then move (§1.4)
    def copy(self, src_rel: str, dst_rel: str) -> None: ... # within the cloud, server-side
    def delete(self, rel: str) -> None: ...              # missing file is not an error
    def mkdirs(self) -> None: ...                        # the four subfolders
```

`rel` paths are always `"<subfolder>/<name>"` relative to the cloud root, forward slashes,
never absolute. `cloud.py`'s `ASSETS_IN`, `WORLD_BACKUPS`, `SYSTEM_BACKUP`, `MAJOR_RELEASES`
become plain strings (`"assets"`, `"world-backups"`, …) rather than `Path`s. The one
`Path` the rest of the code still sees is the local temp file a `download` returns.

`StorageError(RuntimeError)` wraps every failure (rclone non-zero exit, timeout, missing
binary, folder permission error). Callers decide whether it is fatal (backup: yes) or
degradable (boot choice: no, §6.6).

### 1.2 `FolderStorage(root: Path)`

Today's behaviour: `Path` operations on a mounted folder. Used by the tests as the fake
cloud, and still the fallback on a Mac with the OneDrive app and no rclone remote.
`upload` = `shutil.copy2` to `<rel>.partial` then `os.replace`. `copy` = `shutil.copy2`.
`ls` skips `JUNK_NAMES` and anything starting with `.` or ending in `.partial`.

### 1.3 `RcloneStorage(remote_root: str, *, bin="rclone", runner=subprocess.run)`

`remote_root` looks like `onedrive:DnD/foundry`. `runner` is injected so tests can stub
rclone without a binary; the default `bin` comes from `$PENTARYN_RCLONE` → `shutil.which`
→ `/opt/homebrew/bin/rclone` / `/usr/local/bin/rclone`.

| Method | Command | Timeout |
| --- | --- | --- |
| `ls(sub)` | `rclone lsjson --files-only --no-mimetype --no-modtime=false <root>/<sub>` | 60 s |
| `exists(rel)` | `rclone lsjson --files-only <root>/<dir>` filtered by name (one call per dir, cached for the process) | 60 s |
| `read_text(rel)` | `rclone cat <root>/<rel>` (stdout); exit 3/4 (not found) → `None` | 60 s |
| `write_text(rel, text)` | `rclone rcat <root>/<rel>` with text on stdin | 60 s |
| `download(rel, dest)` | `rclone copyto <root>/<rel> <dest> --progress --stats-one-line --stats 5s` | none (size-based, §1.5) |
| `upload(src, rel)` | `rclone copyto <src> <root>/<rel>.partial …` then `rclone moveto <root>/<rel>.partial <root>/<rel>` | none / 120 s |
| `copy(a, b)` | `rclone copyto <root>/<a> <root>/<b>` (server-side on OneDrive) | 300 s |
| `delete(rel)` | `rclone deletefile <root>/<rel>`; exit 3/4 is success | 60 s |
| `mkdirs()` | `rclone mkdir <root>/<sub>` ×4 | 60 s |

Common flags on every call: `--retries 3 --low-level-retries 10 --contimeout 30s
--timeout 120s`. `--config` is **never** passed and the config path is never printed:
rclone finds its own config; our logs show only the command's verb and the `rel` path.
`stderr` of a failed call is attached to the `StorageError` after a one-line scrub that
drops any line containing `token`, `client_secret`, `access_token` or `Bearer` — rclone's
error output does not normally carry secrets, but the scrub costs nothing.

`lsjson` output → `Entry(name=Name, size=Size, mtime=parse(ModTime))`. ModTime is ISO-8601
with offset; parse to UTC epoch. OneDrive's listing gives directories too; `--files-only`
drops them, and names in `JUNK_NAMES` / `.partial` / dotfiles are dropped in Python.

### 1.4 Partial-upload safety

A 3 GB `copyto` interrupted at 2 GB must never look like a snapshot. Two layers:

1. **Name.** Upload goes to `<rel>.partial`; `ls` never returns `*.partial`, and
   `SNAPSHOT_NAME` does not match it, so nothing parses it as a snapshot. Only the
   server-side `moveto` (fast, atomic on OneDrive) produces the real name.
2. **Size check.** After `moveto`, one `lsjson` of the directory confirms the entry exists
   with `size == src.stat().st_size`. Mismatch → `delete(rel)` and raise `StorageError`.

Stale `*.partial` files (a crash between copyto and moveto) are swept by `ensure_cloud`:
any `.partial` in `world-backups/` or `system-backup/` older than 24 h is deleted with a
log line. Younger ones are left alone — the other machine may be mid-upload.

`FolderStorage` does the same with `.partial` + `os.replace`, so the tests exercise the
same two-step path.

### 1.5 Big transfers: progress, retries, no wall-clock timeout

`download` / `upload` run with `stderr` passed through to the terminal when it is a TTY
(`--progress` gives one updating line); under no TTY they use `--stats 30s
--stats-one-line --log-level NOTICE` so the ops log gets a line every 30 s instead of a
carriage-return mess. No wall-clock timeout on these two: a 3 GB upload over a slow uplink
can legitimately take 20 minutes, and rclone's own `--retries` / `--low-level-retries`
already cover flakiness. The guard against a hung rclone is a **stall** watchdog: if the
`.partial` file's size (via `ls`) has not grown in 10 minutes, kill the process and raise.
Simpler v1: no stall watchdog, just document it; add if a hang is ever seen.

`upload` retries the whole two-step once on a `StorageError` from `copyto` (not from the
size check) before giving up. `backup()` on a failed upload leaves the local temp tar in
place and prints its path, so a manual `rclone copyto` can finish the job.

### 1.6 Where the tar is built

`backup()` tars to a local temp file first — `FOUNDRY_DATA/.pentaryn-tmp/<name>` (same
filesystem as the data, outside `SNAPSHOT_PATHS`, so a half-written tar is never in a
snapshot) — then `storage.upload(tmp, f"world-backups/{name}")`, then deletes the temp.
`restore()` and `recover._restore_world_tar` do the reverse: `storage.download` to the
same temp dir, extract from there, delete. `mirror_systems` likewise. `FolderStorage`
pays one extra local copy (~3 GB, seconds on an SSD) for the uniform path; acceptable.

Disk: the temp dir needs ~3.5 GB free. `backup()` checks `shutil.disk_usage` first and
dies with a clear message if there is less than 2× the last snapshot's size.

### 1.7 Assets over rclone

`unpack_assets` today hashes every zip in the cloud on every run (`sha256_file(zp)`,
cloud.py:256), which over rclone would download everything each start. New flow:

1. `storage.ls("assets")` → zips not in the manifest, **or** whose `(size, mtime)` differ
   from the manifest's recorded `bytes` / `mtime`.
2. Only those are downloaded to temp, hashed, unpacked, and recorded (manifest gains an
   `mtime` field; existing entries without it are treated as "check once, then record").
3. Zips already in the manifest with matching size are skipped without a download.

Published zips are append-only (cloud.py docstring), so size+mtime is a safe cheap check
and the sha256 remains the record of truth once downloaded.

### 1.8 `PENTARYN_CLOUD` selection

```
PENTARYN_CLOUD unset   → if `rclone listremotes` (10 s timeout) lists `onedrive:`
                           → RcloneStorage("onedrive:DnD/foundry")
                         elif the Mac folder ~/Library/CloudStorage/OneDrive-Personal/DnD/foundry exists
                           → FolderStorage(that)
                         else → die("no cloud: set PENTARYN_CLOUD or run `rclone config`")
PENTARYN_CLOUD=/some/path          → FolderStorage(path)        (tests, offline work)
PENTARYN_CLOUD=onedrive:DnD/foundry → RcloneStorage(...)         (anything with a colon)
PENTARYN_CLOUD=mac-folder          → FolderStorage(the Mac default)  (explicit opt-out of rclone)
```

`storage.get()` is memoised per process. `cloud.py` stops computing `CLOUD_ROOT` at import
time: it calls `storage.get()` inside each entry point, so tests can set `PENTARYN_CLOUD`
in a fixture with no monkeypatching of module constants. `cloud status` prints which
implementation and root it picked (never the rclone config path).

Today on the Mac, with no `onedrive:` remote yet, the pick stays the folder — behaviour is
unchanged until Joe runs `rclone config`. The day he does, the Mac silently switches to
rclone; `cloud status` makes that visible.

---

## 2. `scripts/foundry/host.py`

One module that answers "which machine am I, what role do I have, where is Foundry, and
how do I start and stop it". Everything has a platform default and an env override.

### 2.1 Env file

`~/.config/pentaryn/env` (`$PENTARYN_ENV_FILE` to relocate), `KEY=value` lines, `#`
comments, no quoting rules beyond stripping one pair of matching quotes. Loaded once at
import by `host.py`; **real environment variables win** over the file. Not committed; the
repo ships `scripts/foundry/host.env.example` with every key and its default. On BOSS the
same keys may instead live in `~/.boss-env` (sourced by `BASH_ENV`) — either works, since
the environment wins.

### 2.2 Values

| Key | Mac default | Linux default | Notes |
| --- | --- | --- | --- |
| `PENTARYN_HOST` | sanitised `hostname -s` | same | `[a-z0-9-]{1,32}`: lower-cased, anything else → `-`, runs collapsed, trimmed. Must not be `untagged`, `latest`, `local` (reserved). Joe sets it explicitly on both (`mac`, `boss`); the sanitised default is a fallback and `cloud status` warns when it is in use |
| `PENTARYN_ROLE` | `primary` if `PENTARYN_HOST == PENTARYN_PRIMARY_HOST`, else `alt` | same | Derived, not set directly |
| `PENTARYN_PRIMARY_HOST` | `mac` | `mac` | The one value that must agree on both machines. The Mac is primary by default; switching = change it on both |
| `PENTARYN_ROLE_OVERRIDE` | unset | unset | `=primary` makes the tunnel and updater gates pass on this run, for when Joe deliberately runs from the alt. Logged loudly. Not persisted |
| `FOUNDRY_DATA` | `~/Library/Application Support/FoundryVTT` | `~/.local/share/FoundryVTT` | The **root** (Config/ Data/ Logs/), same meaning as `cloud.FOUNDRY_DATA` today. `ops/config.py:41` is renamed `FOUNDRY_DATA_DIR = host.FOUNDRY_DATA / "Data"` to end the two-meanings clash |
| `FOUNDRY_APP_ROOT` | `/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app` | probed: `~/foundryvtt` (Node.js build, v12 on: `main.js` and `package.json` at the top), else `~/foundryvtt/resources/app` (Electron build) — the first holding `package.json` | Already the override name used by `blueprint/new_module.py` and the node test kits |
| `FOUNDRY_PORT` | 30000 | 30000 | |
| `PENTARYN_CLOUD` | see §1.8 | see §1.8 | |
| `PENTARYN_RCLONE` | which/`/opt/homebrew/bin/rclone` | which/`/usr/local/bin/rclone` | |
| `PENTARYN_KEEP_SNAPSHOTS` | 10 | 10 | This host's retention |
| `PENTARYN_START_CMD` / `PENTARYN_STOP_CMD` | unset (use platform) | unset (use platform) | The BOSS hook, §2.4 |

### 2.3 App and version

`host.app_package_json()` = `FOUNDRY_APP_ROOT/package.json`; `host.core_version()` reads
its `version` (today's `cloud.core_version` and `update/plan.py:166` both move here).
`update/admin.py`'s `APP_DIR` / `APP_PAYLOAD` become `host.FOUNDRY_APP_ROOT` and its
parent chain; `recover.stash_core` / `recover_core` operate on `FOUNDRY_APP_ROOT`.

### 2.4 Process control — the BOSS hook

```python
def is_running() -> bool      # TCP probe of FOUNDRY_PORT (already the truth in service.py)
def start() -> None
def stop(timeout=30) -> None
def pid() -> int | None
```

- **Mac:** `start` = `open -a "Foundry Virtual Tabletop"`; `stop` = `osascript quit`, then
  `pkill -f MacOS/Foundry` after `timeout`; `pid` = `pgrep -f`. This is today's
  `service.up/down` and `admin.start_app/quit_app` with one home.
- **Linux (BOSS):** if `PENTARYN_START_CMD` / `PENTARYN_STOP_CMD` are set they are run via
  `bash -c` and are the whole story — BOSS's Claude owns what they do (a systemd user unit,
  a Windows-side scheduled task through `powershell.exe`, whatever keeps WSL awake). If
  unset, `start` runs `node $FOUNDRY_APP_ROOT/main.js --dataPath=$FOUNDRY_DATA --port=…`
  detached with `setsid`, logging to `FOUNDRY_DATA/Logs/pentaryn-start.log`; `stop` sends
  SIGTERM to the pid found by `pgrep -f "main.js --dataPath=$FOUNDRY_DATA"` and SIGKILL
  after `timeout`. Enough to run a session; not enough to survive WSL idling (§11).
- `update/notify.py` becomes a no-op off-Mac (prints the message, no `osascript`/`afplay`).
- Makefile `pbcopy` targets: `host.clipboard(text)` tries `pbcopy`, then `clip.exe`
  (WSL), then `xclip`, else prints "copy this:" + the text. `vtt-update-install`
  stays launchd and refuses off-Mac with a one-line message (§8).

---

## 3. Snapshot naming and the parser

```
world-<YYYY-MM-DD-HHMMSS>-fvtt<ver>-<host>.tar.gz      new
world-<YYYY-MM-DD-HHMMSS>-fvtt<ver>.tar.gz             2026-08-21 .. 2026-10-11, untagged
world-<YYYY-MM-DD-HHMMSS>.tar.gz                       before 2026-08-21, untagged, no version
```

```python
SNAPSHOT_NAME = re.compile(
    r"^world-(\d{4}-\d{2}-\d{2}-\d{6})(?:-fvtt([0-9.]+))?(?:-([a-z0-9-]+))?\.tar\.gz$")

@dataclass(frozen=True, order=True)
class Snapshot:
    stamp: str              # sort key 1 — the UTC stamp
    name: str               # sort key 2 — ties broken by name, so order is total
    host: str | None        # None → "untagged"
    core: str | None
    size: int
    mtime: float            # from Entry; the cross-host "newest" comparison uses this
    folder: str             # "world-backups" | "major-release"
```

The host group is `[a-z0-9-]+`, which is why `PENTARYN_HOST` is validated to exactly
that and may not contain `fvtt`-like ambiguity: the version group is greedy over
`[0-9.]`, the host group starts at the next `-`, so `world-…-fvtt14.369-boss.tar.gz`
parses unambiguously. A host name of pure digits and dots (e.g. `14`) is rejected by
validation for that reason.

**Stamps are UTC** from now on (`datetime.now(timezone.utc)`). Old stamps are local Mac
time; the design never compares stamps across hosts for "newer" — it compares `mtime`
from the storage listing, which is the server's clock for rclone and the file's mtime
for the folder (set by `copy2` to the local write time; both hosts' clocks are NTP, so a
few seconds of skew is irrelevant against a 5-day window). Stamps sort within a host and
name the file; `mtime` orders across hosts.

`cloud.snapshots(storage, folder="world-backups") -> list[Snapshot]` is the single parse
site; `restore`, `backup`, `boot`, `recover.newest_world_snapshot` and `status` all use
it. `recover.newest_world_snapshot(host=host.HOST)` filters to the own host (the updater's
rollback point must be this machine's state, not the other's).

---

## 4. Per-host retention, coalescing, promotion

All three of today's policies scope to `host == HOST`:

- **Prune:** `own = [s for s in snaps if s.host == HOST]`; delete `own[:-KEEP]`.
- **Coalesce (5-day replacement):** `_coalesce_target()` looks only at the newest *own*
  snapshot. The other host's snapshot from yesterday is never replaced by this host.
- **Promote to `major-release/`:** generation comparison uses the newest own snapshot's
  `core` vs the installed `core_version()`. The promoted copy keeps its full name (with
  host), so `major-release/` can hold one per host per generation. Never pruned, as today.
- **Digest marker:** `world-backups/.last-digest` was shared; it becomes **local**, part of
  the based-on state file (§5), so neither host can skip a backup because the other
  uploaded identical bytes. After a restore the digest of the restored tree is recorded
  too, so the next `backup` on this host sees "no change" and does not upload a 3 GB copy
  of what it just downloaded. (tar preserves mtimes; `snapshot_digest` uses int mtime +
  size + path, so the digest of the extracted tree is reproducible. Verify in the tests;
  if it is not stable, record `based_on` and make `backup` skip when the tree digest equals
  `state.digest_after_restore`.)
- **Untagged snapshots** (`host is None`) belong to nobody: never coalesced, never pruned,
  never promoted automatically. They are listed by `restore` and by the boot choice (as
  host `untagged`), and they age out only by hand (`make foundry-prune-untagged` — a
  deliberate target that lists them and asks). Today's eight or so ~3 GB files therefore
  stay until Joe deletes them; that is the safe choice and costs nothing but OneDrive
  space he already uses.
- **System mirrors** stay shared and un-tagged (`<system>-<ver>.tar.gz`): a system version
  is the same bytes on both hosts, and `exists` is the dedupe. Prune to the last 3 by
  *version* string, not by whichever host wrote them.

Two bugs in today's `restore` fall out naturally once the chosen snapshot is **downloaded
to temp before** `backup()` runs: (a) coalescing deleting the under-5-day snapshot being
restored and (b) pruning deleting the oldest-of-10 being restored can no longer lose the
bytes, because they are already local. `restore` is reordered: resolve → download →
`backup(reason="pre-restore safety copy")` → rmtree → extract.

---

## 5. The local "based-on" state file

**Where:** `FOUNDRY_DATA/pentaryn-boot.json` — at the data root, beside `Config/` and
`Data/`, outside `SNAPSHOT_PATHS`, so it never travels inside a snapshot and never gets
overwritten by a restore. Not in the repo's `.state/` (each worktree has its own, but
Foundry's data is one per machine). `$PENTARYN_BOOT_STATE` overrides (tests).

**Format:**

```json
{
  "schema": 1,
  "host": "mac",
  "based_on": "world-2026-10-11-030412-fvtt14.369-mac.tar.gz",
  "based_on_host": "mac",
  "based_on_mtime": 1760151852.0,
  "digest": "e3b0c442…",
  "keep_local_until_newer_than": "world-2026-10-11-053000-fvtt14.369-boss.tar.gz",
  "written": "2026-10-11T03:04:20Z",
  "by": "backup"
}
```

**When written** (always the whole file, atomically via `.tmp` + `os.replace`):

| Event | `based_on` | `digest` | `keep_local_until_newer_than` |
| --- | --- | --- | --- |
| Own `backup` uploads a snapshot | that snapshot | tree digest | cleared |
| Own `backup` skips (digest unchanged) | unchanged | unchanged | unchanged |
| `restore` (any host's snapshot, incl. `major-release/` and untagged) | that snapshot | digest of the extracted tree | cleared |
| Boot choice: Joe answers "local" | unchanged | unchanged | the newest cloud snapshot he declined |
| Boot choice: non-interactive notice | unchanged | unchanged | unchanged (never remembers on his behalf) |
| File missing / unparsable | treated as `based_on = None` → the boot choice sees every cloud snapshot as newer, which is the right first-run behaviour on BOSS and the right behaviour on the Mac the first time (it will show the Mac's own newest, Joe presses Enter or `l`, and the file is created) |

`digest` replaces `world-backups/.last-digest`. The old cloud marker is deleted by the
first `backup` of the new code (one `storage.delete`, ignore missing).

---

## 6. The boot choice — `scripts/foundry/boot.py`

### 6.1 Inputs

- `state` = §5 file (may be absent).
- `snaps` = `cloud.snapshots(storage)` from `world-backups/` **and** `major-release/`,
  all hosts, untagged included.
- `newest` = max by `(mtime, name)` over `snaps`.
- `FROM` = `$FROM` (set by make from `FROM=` on the command line) or `--from` argument.
- `interactive` = `sys.stdin.isatty() and sys.stdout.isatty() and not $PENTARYN_NONINTERACTIVE`.
  make passes stdin through, so `make vtt-up` at a terminal is interactive; launchd, a
  workflow agent and `ssh boss 'make …'` without `-t` are not.
- `running` = `host.is_running()`.

### 6.2 Algorithm

```
choose(FROM, interactive) -> Decision(action: "local" | "restore", snapshot: Snapshot | None, why: str)

1. if running:                 → local, "Foundry already up"           (never restore under a live server)
2. try snaps = list cloud      except StorageError as e:
                               → local, warn "cloud unreachable (<verb> failed): booting the local world"  (§6.6)
3. if FROM == "local":         → local, "FROM=local"
4. if FROM == "latest":        → restore newest, "FROM=latest"         (even if it equals based_on: Joe asked)
                                  no newest → local, warn "FROM=latest but the cloud has no snapshots"
5. if FROM is a name:          → restore that one, "FROM=<name>"; unknown name → die listing the names
                                  (an explicit wrong name is a typo, not a reason to boot something else)
6. if not newest:              → local, "cloud has no snapshots"
7. is_newer = state.based_on is None
              or newest.name != state.based_on and newest.mtime > state.based_on_mtime
   if not is_newer:            → local, "local world is based on the newest snapshot"
8. if state.keep_local_until_newer_than == newest.name:
                               → local, "you chose to keep the local world over <name> earlier"
9. if not interactive:         → local, NOTICE (§6.4)
10. prompt (§6.3):
      Enter / "latest" / "l"      → restore newest; clear keep_local
      "local" / "k"               → local; remember keep_local_until_newer_than = newest.name
      "<n>" (list index)          → restore that one
      EOF / Ctrl-C                → local, "no answer — booting local"  (same as non-interactive; nothing remembered)
```

A `restore` decision runs `cloud.restore(which=snapshot.name, yes=True, reason="boot")`,
which (§4 ordering) downloads, archives local first, then extracts — nothing is ever lost.
`reason="boot"` is logged in the ops log and in the safety copy's reason. After the
restore, `state.based_on` is the restored snapshot (§5), so the next boot is quiet.

Step 7 uses `mtime` for the cross-host comparison and the name only as the identity
check. A snapshot the same host just uploaded is `based_on` itself, so it is never
"newer". A snapshot from the other host that is older than `based_on` (the alt built
something last week; the primary played yesterday) is not newer, so the primary is not
asked. That is the whole rule Joe asked for: the alt gets asked about the primary's newest
work; the primary is asked only when the alt has really been used since.

### 6.3 Prompt text (interactive)

```
  ▸ cloud has a newer world snapshot than this machine's world:

      newest   world-2026-10-11-030412-fvtt14.369-mac.tar.gz   mac    2026-10-11 03:04 UTC   14.369   3.1 GB
      local    based on world-2026-10-09-221500-fvtt14.369-boss.tar.gz   boss   2026-10-09 22:15 UTC

    other snapshots (restore with FROM=<name>):
      2  world-2026-10-10-…-mac.tar.gz   mac   …
      3  world-2026-10-09-…-boss.tar.gz  boss  …
      (untagged and major-release snapshots: make foundry-restore)

  boot from [latest] or keep local?  (Enter = latest, l/latest, k/local, or a number)  >
```

"local" line when `based_on` is unknown: `local    (no record of which snapshot this
world is based on)`. Version mismatch (`newest.core != host.core_version()`) adds one
line: `  ! snapshot is from Foundry <x>, this machine runs <y> — Foundry will migrate on
first launch; a major-generation jump may not be reversible` and changes nothing else.

### 6.4 Non-interactive notice (one line, then boot local)

```
  ▸ boot: cloud snapshot world-2026-10-11-030412-fvtt14.369-mac.tar.gz (mac, 2026-10-11 03:04 UTC) is newer than this world (based on world-2026-10-09-…-boss.tar.gz); booting LOCAL. To use it: make foundry-up FROM=latest   (or: make foundry-restore SNAP=world-2026-10-11-030412-fvtt14.369-mac.tar.gz)
```

Also written to the ops log. Never remembered as a "keep local" answer. The Saturday
updater on the primary normally never sees this line (the primary's own backup is the
newest), and if it does, its run still proceeds on the local world as today.

### 6.5 `FROM=` overrides

`FROM=latest | local | <snapshot name>`; make exports it (`export FROM`) so every Python
step below `vtt-up` sees the same value. `FROM=` applies to the boot step only; the
pre-launch `backup-safe` and `assets` steps ignore it. CLI equivalent:
`python -m scripts.foundry.boot choose --from latest [--non-interactive] [--json]`.
`--json` prints the `Decision` without acting, for the tests and for an agent that wants
to know what would happen.

### 6.6 Failure modes — never block

| Failure | Behaviour |
| --- | --- |
| rclone missing, remote missing, network down, `lsjson` timeout (60 s) | boot local; one warning line naming the failed verb; no state change |
| `state` file corrupt | treat as absent, warn, boot per rule 7 (will ask); overwrite on next write |
| Restore chosen, download fails | `StorageError` → die **before** anything local is touched (download precedes the safety backup and the rmtree); Foundry is not started; message says `make foundry-up FROM=local` boots the local world |
| Restore chosen, safety `backup()` upload fails | die, local world intact (rmtree has not run); the temp tar path is printed |
| Restore chosen, extract fails mid-way | die with the safety copy's name and the `foundry-restore SNAP=` command to put it back; this is today's exposure and is unchanged |
| Foundry already running | boot local, say so (rule 1) |
| Two hosts both booting at once | allowed. Each sees the other's older snapshot as not-newer or asks; no lock. The worst case is both play on diverged worlds and the next boot asks; the safety copy means nothing is lost |

The boot step **never** exits non-zero for a cloud problem; only an explicit `FROM=<bad
name>` or a failed chosen restore does.

### 6.7 `Config/options.json` across hosts

Verified 2026-10-11: the Mac's `options.json` carries `dataPath` as the Mac absolute path,
`port`, `hostname`, `proxySSL`, `sslCert/sslKey`, `tempDir`, `world`, `updateChannel`.
Restoring a Mac snapshot on BOSS would plant a Mac `dataPath`. `restore` therefore keeps a
copy of the local `Config/options.json` (and `Config/admin.txt`, the admin password hash,
and `Config/license.json`) before the rmtree and **puts them back after** extraction. The
snapshot's copies are still inside the tar for forensic use. Everything else under
`Config/` (none today) follows the snapshot. The same holds for same-host restores — it
is simply always right to keep the machine's own `options.json`.

---

## 7. Make targets — same names on both machines

| Target | Change |
| --- | --- |
| `foundry-boot` | NEW: `$(PY) -m scripts.foundry.boot choose $(if $(FROM),--from $(FROM),)`. Runs the §6 algorithm and the restore if chosen |
| `foundry-up` | `foundry-boot` becomes a prerequisite; `service.up()` also calls `boot.choose()` itself when it starts Foundry (covers `make login`), guarded by an env flag `PENTARYN_BOOT_DONE=1` that `foundry-boot` exports so the choice runs once |
| `vtt-up` | `vtt-lock-check foundry-boot foundry-backup-safe foundry-assets foundry-up tunnel-up`. Boot **before** `backup-safe`: when Joe takes the latest, the restore already archived local, and the prelaunch backup then digest-skips rather than uploading 3 GB that is about to be replaced |
| `tunnel-up` / `vtt-up` | role gate (§8): off-primary prints the refusal and `vtt-up` stops **after** Foundry is up (so the alt still gets a running local Foundry; only the tunnel is refused). Exit 0 with a loud line, not a failure, because "Foundry up, no tunnel" is exactly what the alt is for |
| `foundry-restore` | unchanged interface; lists all hosts' snapshots with host and time columns; `SNAP=` accepts any host's name |
| `foundry-prune-untagged` | NEW, interactive, lists untagged snapshots and asks before deleting (§4) |
| `foundry-cloud` | status adds: storage implementation, HOST, ROLE, based_on, newest per host, untagged count |
| `vtt-update-install` / `-uninstall` / `vtt-update-now` | role gate; off-Mac `-install` additionally refuses (launchd) |
| `foundry-key` / `foundry-admin-key` | `host.clipboard` |
| `FROM` | documented in `make help` under `vtt-up` and `foundry-up` |

`test_make_targets.py` (`make -n`) gains: `vtt-up` order shows `foundry-boot` before
`foundry-backup-safe`; `foundry-up FROM=latest` passes `--from latest`; `foundry-boot`
alone is runnable.

---

## 8. Role gating — tunnel and updater only

```python
def require_primary(what: str) -> None:
    if host.ROLE == "primary" or os.environ.get("PENTARYN_ROLE_OVERRIDE") == "primary":
        if override: log("! PENTARYN_ROLE_OVERRIDE=primary — running <what> from the alt host <HOST>")
        return
    raise NotPrimary(f"{what} runs only on the primary host ({PRIMARY_HOST}); this is {HOST} ({ROLE}). "
                     f"Deliberately switching? PENTARYN_ROLE_OVERRIDE=primary make <target>")
```

Call sites: `service.tunnel_up()` (covers `make tunnel-up`, `vtt-up`, and
`recover.tunnel_up` which shells to `make tunnel-up`); `apply.gate()` beside the pause
check (covers `vtt-update-now` and the launchd run — the updater on the alt exits as
`Aborted`, logged, no notification spam); `automation/bin/vtt-update.sh` checks the same
via `python -m scripts.foundry.host require-primary updater` so a stray plist on BOSS does
nothing. Nothing else is gated: backup, restore, assets, `foundry-up`, `login`, MCP, all
run anywhere.

Switching primary = edit `PENTARYN_PRIMARY_HOST` in both env files. Nothing in the cloud
records the role, by design (no lease).

---

## 9. Updater interactions

- `apply.back_up` → `cloud backup --reason auto-update` unchanged; the rollback point is
  `recover.newest_world_snapshot(host=HOST)`.
- `admin.start_app` / `quit_app` → `host.start()` / `host.stop()`. These restart what was
  just backed up and **do not** run the boot choice (the updater is non-interactive, and a
  restore mid-update would invalidate its own rollback point). `service.up()` runs the
  choice only when `PENTARYN_BOOT_DONE` is unset *and* the caller is not the updater
  (`apply` sets `PENTARYN_BOOT_DONE=skip` in its environment at entry).
- `recover._restore_world_tar` → `storage.download` to temp, then extract, keeping the
  §6.7 `options.json` rule.
- Timestamps in the updater's snapshot-name parsing go through `cloud.snapshots`.

---

## 10. Tests

New files under `scripts/tests/`, no network, no real rclone, no Foundry.

**Fixtures (conftest.py additions, autouse where marked):**

- `fake_cloud` (autouse): `PENTARYN_CLOUD=<tmp>/cloud`, creates the four subfolders.
- `fake_data` (autouse): `FOUNDRY_DATA=<tmp>/data` with a tiny `Data/worlds/w/`,
  `Config/options.json` (with a `dataPath`), `Data/modules/m/`; `PENTARYN_BOOT_STATE`
  under it; `PENTARYN_HOST=testhost`, `PENTARYN_PRIMARY_HOST=testhost`.
- `two_hosts`: builds two `(data_dir, state_file, HOST)` tuples sharing one cloud folder;
  a helper `as_host(name)` swaps the env for a block.
- `fake_rclone`: a Python runner injected into `RcloneStorage` that implements `lsjson`,
  `cat`, `rcat`, `copyto`, `moveto`, `deletefile`, `mkdir`, `listremotes` against a temp
  folder, records every argv, and can be told to fail a given verb once (for retry tests)
  or hang (for timeout tests, with the timeout shortened to 0.2 s). Also asserts no argv
  ever contains `--config` or the string `token`.
- `tty(interactive: bool, answers: list[str])`: monkeypatches `isatty` and `input`.

**`test_cloud_storage.py`**

- Folder and rclone implementations pass the same parametrised contract: ls/exists/
  read/write/upload/copy/delete; upload leaves no `.partial`; a failing `copyto` leaves
  only `.partial` (never the final name) and raises; a failing size check deletes and
  raises; stale `.partial` older than 24 h swept by `ensure_cloud`, younger kept.
- `PENTARYN_CLOUD` selection: path → Folder; `x:y` → Rclone; unset + stub `listremotes`
  with/without `onedrive:` → Rclone/Folder; `mac-folder` → Folder.
- rclone argv snapshots for each verb (so a flag change is a visible diff).
- `read_text` on exit 3 → `None`; `delete` on exit 3 → no error; other exits → `StorageError`.
- Secret scrub: a stub stderr containing `access_token=…` is not in the raised message.

**`test_cloud_snapshots.py`**

- Parser: all three name shapes; host `None` for untagged; a host of `a-b-1`; rejects
  `.partial`; sorting by `(mtime, name)`.
- Per-host prune: 12 own + 5 other + 3 untagged → own trimmed to 10, others and untagged
  untouched.
- Coalesce only replaces own newest within 5 days; never the other host's.
- Promotion keys on the own host's newest.
- Digest marker is local; two hosts with identical trees both upload.
- After restore, own `backup` digest-skips (or, if the digest proves unstable, the
  fallback rule from §4 holds).
- The two old restore bugs: restoring own newest-under-5-days and own oldest-of-10 both
  succeed and leave the restored content in place.
- `options.json` / `admin.txt` / `license.json` preserved across a cross-host restore;
  everything else replaced.
- `backup` tars to temp then uploads; a failed upload leaves the temp tar and its path in
  the output; disk-space check dies with the message.
- System mirrors shared, pruned by version.

**`test_boot_choice.py`** — every row of §6.2 as a case, run against the two-host fixture:

- fresh host, no state → asks; Enter → restore newest; state written.
- own newest == based_on → quiet local.
- other host newer → asks; `k` → local and `keep_local_until_newer_than` set; second
  call → quiet local; a still-newer other-host snapshot → asks again.
- non-interactive with newer → local + the exact notice line (regex-matched, must
  contain `FROM=latest` and the `SNAP=` command); nothing remembered.
- `FROM=local`, `FROM=latest` (also when it equals based_on), `FROM=<name>`, `FROM=<bad>`.
- running Foundry → local, nothing listed.
- cloud down (runner raises / hangs past the 0.2 s timeout) → local + warning, exit 0,
  state unchanged.
- download failure after choosing restore → nothing under `FOUNDRY_DATA` changed.
- corrupt state file → asks, then rewrites.
- EOF at the prompt → local, nothing remembered.
- version-mismatch line present when cores differ.

**`test_host.py`**

- Env file precedence (env beats file beats default); example file lists every key.
- `PENTARYN_HOST` sanitising (`Joe's Mac.local` → `joe-s-mac`), rejections (`untagged`,
  `14`, empty, 40 chars).
- Role derivation and `PENTARYN_ROLE_OVERRIDE`; `require_primary` message text.
- Linux defaults chosen when `platform.system()` is patched to `Linux`; `START_CMD` hook
  invoked via `bash -c` with the exact string; Mac `start` argv is `open -a …`.
- `core_version` from a temp `package.json`.

**Existing tests:** `test_update_crash.py` / `test_update_window.py` keep passing with the
autouse fixtures (they stub `apply.back_up` already); `test_foundry_ops.py:498` becomes
an assertion on `host.FOUNDRY_DATA` under a patched `platform.system()` instead of a
darwin-only skip; `test_make_targets.py` extended per §7. Run everything with
`PENTARYN_TEST_SHIMS=1` on BOSS as the skill does today; nothing here needs the shims but
nothing conflicts with them.

---

## 11. BOSS hand-off note (for BOSS's Claude)

Goes to BOSS as a brief; the canonical skill copy is `C:\operations-win\skills\boss-remote\SKILL.md`.
Nothing on BOSS is changed from the Mac.

1. **Skill is stale:** it says the rclone `onedrive` remote is "not configured yet" and that
   the cloud code "must be ported to rclone". The remote is configured (Joe, 2026-10-11)
   and this plan is the port. Update both lines, and drop `vtt-*`, `foundry-up/down`,
   `login` from the macOS-only list once the branch lands (they run on Linux via `host.py`;
   `vtt-update-install` and `foundry-key`'s `pbcopy` path remain Mac).
2. **Env file** — create `~/.config/pentaryn/env` (or add to `~/.boss-env`; environment
   wins either way):
   ```
   PENTARYN_HOST=boss
   PENTARYN_PRIMARY_HOST=mac
   PENTARYN_CLOUD=onedrive:DnD/foundry          # your remote name, if not "onedrive:"
   PENTARYN_RCLONE=/usr/local/bin/rclone
   FOUNDRY_DATA=/home/joe/.local/share/FoundryVTT
   FOUNDRY_APP_ROOT=/home/joe/foundryvtt   # the folder holding package.json + main.js:
                                            # the Node.js build's top level (v12 on), or
                                            # resources/app inside the Electron build.
                                            # Unset = probe both (host.py). Check with
                                            # `python -m scripts.foundry.host show`: the
                                            # version must not read "unknown".
   FOUNDRY_PORT=30000
   PENTARYN_START_CMD=...                         # see 4
   PENTARYN_STOP_CMD=...
   ```
   Never put the rclone token or config path in this file; rclone reads its own config.
3. **Foundry Linux build:** needs Joe's Foundry account to download the Linux zip; unpack
   to `FOUNDRY_APP_ROOT`'s parent; first launch needs the licence key (Infisical, via the
   same helper the Mac uses — `scripts/foundry/README.md`). `Config/options.json` is created
   on first run with the Linux `dataPath`; the §6.7 rule keeps it across restores.
4. **Supervisor (the hook):** WSL idles and stops. Whatever keeps a session's Foundry alive
   is yours: a Windows Scheduled Task that runs `wsl -d Ubuntu -u joe -- …`, a `systemd
   --user` unit if systemd is enabled in the distro, or a `powershell.exe` keep-alive. Set
   `PENTARYN_START_CMD` / `PENTARYN_STOP_CMD` to whatever starts/stops it; `host.start()`
   / `host.stop()` just run them with `bash -c`, and `host.is_running()` is a TCP probe of
   `FOUNDRY_PORT`, so the commands must return promptly and leave Foundry listening. If
   unset, `host.py` falls back to a detached `node main.js`, which is fine for a test but
   dies with the VM.
5. **First boot on BOSS:** `make foundry-boot` (or `vtt-up`) will find no local state and
   offer the Mac's newest snapshot; Enter restores it (~3 GB download), archives nothing
   (there is nothing local yet; `backup` on a tree with no world is skipped), and writes
   `pentaryn-boot.json`. From then on BOSS's own backups are `…-boss.tar.gz` and prune
   only themselves. The prompt needs a terminal: over SSH use `ssh -t boss 'cd … && make
   vtt-up'`; without `-t` it boots local and prints the one-line notice (`FROM=latest` to
   take the newest without a prompt). If Foundry has never run on BOSS, the restored
   `Config/options.json` is the Mac's — `restore` rewrites its `dataPath` to BOSS's
   `FOUNDRY_DATA` and says so; once BOSS has its own `options.json`, it is kept as is.
6. **Tunnel / updater:** both refuse on BOSS by role; this is intended. `cloudflared` can
   stay unauthenticated. If Joe ever makes BOSS primary, he sets `PENTARYN_PRIMARY_HOST=boss`
   on both machines and authenticates `cloudflared` there — out of scope here.
7. **Tests:** `PENTARYN_TEST_SHIMS=1 .venv/bin/pytest` as today; the new tests need no
   rclone binary (a fake runner, `scripts/tests/cloud_fakes.py`). Every test runs against a
   temp cloud and a temp data root (conftest `fake_cloud` / `fake_data`, autouse).
8. **Check it from BOSS before the first boot:** `python -m scripts.foundry.host show` must
   print `host boss`, `role alt (primary host: mac)` and the Linux `data`/`app` paths;
   `make foundry-cloud` must print `cloud rclone onedrive:DnD/foundry` and list the Mac's
   snapshots under `snapshots mac:`. `PENTARYN_HOST` must be set explicitly on BOSS — off
   macOS the fallback is the sanitised hostname, which may not be `boss`.
9. **Off-Mac no-ops, by design:** `update/notify.py` prints instead of posting;
   `vtt-update-install` refuses (launchd); `foundry-key`/`foundry-admin-key` copy through
   `clip.exe` under WSL (or `xclip`) and never print the value.

---

## 12. Doc changes (after build)

| Doc | Change |
| --- | --- |
| `context/foundry/ops.md` | §3: "~4 MB" → "~2.5–3.2 GB"; "last 100" → "10 per host"; tree gains `major-release/` and the `-<host>` suffix; "Restore is never automatic, and never will be" → the boot choice (default latest after telling you; never without a TTY; `FROM=`); CloudStorage stall note → rclone note; quick table (:39-42) and lifecycle table (:160-183) gain `foundry-boot`; `open -a`/`osascript` rows say "via host.py"; :55 "a desktop app on this Mac" → "on the primary host (the Mac today)"; gotcha :749 |
| `context/foundry/automated-updates.md` | file table :102-112, shutdown rationale :250-251, retention/naming :253-270: host suffix, per-host retention, primary-only gate, rollback point = own host |
| `automation/README.md` | :11-15, :148-151, :157-172, :193-194 same substitutions; role gate in `vtt-update.sh` |
| `context/foundry/README.md` | :101 and :237 routing lines mention host.py and the boot step |
| `scripts/foundry/README.md` | make table :42-46 (`foundry-boot`, `FROM=`, `foundry-prune-untagged`); :174 path example → `$FOUNDRY_DATA`; new `host.env.example` reference |
| `cloud.py` docstring and the `README.txt` it writes | sizes; "Restoring is never automatic" → "never automatic without a TTY; at an interactive boot the default is the newest snapshot, after telling you"; per-host retention; `.partial` meaning |
| `context/foundry/ops.md` lifecycle | new row: "boot choice — compares the local based-on record with the newest cloud snapshot from any host" |
| boss-remote skill | via the §11 brief |
| `context/plans/README` / routing | this plan listed as history; `ops.md` §3 is the use-doc |

---

## 13. Build order (small commits)

1. `storage.py` + contract tests (Folder only). 2. `RcloneStorage` + fake runner tests.
3. `host.py` + env example + tests; `ops/config.py` rename; `admin.py` process control.
4. `cloud.py` on storage + host tag + per-host policies + restore reorder + `options.json`
   keep; tests. 5. `boot.py` + state file + tests. 6. make targets + `service.up` hook +
   role gates + `apply.gate`; `test_make_targets`. 7. `recover`/`apply` host filter and
   download-to-temp. 8. docs (§12). 9. Hand BOSS the §11 brief.

Out of scope: a lease/lock (rejected), moving `Data/modules` out of the snapshot (the
size lever, separate decision), making BOSS primary, cloudflared on BOSS.

---

## 14. Build record (2026-10-11) — what differs from the design above

Built on `feature/rclone-hosts` in commits `02973a92`..HEAD; tests:
`scripts/tests/test_cloud_storage.py`, `test_host.py`, `test_cloud_snapshots.py`,
`test_boot_choice.py`, `test_role_gates.py`, `test_make_targets.py` (extended).

| Design said | Built | Why |
| --- | --- | --- |
| `PENTARYN_HOST` defaults to the sanitised hostname everywhere | **`mac` on macOS**, the sanitised hostname elsewhere | Otherwise an unconfigured Mac (`joes-macbook-pro`) ≠ the default primary `mac`: it would become the alt and refuse its own tunnel and updater. Existing Mac behaviour must not change by default |
| State file code lives in `boot.py` | `scripts/foundry/bootstate.py` | `cloud.py` writes it (backup, restore) and `boot.py` imports `cloud`; a separate module avoids the import cycle |
| The restore's safety backup is an ordinary snapshot | Named `…-<host>.safety.tar.gz`; never coalesced (in either direction); never offered as "newest" by the boot choice; pruned by the per-host count | Without this, an alt that restored the Mac's latest over un-uploaded local work would upload its *discarded* state as the cloud's newest snapshot — and both machines' next boots would offer that junk as "newer". A coalescing safety copy could also replace, or be replaced by, the snapshot it was meant to protect |
| Boot `newest` over `world-backups/` **and** `major-release/` | `world-backups/` only (minus safety copies); `FROM=<name>` and `foundry-restore SNAP=` still accept either folder | A promoted copy is an *old generation* by definition; if a copy ever got a fresh mtime it would be offered as the default. The prompt already sent major-release to `make foundry-restore` |
| First run: no state → the Mac is asked once | If the legacy shared `world-backups/.last-digest` equals the local tree digest, the state file is created from it (`based_on` = newest untagged snapshot), quietly | The marker proves the Mac's world *is* that snapshot: no question on the Mac's first boot, and no 3 GB re-upload on its first backup. BOSS never matches it, so BOSS is asked |
| `restore` keeps local `options.json` / `admin.txt` / `license.json` | Same, plus: when there is **no** local `options.json` (Foundry never ran here), the snapshot's foreign `dataPath` is rewritten to this machine's root | BOSS's first boot would otherwise inherit the Mac's absolute `dataPath` |
| — | Snapshot names are never reused: a backup in the same UTC second as an existing name bumps the stamp by a second | A name is an identity (`based_on`, `keep_local_until_newer_than`); a same-second re-upload would overwrite in place and the coalescer then deleted it |
| `host.clipboard` falls back to printing "copy this:" + the text | Never prints; no clipboard tool → non-zero exit | What goes through it is the licence key or the admin password |
| `PENTARYN_ROLE_OVERRIDE` from env or file | Environment only | It is a per-run decision; a file setting would silently make the alt primary forever |
| `recover.newest_world_snapshot(host=HOST)` | The **based-on** snapshot first, then this host's newest | After `back_up` the based-on record is exactly the current state — even when the backup digest-skipped onto a legacy untagged snapshot (the first Saturday after this merges), where an own-host filter alone would find nothing and abort the run |
| System mirrors: "prune to the last 3 by version" | Write the new one, then keep the last 3 by version (numeric) | The old code kept 3 *then* added one (4), and sorted by name, so `5.9` outlived `5.10` |
| Stall watchdog (optional v1) | Not built | As the design allowed; rclone's own retries cover flakiness. Add if a hang is ever seen |
| `vtt-update.sh` role check | Built; exit 3 from `host require-primary` → log + exit 0, any other non-zero → exit with it | Tested statically (order and branches), not by running the wrapper — running it is the real updater |

**Deferred / not done here:**

- The assets manifest (`foundry/assets-manifest.json`, committed) now records each zip's
  listing `mtime`, as designed. Two machines writing their own mtimes into one committed file
  will churn it; if that becomes noise, move the `(bytes, mtime)` "seen" record into a local
  file under `FOUNDRY_DATA` and keep only the sha256 in the committed manifest.
- `build_scenes.py`, `travel_glyph.py`, `prep_map.py` still hard-code the Mac data path; they
  are content tools run on the Mac and were outside this change.
- The boss-remote skill (§11 item 1) is BOSS's Claude's to update; nothing on BOSS was touched.
- Nothing here was run against the real OneDrive or a real rclone remote; `rclone config` on
  the Mac is Joe's step (`ops.md` §3).

### Review fixes (2026-10-11, before merge)

A review of the branch found five defects and four minor issues. Each fix is its own commit
with tests, so this list is what changed relative to the build record above.

| # | Found | Fixed |
| --- | --- | --- |
| 1 | `host.env.example` set `PENTARYN_HOST=mac` and `PENTARYN_PRIMARY_HOST=mac`. Copied onto BOSS, BOSS became a second `mac`: the primary, and the pruner of the Mac's snapshots | Both lines commented out. An explicit `PENTARYN_HOST=mac` off macOS raises `HostError` |
| 2 | Restoring this host's oldest snapshot at the keep limit: the safety backup's pruning deleted it, so `based_on` pointed at nothing and the "no change" skip never uploaded that state again | `_backup(protect=<name>)` excludes it from coalescing and pruning. The skip holds only while `based_on` is still listed (`world-backups/` or `major-release/`); otherwise the state is uploaded again |
| 3 | A cloud outage stopped `make vtt-up` at `foundry-backup-safe` / `foundry-assets` | `backup --if-stopped` and the new `foundry-assets-safe` (`assets --if-reachable`) warn and exit 0. The plain targets and the updater still fail loudly |
| 4 | With no state file, every cloud snapshot counted as newer, so on its first boot after the merge the Mac was offered a rollback to its last untagged snapshot | With no record, a snapshot is newer only if it is later than the newest local file. Otherwise the prompt says "cannot tell which is newer" and Enter keeps local. Only the primary retires `.last-digest` |
| 5 | The no-terminal notice was buried by the next backup. A diverged alt snapshot was offered as the Enter default | `<name>.parent` lineage sidecars (parent and ancestors, written before the upload's rename). A newer snapshot that lacks `based_on` is "diverged", and Enter keeps local. The notice persists `pending_newer` until it is answered at a terminal |
| 6 | `foundry-down` said "already down" when `pgrep` missed a `PENTARYN_START_CMD` server | Also checks the port |
| 7 | The Linux app-root default was `resources/app`, but the Node.js build (v12 on) has the app at the top level | Probes `~/foundryvtt`, then `~/foundryvtt/resources/app`. §11's example is corrected. Not yet checked against BOSS's real install |
| 8 | "Keep local" was matched by name only | Also matched by the declined snapshot's mtime (`keep_local_mtime`) |
| 9 | `.safety` copies counted toward the 10 per host | They are counted separately, with a cap of 3 per host (`KEEP_SAFETY_COPIES`) |

A second review found one new defect, caused by the fix for #5, and two minor issues.

| # | Found | Fixed |
| --- | --- | --- |
| 10 | A snapshot taken with no `based_on` record wrote `"ancestors": []`, which read as "known, no ancestors". After a legacy snapshot L that BOSS took and a Mac with no record, every later Mac snapshot reached BOSS as "diverged", with Enter = local | That sidecar writes `"ancestors": null`. Every chain carries `origin_before`, the listing mtime of its unknown root: no record, a legacy snapshot, an adopted marker, or the part cut at `LINEAGE_CAP`. `BootState.lineage_origin_before` keeps it. `descends()` is None, never False, for a `based_on` at or before that edge |
| 11 | `foundry-down` on Linux with the port live, no pid and no `PENTARYN_STOP_CMD` printed "stopped" without doing anything | It prints that Foundry is running but cannot be stopped from here, and fails (`host.can_request_stop()`) |
| 12 | The pre-restore safety copy re-uploaded an unchanged ~3 GB tree when the snapshot being restored already contained its `based_on` | `_backup(protect=<Snapshot>)` skips the safety copy when `descends(target, based_on)` is True |

The final review found one high defect and one minor issue.

| # | Found | Fixed |
| --- | --- | --- |
| 13 | When the lineage list was cut at `LINEAGE_CAP`, the edge moved to the `based_on` snapshot's own mtime. After enough generations a diverged line read as "newer" and Enter = latest. In the reproduction, the Mac's Saturday session was replaced by BOSS's "addon test 2". With no safety copy, the Mac's next backup then coalesced Saturday away. The alt side failed the same way. Minor: a sidecar without `origin_before` could put `Infinity` (not valid strict JSON) into the state file and later sidecars | Sidecars carry `ancestor_mtimes` and `BootState` carries `lineage_mtimes`. At the cut, the edge is the newest dropped ancestor's mtime. If that mtime is unknown, the oldest kept known mtime is used instead, and failing that the based-on mtime. It is never read from a name. `LINEAGE_CAP` is now 2000. Coalescing replaces only a snapshot the new tree contains (its based-on or lineage). With no record, nothing is coalesced. An unbounded edge is written as `null`, and a sidecar reads it back as unbounded. The boot state stores it as None, meaning the based-on snapshot's own mtime. Tests set `LINEAGE_CAP` to 3 and cover the primary, the alt, a straight line past the cap, and coalescing |

---

## 15. Go-live checklist (for Joe, after the merge)

Verified on main after the merge (2026-10-11, with wave 2 and pentaryn-feedback already in):
whole suite 1173 passed / 2 skipped / 3 xfailed, `make check-context` clean (4 old warnings,
none from this change), `foundry-lib-check`, `foundry-modules-check`, the vendor check,
`vtt-update-host-check` and `make -n vtt-up` / `make -n foundry-boot` all fine, and
conformance unchanged from before the merge. Nothing in the build ran against the real OneDrive, a real rclone remote, Foundry
or BOSS, so every step below is the first real run. Do them in order and stop at the first
surprise. Foundry stays **down** until step 4.

**1. Mac: create the `onedrive:` remote**

`rclone config`, then: `n` (new remote), name **`onedrive`** (exactly), storage **Microsoft
OneDrive**, `client_id` and `client_secret` blank, region **`global`**, advanced config
**`n`**, web-browser auth **`y`** (sign in with the account that owns `DnD`), connection type
**OneDrive Personal or Business** and pick the drive listed, "Drive OK?" **`y`**, keep remote
**`y`**, `q`. Then confirm it sees the existing backups:

```
rclone lsd onedrive:DnD/foundry     # expect: assets  major-release  system-backup  world-backups
rclone lsf onedrive:DnD/foundry/world-backups | head    # expect the existing .tar.gz files
```

If the first command errors with auth, `rclone config reconnect onedrive:`. Never paste or
commit the rclone config file.

**2. Mac: the env file**

```
mkdir -p ~/.config/pentaryn
cat > ~/.config/pentaryn/env <<'ENV'
PENTARYN_HOST=mac
PENTARYN_ROLE=primary
PENTARYN_CLOUD=onedrive:DnD/foundry
ENV
```

(`PENTARYN_ROLE` is documented in the design as derived from `PENTARYN_PRIMARY_HOST`, which
defaults to `mac`, so `PENTARYN_HOST=mac` is what makes the Mac primary; the extra line is
harmless. Do not put secrets or the rclone config path in this file.) Check:
`./.venv/bin/python -m scripts.foundry.host show` must print `host mac`, `role primary`, the
Mac `data`/`app` paths, and a Foundry version that is not "unknown".

**3. Dry run, reads only**

```
make foundry-cloud
./.venv/bin/python -m scripts.foundry.boot choose --json
```

`foundry-cloud` should start `cloud rclone onedrive:DnD/foundry` and list host, role, what
this world is based on, newest per host and the untagged count (all the existing snapshots
show as untagged). `boot choose --json` prints the decision without acting and without
prompting. Expect `local` (the legacy `.last-digest` marker adopts the Mac's world quietly;
you should not be asked about a rollback). If it says `restore`, stop and read `why`.

**4. First tagged backup (Foundry stopped)**

```
make vtt-down            # if it is up; then confirm nothing listens on :30000
make foundry-backup REASON=first-tagged
make foundry-cloud
```

Check: a new `world-…-mac.tar.gz` appears in `world-backups/` (`rclone lsf onedrive:DnD/foundry/world-backups`),
size about 2.5 to 3.2 GB, no leftover `.partial`; `foundry-cloud` now shows `mac:` with it and
`based on` = that name; the old untagged snapshots are untouched (`make foundry-prune-untagged`
is optional and asks before deleting). A second `make foundry-backup` right after should
skip as unchanged. Then `make vtt-up` as usual: the boot step should be quiet on the Mac.

**5. Hand-off message to paste to BOSS's Claude**

```
Joe merged the rclone two-hosts change in the pentaryn repo (branch feature/rclone-hosts,
design: context/plans/rclone-two-hosts-2026-10.md §11, use-doc: context/foundry/ops.md §3).
Please, on BOSS only, and tell me what you changed:

1. Update the boss-remote skill: the rclone `onedrive` remote IS configured and the cloud
   code is now ported to rclone. On this machine `vtt-*`, `foundry-up/down` and `login` run
   on Linux through scripts/foundry/host.py; only `vtt-update-install` and the pbcopy path of
   `foundry-key` stay Mac-only (clip.exe under WSL).
2. Pull main in the pentaryn checkout on BOSS. Create ~/.config/pentaryn/env (or ~/.boss-env):
     PENTARYN_HOST=boss
     PENTARYN_PRIMARY_HOST=mac
     PENTARYN_CLOUD=onedrive:DnD/foundry
     PENTARYN_RCLONE=<path from `which rclone`>
     FOUNDRY_DATA=/home/joe/.local/share/FoundryVTT
     FOUNDRY_APP_ROOT=<folder holding package.json + main.js; leave unset to probe>
     FOUNDRY_PORT=30000
     PENTARYN_START_CMD=<starts Foundry and returns promptly, leaving it listening>
     PENTARYN_STOP_CMD=<stops it>
   PENTARYN_HOST must be exactly boss. Never put the rclone token or config path in it.
3. Foundry Linux build: unpack the Node.js build under ~/foundryvtt; the licence key comes
   from Infisical through the same helper the Mac uses (scripts/foundry/README.md).
4. Pick a supervisor that survives WSL idling (Scheduled Task running `wsl -d Ubuntu -u joe`,
   a systemd --user unit, or a keep-alive) and point START/STOP_CMD at it.
5. Check, do NOT boot yet: `python -m scripts.foundry.host show` must print host boss, role
   alt (primary host: mac), the Linux data/app paths and a real Foundry version.
   `make foundry-cloud` must print `cloud rclone onedrive:DnD/foundry` and list the Mac's
   snapshots under `mac:`. Report both outputs to Joe.
6. The first boot is Joe's: `ssh -t boss 'cd <repo> && make vtt-up'` at a terminal offers
   the Mac's newest snapshot (about 3 GB); Enter restores it. Without -t it boots local and
   prints a one-line notice. The tunnel and the Saturday updater refuse on BOSS by role;
   that is intended.
```
