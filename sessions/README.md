# Sessions

Per-session transcripts and notes. **The audio is not here.**

## Where the audio is

`OneDrive-Personal/DnD/sessions/<NN>/` — same layout as this folder. Sessions 01, 02, 04
and 08 are a single `audio.m4a`; 03, 05, 06 and 07 are per-player FLAC stems under
`audio/`.

It used to be tracked in Git LFS: 3.2 GB across 20 files, in every clone and on GitHub,
with nothing in the repo reading it since the transcript pipeline was retired. Removed from
history 2026-08-22 after a checksum-verified copy to OneDrive. `.gitignore` blocks audio
extensions so it cannot drift back in.

## What is here

| File | Sessions |
|---|---|
| `transcripts.jsonl` | 01–05 — timestamped, speaker-attributed |
| `notes/` | 08 |
| `pass1.json`, `pass2/*.toml` | 01–04 — scene detection and summaries from the retired story_craft pipeline. Kept as lore: `find_lore` and `last_session_summary` read them. |
| `config.toml` | 01–04 — that pipeline's per-session config |

In-character chronicles built from these live in [`../story/`](../story/).
