"""LG-AC-3: a golden's cleanup deletes each document type in one batch call, not one await per id.

senses, attunement, transform, creatures and journal deleted their scratch chat lines, actors and
journals one awaited `doc.delete()` at a time — a server round trip each — where Foundry has a batch
call (§5.9.4). importer and walls already batched. Each of these cleanups now collects the ids that
still exist (a document already gone is not in the batch) and issues one
`ChatMessage.deleteDocuments(ids)` / `Actor.deleteDocuments(ids)` / `JournalEntry.deleteDocuments(ids)`
per type inside LG-R8's `safely`. Cleanup is outside `golden`, so the golden bytes do not change."""
import re
from pathlib import Path

import pytest

LG = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens"

# golden -> (document class, the world collection whose membership filters the ids)
BATCHES = {
    "senses": [("ChatMessage", "game.messages"), ("Actor", "game.actors")],
    "attunement": [("Actor", "game.actors")],
    "transform": [("Actor", "game.actors")],
    "creatures": [("Actor", "game.actors")],
    "journal": [("JournalEntry", "game.journal")],
}


def _finally(stem):
    text = (LG / f"{stem}.js").read_text(encoding="utf-8")
    start = text.find("\n} finally {\n")
    assert start >= 0, f"{stem}.js has no finally block"
    return text[start:text.index("\n}\n", start + 1)]


@pytest.mark.parametrize("stem", sorted(BATCHES))
def test_lg_ac_3_no_per_document_delete_in_a_loop(stem):
    block = _finally(stem)
    looped = [line.strip() for line in block.splitlines() if re.search(r"\bfor \(", line) and ".delete()" in line]
    assert looped == [], f"LG-AC-3: {stem}.js deletes one document per awaited call:\n" + "\n".join(looped)


@pytest.mark.parametrize("stem,cls,coll", [(s, c, w) for s, pairs in sorted(BATCHES.items()) for c, w in pairs])
def test_lg_ac_3_one_batch_per_type_inside_safely_with_an_existence_filter(stem, cls, coll):
    block = _finally(stem)
    calls = re.findall(rf"await safely\(\"\w+\", \(\) => {cls}\.deleteDocuments\((\w+)\)\)", block)
    assert len(calls) == 1, f"LG-AC-3: {stem}.js should batch its {cls} deletes in one safely() call"
    ids = calls[0]
    assign = re.search(rf"const {ids} = (.+);$", block, re.M)
    assert assign, f"LG-AC-3: {stem}.js builds {ids} somewhere else"
    assert coll in assign.group(1), f"LG-AC-3: {stem}.js batches ids without checking {coll} first: {assign.group(0)}"
    assert re.search(rf"if \({ids}\.length\) await safely", block), f"LG-AC-3: {stem}.js sends an empty {cls} batch"
