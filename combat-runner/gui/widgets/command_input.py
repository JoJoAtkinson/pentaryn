"""Command input widget — sigil-aware text field with live preview signals.

Reads as the user types, emits:
  preview_changed(member_idx: int, projected_hp: int | None)
      Fired on every keystroke when the active text is a `-N` or `+N` (or
      mob-targeted variant). Projected_hp is None when no preview should
      be shown (cleared).
  submitted(text: str)
      Fired on Return/Enter. Caller parses and dispatches.

Up/Down arrow keys browse session input history; Esc clears the field.
The widget itself does NOT mutate state — it just signals user intent.
"""

from __future__ import annotations

import re

from PySide6.QtCore import QStringListModel, Qt, Signal
from PySide6.QtGui import QKeyEvent
from PySide6.QtWidgets import QCompleter, QLineEdit, QWidget

# Standard 5e conditions + a few we track ourselves (bloodied, dodging).
# Sorted alphabetically; user types `@b` and gets blinded / bloodied.
CONDITIONS = (
    "blinded", "bloodied", "charmed", "deafened", "dodging",
    "exhausted", "frightened", "grappled", "incapacitated", "invisible",
    "paralyzed", "petrified", "poisoned", "prone", "restrained",
    "stunned", "unconscious",
)

SLASH_COMMANDS = (
    "/reorder ",  # trailing space so the user starts typing slugs after select
    "/quit",
    "/exit",
)


class _LastTokenCompleter(QCompleter):
    """QCompleter whose completion prefix is the LAST whitespace-delimited
    token of the line edit, not the whole string.

    A plain QCompleter attached to a QLineEdit auto-sets its completionPrefix
    to the entire text. That works for single-token sigils (`@bl`, `/quit`)
    but breaks directed-command tag typeahead: the line is `3 12 f` while the
    candidates are bare tags (`fire`, `cold`, …) — the whole-line prefix
    matches nothing and the popup never shows.

    Overriding `splitPath` to return just the trailing token fixes tag
    completion without disturbing the `@`/`/` cases (those inputs have no
    spaces, so the last token IS the whole string).
    """

    def splitPath(self, path: str) -> list[str]:  # noqa: N802 (Qt API)
        tokens = path.rsplit(" ", 1)
        return [tokens[-1]]


# Match the dispatcher patterns we need for live preview (keep narrow — only
# damage/heal trigger preview).
_PREVIEW_RE = re.compile(
    r"""
    ^
    (?:m(?P<member>[1-9]\d*)\s+)?  # optional mob target (1-indexed; reject m0)
    (?P<sign>[-+])(?P<amount>\d+)  # damage (-) or heal (+)
    (?:\s+\w+)?                    # optional damage type
    $
    """,
    re.VERBOSE | re.IGNORECASE,
)


