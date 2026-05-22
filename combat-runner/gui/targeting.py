"""Pure <who>-token logic for the combat command grammar. No Qt, no state."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

_ALL_DIGITS = re.compile(r"^\d+$")


def split_runs(digits: str) -> list[str]:
    """Split a digit string into maximal same-digit runs.
    '123' -> ['1','2','3']; '2233' -> ['22','33']; '222' -> ['222']."""
    runs: list[str] = []
    for ch in digits:
        if runs and runs[-1][0] == ch:
            runs[-1] += ch
        else:
            runs.append(ch)
    return runs


@dataclass
class Who:
    """Classified <who> token. `ids` may contain '0' (self) — resolved later."""
    mode: str  # "explicit" | "current"
    ids: list[str] = field(default_factory=list)


def classify_who(token: str) -> Who:
    """Classify the first token of a command.
    All-digits -> explicit target(s) via run-splitting.
    Empty (leading whitespace) or anything else -> the current target."""
    token = token.strip()
    if token and _ALL_DIGITS.match(token):
        return Who(mode="explicit", ids=split_runs(token))
    return Who(mode="current", ids=[])
