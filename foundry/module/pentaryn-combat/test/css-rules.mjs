// D7 test helper: the rules a stylesheet applies, @imports inlined, in cascade order. Each entry is one
// selector with its declarations ({ prop: value }, whitespace collapsed), so two stylesheets that apply
// the same rules compare equal whatever their comments, layout or file split. At-rule blocks
// (@keyframes, @media) are kept as one opaque entry each. A copy lives in pentaryn-transform/test.
import { readFileSync } from "node:fs";

const squash = s => s.replace(/\s+/g, " ").trim();

/** The stylesheet at `url` with every `@import "<rel>";` replaced by the imported file's text. */
export function inlineImports(url, seen = new Set()) {
  if (seen.has(url.href)) throw new Error(`@import cycle at ${url.href}`);
  seen.add(url.href);
  const text = readFileSync(url, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return text.replace(/@import\s+(?:url\()?["']([^"']+)["']\)?\s*;/g, (_, rel) => inlineImports(new URL(rel, url), seen));
}

/** [{ selector, decls }] in source order; an at-rule block is { selector: "@…", decls: { body } }. */
export function cssRules(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open < 0) break;
    const head = squash(text.slice(i, open));
    if (head.startsWith("@")) {
      let depth = 1, j = open + 1;
      for (; j < text.length && depth; j++) depth += text[j] === "{" ? 1 : text[j] === "}" ? -1 : 0;
      out.push({ selector: head, decls: { body: squash(text.slice(open + 1, j - 1)) } });
      i = j;
      continue;
    }
    const close = text.indexOf("}", open);
    const decls = {};
    for (const d of text.slice(open + 1, close).split(";")) {
      const k = d.indexOf(":");
      if (k > 0) decls[squash(d.slice(0, k))] = squash(d.slice(k + 1));
    }
    for (const sel of head.split(",")) out.push({ selector: squash(sel), decls });
    i = close + 1;
  }
  return out;
}

/** The rules of the stylesheet at `url` (imports inlined) whose selector matches `pick`. */
export const rulesFor = (url, pick) => cssRules(inlineImports(url)).filter(r => pick.test(r.selector));
