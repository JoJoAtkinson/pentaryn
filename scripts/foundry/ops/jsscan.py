"""A small, honest reader of ES modules — enough to answer two questions.

    Does every named import actually exist in the file it comes from?
    Does every i18n key the code asks for exist in lang/en.json?

Both are questions `node --check` cannot answer. It parses each file alone, so the
day an `export` was deleted out from under an importer every file still parsed and
the module simply never initialised — no console error, no bad-looking entry in
Manage Modules, just absent. That is the failure this file exists to catch.

WHAT THIS IS NOT
----------------
This is a lexer plus regular expressions, not a JavaScript parser. It reads the
shapes these modules actually use and is deliberately loud about the ones it cannot
read. Specifically, it CANNOT see:

  * `import(expr)` where the specifier is computed — reported as unresolvable, never
    silently passed.
  * property access on a namespace import (`API.read`) — `import * as API` is checked
    only for "the file exists", not for which members are touched.
  * anything a bundler or a runtime would do: conditional exports, `globalThis`
    assignment, `Object.assign(exports, …)`.
  * i18n keys built at runtime (`t(labelKey)`, `` t(`stance.${s.key}`) ``). Those are
    reported as UNVERIFIABLE, which is the whole point — an ad-hoc version of this
    check called them dead keys and was wrong.

So a green result means "the static shapes line up", not "the module loads". Only the
browser can say the latter.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

IDENT = r"[A-Za-z_$][A-Za-z0-9_$]*"

# Strings are lifted out of the source and replaced by these markers, so that the
# patterns below can never match a keyword that lives inside a string or a comment
# (`"import { x } from …"` in a doc-comment is not an import) while the specifier
# text stays reachable by index.
_MARK = "\x01{}\x01"
_MARK_RE = re.compile(r"\x01(\d+)\x01")


@dataclass
class Str:
    """One string or template literal, lifted out of the source."""
    value: str          # cooked-ish text: for templates, the literal parts, `${}` where code was
    line: int
    idx: int = -1       # position in Source.strings, i.e. what the marker points at
    template: bool = False
    interpolated: bool = False  # a template containing ${…} — value is only a prefix hint

    @property
    def plain(self) -> bool:
        """A literal whose full text is known at read time."""
        return not self.interpolated

    @property
    def prefix(self) -> str:
        """Everything before the first `${`. For a plain literal, the whole value."""
        return self.value.split("${", 1)[0]


@dataclass
class Source:
    path: Path
    code: str                       # source with strings/comments replaced by markers
    strings: list[Str] = field(default_factory=list)

    def line_of(self, pos: int) -> int:
        return self.code.count("\n", 0, pos) + 1

    def str_at(self, mark: str) -> Str | None:
        m = _MARK_RE.fullmatch(mark.strip())
        return self.strings[int(m.group(1))] if m else None

    def marks_in(self, text: str) -> list[Str]:
        return [self.strings[int(i)] for i in _MARK_RE.findall(text)]


# ── lexing ────────────────────────────────────────────────────────────────────
# Just enough state machine to know what is code and what is not. Escapes, nested
# `${}` in templates, and the regex-literal-versus-division ambiguity are all handled;
# everything else is code.

_REGEX_PRECEDERS = set("(,=:[!&|?{};+-*%~^<>") | {""}
_REGEX_KEYWORDS = {"return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
                   "case", "do", "else", "yield", "await"}


def _regex_allowed(code_so_far: str) -> bool:
    """Is a `/` here the start of a regex literal, or a division?"""
    stripped = code_so_far.rstrip()
    if not stripped:
        return True
    last = stripped[-1]
    if last in _REGEX_PRECEDERS:
        return True
    word = re.search(rf"({IDENT})$", stripped)
    return bool(word and word.group(1) in _REGEX_KEYWORDS)


class _Lexer:
    """Splits source into "code" and "not code", keeping line numbers intact.

    The one subtlety worth naming: a template literal is BOTH. `` `<b>${t("x")}</b>` ``
    is text on the outside and live code on the inside, and an earlier draft of this
    that treated the whole template as one opaque string went blind to every i18n key
    used inside interpolated HTML — which in these modules is most of them. So the
    `${…}` regions are lexed as code and their contents land in the code view.
    """

    def __init__(self) -> None:
        self.out: list[str] = []
        self.strings: list[Str] = []
        self.nl = 0

    def _emit(self, text: str) -> None:
        self.out.append(text)
        self.nl += text.count("\n")

    def _emit_newlines(self, count: int) -> None:
        if count:
            self._emit("\n" * count)

    def _push(self, value: str, line: int, *, template: bool) -> None:
        self.strings.append(Str(value, line, idx=len(self.strings), template=template,
                                interpolated=template and "${" in value))
        self.out.append(_MARK.format(len(self.strings) - 1))

    def feed(self, src: str) -> None:
        i, n = 0, len(src)
        while i < n:
            c = src[i]
            nxt = src[i + 1] if i + 1 < n else ""

            if c == "/" and nxt == "/":
                j = src.find("\n", i)
                i = n if j < 0 else j
                continue

            if c == "/" and nxt == "*":
                j = src.find("*/", i + 2)
                j = n if j < 0 else j + 2
                self._emit_newlines(src.count("\n", i, j))
                i = j
                continue

            if c in "'\"":
                line, j, buf = self.nl + 1, i + 1, []
                while j < n and src[j] != c:
                    if src[j] == "\\":
                        buf.append(src[j + 1:j + 2])
                        j += 2
                        continue
                    buf.append(src[j])
                    j += 1
                self._push("".join(buf), line, template=False)
                i = j + 1
                continue

            if c == "`":
                i = self._template(src, i)
                continue

            # `out[-40:]` not the whole buffer: joining everything at every `/` makes
            # this quadratic. Forty chunks is plenty of tail to see the last token.
            if c == "/" and _regex_allowed("".join(self.out[-40:])):
                j, in_class, ok = i + 1, False, True
                while j < n:
                    ch = src[j]
                    if ch == "\\":
                        j += 2
                        continue
                    if ch == "[":
                        in_class = True
                    elif ch == "]":
                        in_class = False
                    elif ch == "/" and not in_class:
                        break
                    elif ch == "\n":      # no regex literal spans a line — it was division
                        ok = False
                        break
                    j += 1
                if ok and j < n:
                    self._emit(" " * (j - i + 1))
                    i = j + 1
                    continue

            self._emit(c)
            i += 1

    def _template(self, src: str, start: int) -> int:
        """Lex one `…` template. Returns the index just past the closing backtick."""
        line, i, n = self.nl + 1, start + 1, len(src)
        shape: list[str] = []          # the literal text, with `${}` where code was
        # (kind, text) in source order, so the newlines and the `${…}` code can be
        # replayed in the order they appear. Emitting all the text newlines first and
        # the expressions afterwards keeps the file's TOTAL line count right but
        # reports every key inside a multi-line template at the template's last line.
        parts: list[tuple[str, str]] = []
        while i < n:
            ch = src[i]
            if ch == "\\":
                shape.append(src[i:i + 2])
                parts.append(("text", src[i:i + 2]))
                i += 2
                continue
            if ch == "`":
                i += 1
                break
            if ch == "$" and src[i + 1:i + 2] == "{":
                depth, j = 1, i + 2
                while j < n and depth:
                    d = src[j]
                    if d == "\\":
                        j += 2
                        continue
                    if d in "{":
                        depth += 1
                    elif d == "}":
                        depth -= 1
                        if not depth:
                            break
                    elif d in "'\"`":     # a string inside the expression may hold braces
                        q, j = d, j + 1
                        while j < n and src[j] != q:
                            j += 2 if src[j] == "\\" else 1
                    j += 1
                parts.append(("expr", src[i + 2:j]))
                shape.append("${}")
                i = j + 1
                continue
            shape.append(ch)
            parts.append(("text", ch))
            i += 1

        self._push("".join(shape), line, template=True)
        for kind, text in parts:
            if kind == "expr":
                self.feed(text)         # the code inside `${…}` is code
                self._emit(";")         # keep neighbouring expressions from fusing
            else:
                self._emit_newlines(text.count("\n"))
        return i


def scan(path: Path) -> Source:
    """Read a file into code-with-markers plus the literals that were lifted out."""
    lx = _Lexer()
    lx.feed(path.read_text(encoding="utf-8"))
    return Source(path, "".join(lx.out), lx.strings)


# ── imports and exports ───────────────────────────────────────────────────────

@dataclass
class Import:
    names: list[str]          # named imports, by their name in the SOURCE file
    spec: str | None          # module specifier, None when it was computed
    line: int
    namespace: bool = False   # `import * as X` — members are not checked
    dynamic: bool = False
    raw: str = ""


_RE_IMPORT = re.compile(
    rf"(?<![\w$.])import\s*(?![\(.])(?:([^;]*?)\s*from\s*)?(\x01\d+\x01)")
_RE_DYNAMIC = re.compile(
    rf"(?:const|let|var)\s*(?:\{{([^}}]*)\}}|{IDENT})\s*=\s*(?:await\s+)?import\(\s*([^)]*?)\s*\)")
_RE_DYNAMIC_BARE = re.compile(r"(?<![\w$.])import\(\s*([^)]*?)\s*\)")

_RE_EXPORT_DECL = re.compile(
    rf"(?<![\w$.])export\s+(?:async\s+)?(?:function\s*\*?|class)\s+({IDENT})")
_RE_EXPORT_VAR = re.compile(
    rf"(?<![\w$.])export\s+(?:const|let|var)\s+([\{{\[]?[^=;]+?)\s*=")
_RE_EXPORT_LIST = re.compile(
    r"(?<![\w$.])export\s*\{([^}]*)\}\s*(?:from\s*(\x01\d+\x01))?")
_RE_EXPORT_STAR = re.compile(
    rf"(?<![\w$.])export\s*\*\s*(?:as\s+({IDENT})\s+)?from\s*(\x01\d+\x01)")
_RE_EXPORT_DEFAULT = re.compile(r"(?<![\w$.])export\s+default(?![\w$])")


def _split_clause(clause: str) -> tuple[list[str], bool]:
    """`{a, b as c}`, `Default, {a}`, `* as NS` → (source-side names, is_namespace)."""
    if re.search(r"\*\s*as\s", clause):
        return [], True
    names: list[str] = []
    if (braces := re.search(r"\{([^}]*)\}", clause)):
        for part in braces.group(1).split(","):
            part = part.strip()
            if part:
                names.append(part.split(" as ")[0].strip())
    if re.match(rf"^\s*({IDENT})\s*(,|$)", clause):
        names.append("default")
    return names, False


def imports_of(s: Source) -> list[Import]:
    found: list[Import] = []

    for m in _RE_IMPORT.finditer(s.code):
        clause, mark = m.group(1) or "", m.group(2)
        names, ns = _split_clause(clause)
        lit = s.str_at(mark)
        found.append(Import(names, lit.value if lit and lit.plain else None,
                            s.line_of(m.start()), namespace=ns, raw=clause.strip()))

    seen_dynamic: set[int] = set()
    for m in _RE_DYNAMIC.finditer(s.code):
        seen_dynamic.add(m.start(2))
        names = [p.strip().split(":")[0].strip()
                 for p in (m.group(1) or "").split(",") if p.strip()]
        lit = s.str_at(m.group(2))
        found.append(Import(names, lit.value if lit and lit.plain else None,
                            s.line_of(m.start()), dynamic=True, raw=m.group(0)[:60]))

    # `await import(x)` with no destructuring still tells us a file must exist.
    for m in _RE_DYNAMIC_BARE.finditer(s.code):
        if m.start(1) in seen_dynamic:
            continue
        lit = s.str_at(m.group(1))
        found.append(Import([], lit.value if lit and lit.plain else None,
                            s.line_of(m.start()), dynamic=True, raw=m.group(0)[:60]))
    return found


def exports_of(s: Source) -> tuple[set[str], list[str]]:
    """(exported names, specifiers this file re-exports everything from)."""
    names: set[str] = set()
    stars: list[str] = []

    names.update(m.group(1) for m in _RE_EXPORT_DECL.finditer(s.code))

    for m in _RE_EXPORT_VAR.finditer(s.code):
        # `export const {a, b} = …` and `export const [a] = …` bind several names.
        names.update(re.findall(IDENT, m.group(1)))

    for m in _RE_EXPORT_LIST.finditer(s.code):
        if m.group(2):                      # `export {a} from "./x"` — a re-export
            lit = s.str_at(m.group(2))
            if lit:
                stars.append(lit.value)     # resolved the same way; names filtered below
        for part in m.group(1).split(","):
            part = part.strip()
            if part:
                names.add(part.split(" as ")[-1].strip())

    for m in _RE_EXPORT_STAR.finditer(s.code):
        lit = s.str_at(m.group(2))
        if m.group(1):
            names.add(m.group(1))
        elif lit:
            stars.append(lit.value)

    if _RE_EXPORT_DEFAULT.search(s.code):
        names.add("default")
    return names, stars


# ── i18n keys ─────────────────────────────────────────────────────────────────

@dataclass
class Ref:
    key: str
    path: Path
    line: int


@dataclass
class KeyUse:
    definite: list[Ref] = field(default_factory=list)
    # Prefixes from interpolated templates: `PENTARYN_TIES.stance.${k}` covers
    # everything under `PENTARYN_TIES.stance.`. Not dead, not provable.
    prefixes: set[str] = field(default_factory=set)
    # A key handed to a wrapper as a variable (`f(labelKey, …)`). The literal is
    # usually still SOMEWHERE in the file, which is what `soft` catches.
    soft: set[str] = field(default_factory=set)
    opaque: list[Ref] = field(default_factory=list)  # call sites with no literal at all


# `const t = k => game.i18n.localize(`NS.${k}`)` — the prefix-wrapper idiom every
# one of these modules uses. Found rather than assumed, so a module that names it
# something else still works.
_RE_WRAPPER = re.compile(
    rf"(?:const|let|var)\s+({IDENT})\s*=\s*"
    rf"(?:\(\s*[^)]*\)|{IDENT})\s*=>\s*"
    rf"game\.i18n\.(?:localize|format)\(\s*(\x01\d+\x01)")
_RE_DIRECT = re.compile(r"game\.i18n\??\.(?:localize|format)\(\s*([^,)]*)")


def _first_arg(code: str, open_paren: int) -> str:
    """Text of the first argument of the call whose `(` is at `open_paren`."""
    depth, i, start = 0, open_paren, open_paren + 1
    while i < len(code):
        c = code[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
            if depth == 0:
                return code[start:i]
        elif c == "," and depth == 1:
            return code[start:i]
        i += 1
    return code[start:]


def key_uses(s: Source, namespaces: set[str], known: set[str]) -> KeyUse:
    use = KeyUse()
    wrapper_bodies: set[int] = set()   # the `NS.${k}` templates that DEFINE a wrapper

    def record(text: str, line: int, prefix: str) -> None:
        """Read one call's first argument for keys, under an optional NS prefix."""
        lits = s.marks_in(text)
        if not lits:
            # `f(labelKey, …)`: no literal here. Honest answer is "cannot tell".
            use.opaque.append(Ref(f"{prefix}<computed>", s.path, line))
            return
        for lit in lits:
            if lit.plain:
                use.definite.append(Ref(prefix + lit.value, s.path, line))
            else:
                use.prefixes.add(prefix + lit.prefix)

    for m in _RE_WRAPPER.finditer(s.code):
        lit = s.str_at(m.group(2))
        if not lit or not lit.interpolated:
            continue
        ns = lit.prefix.rstrip(".")
        if ns not in namespaces:
            continue
        wrapper_bodies.add(lit.idx)
        for call in re.finditer(rf"(?<![\w$.]){re.escape(m.group(1))}\s*\(", s.code):
            record(_first_arg(s.code, call.end() - 1), s.line_of(call.start()), lit.prefix)

    for m in _RE_DIRECT.finditer(s.code):
        for idx in (int(i) for i in _MARK_RE.findall(m.group(1))):
            # The wrapper's own `NS.${k}` body is a definition, not a use. Counting it
            # would register the prefix `NS.` — which matches every key in the file and
            # would quietly excuse all of them from the dead-key report.
            if idx in wrapper_bodies:
                continue
            lit = s.strings[idx]
            if not any(lit.prefix.startswith(ns + ".") for ns in namespaces):
                continue
            if lit.plain:
                use.definite.append(Ref(lit.value, s.path, lit.line))
            else:
                use.prefixes.add(lit.prefix)

    for lit in s.strings:
        if not lit.plain:
            # An interpolated key does not have to sit inside the localize() call —
            # `` const key = `NS.known.category.${c.key}` `` a few lines above is the
            # same thing. Anything whose prefix could name keys covers them, whether
            # that prefix is written out in full or is relative to a wrapper.
            if lit.idx in wrapper_bodies:
                continue
            for ns in namespaces:
                if lit.prefix.startswith(ns + "."):
                    use.prefixes.add(lit.prefix)
                elif lit.prefix and any(k.startswith(f"{ns}.{lit.prefix}") for k in known):
                    use.prefixes.add(f"{ns}.{lit.prefix}")
            continue
        # A bare literal that names a key: `{name: "NS.keybind.show"}` is a real
        # reference; `"dialog.reverseWordLabel"` passed as a labelKey is a soft one.
        if any(lit.value.startswith(ns + ".") for ns in namespaces):
            use.definite.append(Ref(lit.value, s.path, lit.line))
        elif any(ns + "." + lit.value in known for ns in namespaces):
            use.soft.update(ns + "." + lit.value for ns in namespaces
                            if ns + "." + lit.value in known)
    return use


def load_lang(path: Path) -> dict[str, str]:
    """Foundry lang files are flat `"A.b.c": "text"` or nested objects. Take both."""
    data = json.loads(path.read_text(encoding="utf-8"))
    flat: dict[str, str] = {}

    def walk(node, prefix: str) -> None:
        if isinstance(node, dict):
            for k, v in node.items():
                walk(v, f"{prefix}.{k}" if prefix else k)
        else:
            flat[prefix] = node

    walk(data, "")
    return flat
