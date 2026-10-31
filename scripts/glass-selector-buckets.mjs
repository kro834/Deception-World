// Liquid glass sheets: let the engine skip rules on elements they cannot match.
//
// A rule whose last compound is a multi-argument `:is()` / `:where()`
// (`html[data-button-style="liquid"] body :is(.topbar nav a, .manager-back, …)`)
// has no class, id, tag or attribute for Chromium and WebKit to file it
// under, so it is tried on every element of the page at every style
// recalculation. QA (2026-10-31) measured that as extra style time on the
// iPads with glass on. This PostCSS step, run on the glass sheets only,
// rewrites each such selector into one selector per argument, keyed by that
// argument's own last class/id/attribute/tag:
//
//   P :is(A1, …, An) S   ->   P :where(k1):is(A1, Amax) S, …, P :where(kn):is(An, Amax) S
//   P :where(A1, …, An) S -> P :where(k1):where(A1) S, …
//
// where ki is a simple selector every match of Ai carries and Amax is the
// most specific argument (arguments with the same key share one arm, and an
// arm lighter than Amax by whole ids, classes or types is instead padded
// with `:not(#lg-pad)`, `:not(.lg-pad)` or `:not(lg-pad)`, which no element
// carries and which weigh exactly that). The set of matched elements is unchanged (each
// arm matches a subset of the original, and their union is the original),
// and so is the specificity (`:where(ki)` adds none, `:is(Ai, Amax)` weighs
// exactly what `:is(A1…An)` weighs). Rules with escapes, vendor pseudos or
// an argument with no key are left as they are, because splitting a
// forgiving `:is()` list into a plain list would let one unknown selector
// drop the whole rule.

const GLASS_SHEET = /[\\/]src[\\/]styles-liquid-glass[\w-]*\.css$/;

function scan(text, visit) {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && visit(c, i) === false) return;
  }
}

