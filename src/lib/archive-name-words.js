import { nameWords } from "./name-break-rules.js";

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
  // Existing geometry sync measures the new labels; no row or artwork sizes
  // are changed here, and no polling/scroll listener is added.
  window.ArchiveComparisonUI?.refresh();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => requestAnimationFrame(enhanceNames), { once: true });
} else {
  requestAnimationFrame(enhanceNames);
}
