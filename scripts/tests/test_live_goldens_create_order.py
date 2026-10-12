"""A live golden must not destructure a multi-document create.

On Foundry 14 a batch `createEmbeddedDocuments` comes back in no fixed order, so
`const [a, b] = await x.createEmbeddedDocuments("Note", [dataA, dataB])` binds `a` to dataB's
document on some runs. The golden then tags the wrong id and its `shared` block flips run to run
(W5L 2026-10-12: movement's `pinsUnderTokens[0].noteId` read `<noteClear>` on one run and
`<noteUnder>` on the next, while the label was "ZZ pin under" both times). Create one document
per call, as attunement.js already does for its items."""
import re
from pathlib import Path

GOLDENS = Path(__file__).resolve().parents[2] / "scripts/foundry/live-goldens"

# `const [a, b ...] = await <expr>.createEmbeddedDocuments(` — two or more bound names.
MULTI = re.compile(r"const\s*\[\s*\w+\s*,\s*\w+[^\]]*\]\s*=\s*await\s+[\w.]+\.createEmbeddedDocuments\(")


def test_no_golden_destructures_a_batch_create():
    offenders = []
    for path in sorted(GOLDENS.glob("*.js")):
        for n, line in enumerate(path.read_text(encoding="utf8").splitlines(), 1):
            if MULTI.search(line):
                offenders.append(f"{path.name}:{n}: {line.strip()}")
    assert offenders == [], "batch create destructured (order is not fixed on Foundry 14):\n" + "\n".join(offenders)
