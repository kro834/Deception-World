import { nameWords } from "./name-break-rules.js";
import { watchPhraseFit } from "./phrase-fit.js";
import { HEADING_CAP, LABEL_CAP, PROSE_CAP, splitPhraseUnits } from "./phrase-units.js";

// The archive is a separate document. Enhance only display labels after its
// existing catalogue revision, leaving specs, prose, inputs and records alone.
function enhanceNames() {
  document
    .querySelectorAll("h1, h2, h3, h4, button, label, .rexonance-setting-hero > p")
    .forEach((label) => {
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.parentElement.closest(".name-word")) nodes.push(walker.currentNode);
      }
      nodes.forEach((node) => {
        const value = node.textContent;
        const matches = [
          ...value.matchAll(
            /(?:仮面ライダー)?[\u30a0-\u30ff]*サーガ(?:[・ ](?:ウルトラ|マックス))?/gu,
          ),
        ];
        if (!matches.length) return;
        const fragment = document.createDocumentFragment();
        let cursor = 0;
        matches.forEach((match) => {
          fragment.append(value.slice(cursor, match.index));
          nameWords(match[0]).forEach((word, index) => {
            if (index) fragment.append(document.createElement("wbr"));
            const span = document.createElement("span");
            span.className = `name-word${word.protected ? " name-word--protected" : ""}`;
            span.textContent = word.text;
            fragment.append(span);
          });
          cursor = match.index + match[0].length;
        });
        fragment.append(value.slice(cursor));
        node.replaceWith(fragment);
      });
    });
  enhancePhrases();
  // A unit wider than its own box wraps (src/lib/phrase-fit.js).
  watchPhraseFit(document);
  // Existing geometry sync measures the new labels; no row or artwork sizes
  // are changed here, and no polling/scroll listener is added.
  window.ArchiveComparisonUI?.refresh();
}

// The archive's text is raw HTML, so the React phrase pass
// (src/lib/phrase-children.js) cannot reach it: wrap the same protected units
// (src/lib/phrase-units.js) in <dw-u> once, on the text as it was published.
// Only wrappers are added; every character stays where it was.
function enhancePhrases() {
  const skip = "script, style, textarea, code, pre, svg, option, select, dw-u, .name-word--protected";
  const prose = "p, li, dd, blockquote, figcaption";
  const heading = "h2, h3, h4, h5, h6, dt, summary";
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.data.length > 1 && !node.parentElement.closest(skip)) nodes.push(node);
  }
  nodes.forEach((node) => {
    const parent = node.parentElement;
    const parts = splitPhraseUnits(
      node.data,
      parent.closest(prose) ? PROSE_CAP : parent.closest(heading) ? HEADING_CAP : LABEL_CAP,
    );
    if (!parts) return;
    const fragment = document.createDocumentFragment();
    parts.forEach((part, index) => {
      if (index % 2) {
        const unit = document.createElement("dw-u");
        unit.textContent = part;
        fragment.append(unit);
      } else if (part) fragment.append(part);
    });
    node.replaceWith(fragment);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => requestAnimationFrame(enhanceNames), { once: true });
} else {
  requestAnimationFrame(enhanceNames);
}