class CommandInput(QLineEdit):
    """qt-material-themed input with sigil-aware live preview."""

    preview_changed = Signal(object, object)  # (member_idx_or_None, projected_hp_or_None)
    submitted = Signal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setPlaceholderText("attack · -18 · +10 · @prone · @stun 5 · m3 -5 · note ... · /reorder ...")
        self.setObjectName("CommandInput")
        self.setMinimumHeight(34)

        # Session history (in-memory; persistence is the log file)
        self._history: list[str] = []
        self._history_idx: int = 0

        # Autocomplete popup for `@condition` and `/command` sigils. We hold
        # a QCompleter wired to this QLineEdit; the model is swapped between
        # the two sigil lists as the user types. The popup steals Down-arrow
        # and Enter when visible (built-in Qt behavior), so history nav only
        # runs when the popup is hidden.
        self._condition_model = QStringListModel(["@" + c for c in CONDITIONS], self)
        self._slash_model = QStringListModel(list(SLASH_COMMANDS), self)
        self._completer = _LastTokenCompleter(self._condition_model, self)
        self._completer.setCaseSensitivity(Qt.CaseSensitivity.CaseInsensitive)
        self._completer.setFilterMode(Qt.MatchFlag.MatchStartsWith)
        self._completer.setCompletionMode(QCompleter.CompletionMode.PopupCompletion)
        self.setCompleter(self._completer)

        # Wire signals
        self.textChanged.connect(self._on_text_changed)
        self.textChanged.connect(self._update_completer_model)
        self.returnPressed.connect(self._on_return)

        # State the dispatcher fills via update_context()
        self._current_hp: int = 0
        self._max_hp_per_member: int = 1
        self._member_count: int = 1
        self._member_hp: list[int] = [0]

    # ─────────── context wiring (call from NPCTab on state change) ───────────

    def update_context(self, member_hp: list[int], max_hp_per_member: int) -> None:
        """Inform the input of the active NPC's HP state so live preview can
        compute projected HP correctly."""
        self._member_hp = list(member_hp)
        self._member_count = len(member_hp)
        self._max_hp_per_member = max(1, max_hp_per_member)
        # If a preview is active, recompute it against the new state.
        self._on_text_changed(self.text())

    # ─────────── live preview ───────────

    def _on_text_changed(self, text: str) -> None:
        """On every keystroke, see if the text describes a damage or heal
        that we should preview. Emit `preview_changed`."""
        m = _PREVIEW_RE.match(text.strip())
        if not m:
            self.preview_changed.emit(None, None)
            return

        amount = int(m.group("amount"))
        sign = m.group("sign")
        member_arg = m.group("member")

        # Determine target member (0-indexed)
        if member_arg:
            target_idx = int(member_arg) - 1
            if not (0 <= target_idx < self._member_count):
                # Out-of-range target → no preview (parser will catch it on submit)
                self.preview_changed.emit(None, None)
                return
        else:
            # Default routing matches state.NPCState._resolve_*_target rules
            if sign == "-":
                # damage → highest-numbered alive
                alive = [i for i, h in enumerate(self._member_hp) if h > 0]
                if not alive:
                    self.preview_changed.emit(None, None)
                    return
                target_idx = alive[-1]
            else:
                # heal → lowest-numbered alive
                alive = [i for i, h in enumerate(self._member_hp) if h > 0]
                if not alive:
                    self.preview_changed.emit(None, None)
                    return
                target_idx = alive[0]

        current = self._member_hp[target_idx]
        if sign == "-":
            projected = max(0, current - amount)
        else:
            projected = min(self._max_hp_per_member, current + amount)
        self.preview_changed.emit(target_idx, projected)

    # ─────────── autocomplete popup ───────────

    # Matches a directed-command prefix: <repeated-digit id> [m<n>] <amount> <partial-tag>
    # Groups: (1) the repeating digit (structural), (2) the partial tag token (may be empty).
    _TAG_HINT_RE = re.compile(r'^(\d)\1*\s+(?:m\d+\s+)?\d+(?:\s+\w+)*\s+(\w*)$', re.IGNORECASE)

    def _update_completer_model(self, text: str) -> None:
        """Swap the completer's candidate list based on the leading sigil.

        - `@` (or `@<partial>`) → conditions list (each candidate prefixed `@`)
        - `/` (or `/<partial>`) → slash commands
        - directed command prefix (`<id> [m<n>] <amount> <partial-tag>`) → tag hints
        - anything else → hide popup
        """
        if text.startswith("@"):
            if self._completer.model() is not self._condition_model:
                self._completer.setModel(self._condition_model)
        elif text.startswith("/"):
            if self._completer.model() is not self._slash_model:
                self._completer.setModel(self._slash_model)
        else:
            m = self._TAG_HINT_RE.match(text.strip())
            if m:
                from ..command_tags import hint_pool
                tokens = text.strip().split()
                # tokens[0] = id, tokens[1] = amount (or m<n>), tokens[2] = amount if m<n>
                # Everything after id + amount are tag tokens. The last token is the
                # partial prefix being typed; completed tokens are all but the last.
                # If text ends with a space, all tokens are complete — pass them all.
                # Determine where tags start (after id + [m<n>] + amount).
                structural = 2  # id + amount
                has_mob = (
                    len(tokens) >= 2
                    and tokens[1].lower().startswith("m")
                    and tokens[1][1:].isdigit()
                )
                if has_mob:
                    structural = 3  # id + m<n> + amount
                if text.endswith(" "):
                    # Every token typed so far is complete.
                    completed_tokens = tokens[structural:]
                else:
                    # Last token is the partial being typed; the rest are complete.
                    tag_tokens = tokens[structural:]
                    completed_tokens = tag_tokens[:-1] if tag_tokens else []
                # Feed the completer the full applicable pool. The
                # _LastTokenCompleter's splitPath() narrows the completion
                # prefix to the trailing partial token, so the popup filters
                # `fire`/`force`/… against `f` rather than the whole line.
                candidates = hint_pool(completed_tokens)
                model = QStringListModel(candidates, self)
                self._completer.setModel(model)
            else:
                # Hide popup for non-sigil text
                popup = self._completer.popup()
                if popup is not None and popup.isVisible():
                    popup.hide()

    # ─────────── submit + history ───────────

    def _on_return(self) -> None:
        text = self.text().strip()
        if not text:
            return
        if not self._history or self._history[-1] != text:
            self._history.append(text)
        self._history_idx = len(self._history)
        self.preview_changed.emit(None, None)  # clear preview on commit
        self.submitted.emit(text)
        self.clear()

    def keyPressEvent(self, event: QKeyEvent) -> None:  # noqa: N802 (Qt API)
        # If the autocomplete popup is showing, let Qt handle Up/Down/Enter
        # so the user can navigate the candidate list.
        popup = self._completer.popup() if self._completer else None
        if popup is not None and popup.isVisible() and event.key() in (
            Qt.Key.Key_Up, Qt.Key.Key_Down, Qt.Key.Key_Return, Qt.Key.Key_Enter,
            Qt.Key.Key_Tab,
        ):
            super().keyPressEvent(event)
            return

        # Esc clears the field and any preview
        if event.key() == Qt.Key.Key_Escape:
            self.clear()
            self.preview_changed.emit(None, None)
            return
        # Up/Down browse history
        if event.key() == Qt.Key.Key_Up and self._history:
            self._history_idx = max(0, self._history_idx - 1)
            self.setText(self._history[self._history_idx])
            return
        if event.key() == Qt.Key.Key_Down:
            if self._history and self._history_idx < len(self._history) - 1:
                self._history_idx += 1
                self.setText(self._history[self._history_idx])
            else:
                self._history_idx = len(self._history)
                self.clear()
            return
        super().keyPressEvent(event)
