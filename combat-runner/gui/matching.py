"""Shared fuzzy-match helper for action-token resolution.

``fuzzy_match_one`` implements the five-strategy tightest-first matcher used
by both ``MainWindow._resolve_action_token`` (NPC action surface) and
``NPCTab.try_player_action`` (PC generic action chips).

Strategy order (first match wins, ties at any strategy return None):
  1. Exact name match (case-insensitive, underscore-normalised)
  2. Exact alias/verbs match
  3. Unique prefix match
  4. Unique substring match
  5. Closest difflib match (cutoff 0.5)
"""

from __future__ import annotations

import difflib


def fuzzy_match_one(
    query: str,
    candidates: list[str],
    *,
    aliases: dict[str, list[str]] | None = None,
) -> str | None:
    """Return the single best matching candidate for *query*, or ``None``.

    Parameters
    ----------
    query:
        The lower-cased, stripped search token.
    candidates:
        List of candidate strings (action names, player-action labels, etc.).
        Comparison is case-insensitive; underscores are normalised to spaces.
    aliases:
        Optional mapping from candidate → list of alias strings.  Used for the
        exact-alias strategy (strategy 2).  Keys must appear in *candidates*.

    Returns
    -------
    str | None
        The matched candidate in its original form, or ``None`` when no unique
        match is found at any strategy.
    """
    if not candidates or not query:
        return None

    q = query.lower().strip()
    norm = {c: c.lower().replace("_", " ") for c in candidates}

    # 1. Exact name match
    exact = [c for c in candidates if norm[c] == q or c.lower() == q]
    if exact:
        return exact[0]

    # 2. Exact alias/verbs match
    if aliases:
        for c in candidates:
            verbs = [v.lower() for v in (aliases.get(c) or [])]
            if q in verbs:
                return c

    # 3. Unique prefix match
    prefix = [c for c in candidates if norm[c].startswith(q) or c.lower().startswith(q)]
    if len(prefix) == 1:
        return prefix[0]

    # 4. Unique substring match (only when prefix produced no hits)
    if not prefix:
        sub = [c for c in candidates if q in norm[c] or q in c.lower()]
        if len(sub) == 1:
            return sub[0]

    # 5. Closest difflib match
    close = difflib.get_close_matches(q, [norm[c] for c in candidates], n=1, cutoff=0.5)
    if close:
        for c in candidates:
            if norm[c] == close[0]:
                return c

    return None
