// The React text pass for protected phrase units (src/lib/phrase-units.js).
//
// Every host element the site's own JSX creates (vite.config.ts routes
// src/'s "react/jsx-runtime" through phrase-jsx-runtime.js) has its string
// children split into plain text and units; each unit is wrapped in an
// inline <dw-u> that styles-name-words.css sets `white-space: nowrap`.
// Server and client run the same pass, so hydration matches, and the text
// content stays byte-identical: only wrappers are added, so search, find in
// page and copy and paste read exactly what they read before.
//
// A text slot that holds more than one piece is wrapped once more in a
// <dw-t>, so a flex or grid parent still sees that text as a single item
// (as it saw the anonymous text run) rather than one item per piece. The
// custom element names keep every existing `span` selector off them.
import { Fragment, jsx } from "react/jsx-runtime";
import { HEADING_CAP, LABEL_CAP, PROSE_CAP, splitPhraseUnits } from "./phrase-units.js";

// Text a span may not enter (option, title, textarea), is not prose (code)
// or is SVG (text, tspan), and table/list structure whose text is whitespace.
const SKIP = new Set([
  "title",
  "style",
  "script",
  "noscript",
  "template",
  "option",
  "optgroup",
  "select",
  "textarea",
  "pre",
  "code",
  "kbd",
  "samp",
  "svg",
  "text",
  "tspan",
  "textPath",
  "desc",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "colgroup",
  "dw-u",
  "dw-t",
]);
// Running prose has the full measure, so it holds longer units whole.
const PROSE = new Set(["p", "li", "dd", "blockquote", "figcaption"]);
// Section headings are set larger, but a column still holds ~8em of them.
const HEADING = new Set(["h2", "h3", "h4", "h5", "h6", "dt", "summary", "legend", "caption"]);

/** @param {string} text @param {number} cap @param {string} [key] */
function phraseText(text, cap, key) {
  const parts = splitPhraseUnits(text, cap);
  if (!parts) return text;
  if (parts.length === 3 && !parts[0] && !parts[2]) return jsx("dw-u", { children: parts[1] }, key);
  const nodes = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (index % 2) nodes.push(jsx("dw-u", { children: part }, index));
    else if (part) nodes.push(part);
  }
  return jsx("dw-t", { children: nodes }, key);
}

/**
 * Units in a children value. Adjacent strings and numbers are read as the one
 * run the browser lays out; every slot keeps its position (merged slots become
 * null), so siblings never shift and React state is never remounted.
 * @param {unknown} children @param {number} cap
 */
export function phraseNode(children, cap = LABEL_CAP) {
  if (typeof children === "string") return phraseText(children, cap);
  if (!Array.isArray(children)) return remeasure(children, cap);
  let out = null;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (Array.isArray(child) || (child && fragmentText.has(child))) {
      const next = phraseNode(child, cap);
      if (next !== child) (out ??= children.slice())[index] = next;
      continue;
    }
    if (typeof child !== "string" && typeof child !== "number") continue;
    let end = index + 1;
    let text = String(child);
    while (
      end < children.length &&
      (typeof children[end] === "string" || typeof children[end] === "number")
    ) {
      text += String(children[end]);
      end += 1;
    }
    const next = phraseText(text, cap, `dw${index}`);
    if (next !== text) {
      out ??= children.slice();
      out[index] = next;
      for (let merged = index + 1; merged < end; merged += 1) out[merged] = null;
    }
    index = end - 1;
  }
  return out ?? children;
}

/**
 * A fragment inside a heading or running prose (<p><>「{text}」</></p>) was
 * phrased as a label when it was created; phrase it again at this measure.
 * @param {any} child @param {number} cap
 */
function remeasure(child, cap) {
  if (cap === LABEL_CAP || !child || !fragmentText.has(child)) return child;
  return jsx(Fragment, { children: phraseNode(fragmentText.get(child), cap) }, child.key);
}

// A fragment's text belongs to whichever element it lands in, which is not
// known when it is created: it is phrased as a label then, and its original
// children are kept so running prose can phrase them again at its measure.
const fragmentText = new WeakMap();

/**
 * Create an element through React's `create` with its text phrased.
 * @param {(type: any, props: any, key: any) => any} create
 */
export function phraseElement(create, type, props, key) {
  if (type !== Fragment || props == null) return create(type, phraseProps(type, props), key);
  const children = props.children;
  const next = children == null ? children : phraseNode(children, LABEL_CAP);
  if (next === children) return create(type, props, key);
  const element = create(type, { ...props, children: next }, key);
  fragmentText.set(element, children);
  return element;
}

/** The props a host element is created with, its text children phrased. */
export function phraseProps(type, props) {
  if (typeof type !== "string" || props == null || SKIP.has(type)) return props;
  const children = props.children;
  if (children == null || typeof children === "boolean" || typeof children === "number")
    return props;
  if (props.dangerouslySetInnerHTML || props.contentEditable || props["data-phrase"] === "off")
    return props;
  const className = props.className;
  // DisplayName's short words are already held whole (name-word--protected).
  // A long one keeps its narrow-tile fallback (keep-all, overflow-wrap) for
  // the text around its units, and a label's measure for the units.
  const name = typeof className === "string" && className.includes("name-word");
  if (name && className.includes("name-word--protected")) return props;
  const cap = name
    ? LABEL_CAP
    : PROSE.has(type)
      ? PROSE_CAP
      : HEADING.has(type)
        ? HEADING_CAP
        : LABEL_CAP;
  const next = phraseNode(children, cap);
  return next === children ? props : { ...props, children: next };
}