/** Top-level comma split. */
export function splitList(text) {
  const parts = [];
  let start = 0;
  scan(text, (c, i) => {
    if (c === ",") {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  });
  parts.push(text.slice(start).trim());
  return parts;
}

/** Index where the last compound of a complex selector begins. */
function lastCompoundStart(selector) {
  let start = 0;
  scan(selector, (c, i) => {
    if (c === " " || c === "\n" || c === "\t" || c === ">" || c === "+" || c === "~") start = i + 1;
  });
  return start;
}

/** The simple selectors of one compound, in order. */
export function simples(compound) {
  const out = [];
  let i = 0;
  const n = compound.length;
  while (i < n) {
    const begin = i;
    const c = compound[i];
    if (c === "[") {
      let depth = 0;
      for (; i < n; i++) {
        if (compound[i] === "[") depth++;
        else if (compound[i] === "]" && --depth === 0) break;
      }
      i++;
    } else {
      if (c === ":") i += compound[i + 1] === ":" ? 2 : 1;
      else if (c === "." || c === "#") i++;
      while (i < n && /[\w-]/.test(compound[i])) i++;
      if (compound[i] === "(") {
        let depth = 0;
        let quote = "";
        for (; i < n; i++) {
          const d = compound[i];
          if (quote) {
            if (d === quote) quote = "";
          } else if (d === '"' || d === "'") quote = d;
          else if (d === "(") depth++;
          else if (d === ")" && --depth === 0) break;
        }
        i++;
      }
      if (i === begin) return null;
    }
    out.push(compound.slice(begin, i));
  }
  return out;
}

function pseudoName(simple) {
  return /^::?([\w-]+)/.exec(simple)?.[1].toLowerCase() ?? "";
}

function inner(simple) {
  return simple.slice(simple.indexOf("(") + 1, -1);
}

/** Specificity [ids, classes, types] of a complex selector or a list (max). */
export function specificity(selector) {
  let best = [0, 0, 0];
  for (const complex of splitList(selector)) {
    const s = [0, 0, 0];
    const parts = [];
    let start = 0;
    scan(complex, (c, i) => {
      if (c === " " || c === ">" || c === "+" || c === "~") {
        parts.push(complex.slice(start, i));
        start = i + 1;
      }
    });
    parts.push(complex.slice(start));
    for (const compound of parts) {
      if (!compound) continue;
      for (const simple of simples(compound) ?? []) {
        if (simple[0] === "#") s[0]++;
        else if (simple[0] === "." || simple[0] === "[") s[1]++;
        else if (simple.startsWith("::")) s[2]++;
        else if (simple[0] === ":") {
          const name = pseudoName(simple);
          if (name === "where") continue;
          if (["is", "not", "has", "matches"].includes(name)) {
            const t = specificity(inner(simple));
            for (let k = 0; k < 3; k++) s[k] += t[k];
          } else s[1]++;
        } else if (simple !== "*") s[2]++;
      }
    }
    if (compare(s, best) > 0) best = s;
  }
  return best;
}

function compare(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** A simple selector every match of this complex selector carries, or null. */
function key(complex) {
  const parts = simples(complex.slice(lastCompoundStart(complex)));
  if (!parts) return null;
  return (
    parts.find((s) => s[0] === "#") ??
    parts.find((s) => s[0] === ".") ??
    parts
      .map((s) => (s[0] === "[" ? /^\[\s*([\w-]+)/.exec(s)?.[0] : null))
      .find(Boolean)
      ?.concat("]") ??
    parts.find((s) => /^[a-z]/i.test(s)) ??
    null
  );
}

function bucketable(parts) {
  return parts.some((s) => {
    if (s[0] === "#" || s[0] === "." || s[0] === "[" || /^[a-z]/i.test(s)) return true;
    const name = pseudoName(s);
    return (name === "is" || name === "where") && splitList(inner(s)).length === 1;
  });
}

/** One selector, rewritten into a list of keyed ones (or returned as it is). */
export function bucketSelector(selector) {
  if (selector.includes("\\")) return [selector];
  const at = lastCompoundStart(selector);
  const head = selector.slice(0, at);
  const parts = simples(selector.slice(at));
  if (!parts || bucketable(parts)) return [selector];
  const index = parts.findIndex((s) => {
    const name = pseudoName(s);
    return !s.startsWith("::") && (name === "is" || name === "where");
  });
  if (index < 0) return [selector];
  const list = splitList(inner(parts[index]));
  if (list.length < 2 || list.some((arg) => !arg || /::|:-|:has\(/.test(arg))) return [selector];
  const keys = list.map(key);
  if (keys.some((k) => !k)) return [selector];
  const where = pseudoName(parts[index]) === "where";
  let max = list[0];
  for (const arg of list) if (compare(specificity(arg), specificity(max)) > 0) max = arg;
  // Arguments sharing a key share an arm; an arm lighter than the list
  // carries the heaviest argument too, so it weighs what the list weighs.
  const groups = new Map();
  list.forEach((arg, i) => groups.set(keys[i], [...(groups.get(keys[i]) ?? []), arg]));
  return [...groups].map(([k, args]) => {
    let arm;
    if (where) arm = `:where(${k}):where(${args.join(", ")})`;
    else {
      const top = specificity(max);
      const own = specificity(args.join(", "));
      const gap = top.map((v, n) => v - own[n]);
      // Lighter by whole ids/classes/types: pad with selectors no element
      // carries (`:not(#lg-pad)` weighs one id); otherwise carry Amax.
      const pad = gap.every((v) => v >= 0)
        ? ":not(#lg-pad)".repeat(gap[0]) +
          ":not(.lg-pad)".repeat(gap[1]) +
          ":not(lg-pad)".repeat(gap[2])
        : null;
      arm =
        pad === null
          ? `:where(${k}):is(${[...args, max].join(", ")})`
          : `:where(${k}):is(${args.join(", ")})${pad}`;
    }
    return head + parts.slice(0, index).join("") + arm + parts.slice(index + 1).join("");
  });
}

export function bucketSelectors(selectors) {
  return selectors.flatMap(bucketSelector);
}

/** PostCSS plugin: applied to the liquid glass sheets only. */
export function glassSelectorBuckets() {
  return {
    postcssPlugin: "dw-glass-selector-buckets",
    Once(root) {
      // Vite passes the id with its query (`…/styles-liquid-glass.css?url`).
      const file = String(root.source?.input?.file ?? "").replace(/\?.*$/, "");
      if (!GLASS_SHEET.test(file)) return;
      root.walkRules((rule) => {
        if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
        const next = bucketSelectors(rule.selectors);
        if (next.length !== rule.selectors.length || next.some((s, i) => s !== rule.selectors[i]))
          rule.selectors = next;
      });
    },
  };
}
glassSelectorBuckets.postcss = true;
