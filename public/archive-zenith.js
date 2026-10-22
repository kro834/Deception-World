/* ================================================================
   Form Archive — Zenith line breaks (2026-10-22)

   A classic deferred script, linked last in both standalone documents.
   It changes no word, no value and no order: it only says where a line
   may break, with <span class="zn-glue"> (an inline block no wider than
   its line, styled in archive-zenith.css), <span class="zn-join"> (two
   characters that never part) and <wbr>, inside one
   <span class="zn-run"> per marked text. textContent and innerText stay
   exactly the owner's text, so the controllers, the analyzer, the profile
   and the leaderboard read what they always read.

   1. Figures and their labels: a " / ", " + " or " ⇄ " list breaks after
      its separator, never before it (1.00× / 1.00× | / 1.00× led a line
      with its slash), a short last term keeps its separator (速 / 演, not a
      lone 演), and a short bracketed note with a space stays whole
      ((Spark | G2)).
   2. Form names in the tables' row heads and on the index cards break
      between their words (ラスト | ヴィンクルム, エクスプリーム・ |
      ウルトラ), never inside one (ラストヴィンクル | ム).
   3. Short Japanese lines break by phrase: after a particle or an
      inflection, before the next word, so 統合アーカ | イブ or 万 | 能基盤
      no longer happen. Safari has no word-break: auto-phrase, and Chrome's
      phrases, longer than these, broke a narrow comparison card before a
      particle (200% | へ, レルムスレイヤー | を): every engine takes these
      seams. html[data-zn-phrases] turns on the keep-all that honours them
      (without the script, Chrome keeps auto-phrase).
   ================================================================ */
(() => {
  "use strict";

  const ROOT = "#saga-forms-performance-v5, #realm--saga-forms-performance-v5";

  const FIGURE_TEXT = [
    ".spec-item > .text-muted",
    ".spec-item > .spec-value",
    ".table td .text-small",
    ".archive-footer p",
    ".compare-diff-value",
  ].join(", ");

  // Form names: the tables' row heads and the index cards' names; and the
  // ratio table's tier/role line (超究極・攻撃限界拡張), which a phone's
  // narrow column lets break after its ・.
  const NAMES = ".table tbody th[scope='row'], .form-chip .chip-name, .table td .text-nowrap";

  // Short Japanese text that reads by phrase: leads, list items, notes and
  // the narrow comparison cards. Long dossier paragraphs keep the normal
  // breaking (a ragged edge suits short lines, not body copy).
  const PHRASE_TEXT = [
    ".hero-lead",
    ".selector-footnote",
    ".detail-lead",
    ".compare-description",
    ".compare-same-note",
    ".selector-empty p",
    ".detail-head .text-muted",
    ".ability-list li",
    ".ability-cards li",
    ".fact-list li",
    ".finisher-list li",
    ".operation-panel p",
    ".compare-form-card .ability-layout p",
    ".compare-form-card .rexonance-compare-revision p",
    ".table td .text-small",
    ".section h2",
  ].join(", ");

  // A bracketed note of up to 18 characters that holds a space stays
  // whole; a very short last term keeps its slash (速 / 演) or its plus
  // (33.3× + YOPS), two short last Latin words keep together (Pro Max);
  // any other term keeps the separator after it (1.00× /).
  // A glued run is an inline block no wider than its line, so in a column
  // too narrow for it, it still wraps inside rather than overflow.
  const GLUE =
    /[（(][^（）()\n]{1,18}[）)]|[「『][^「」『』\n]{1,18}[」』]|\S{1,3} \/ \S{1,2}$|\S+ \+ \S{1,4}$|\b[A-Za-z0-9.]{1,4} [A-Za-z0-9.]{1,4}$|\S+ [/+⇄](?= )/gu;
  const BRACKET = /^[（(「『]/u;

  // Japanese seams: after a run of hiragana (two or more, or a one-letter
  // particle) that a word in kanji, katakana, Latin, digits or a bracket
  // follows; after a comma, a full stop, a ・, a ／ or a ：. A one-letter
  // okurigana (引き上げる, 撃ち分ける) is not a seam.
  const PARTICLE = /^[をにはがでともへのや]$/u;
  const SEAM =
    /([ぁ-ゟ]+)(?=[一-鿿々゠-ヿA-Za-z0-9０-９Ａ-Ｚａ-ｚ（「『〈《【(])|([、。，．・／：])(?=[^、。，．・／：」』）〉》】)\s])/gu;

  // Under keep-all an engine may still break between a sign or a closing
  // bracket and the particle after it (200% | へ, （約1分） | の); the two
  // characters keep together in a plain no-wrap span (an inline block would
  // open a break before the sign: 200 | %へ).
  const JOIN = /[%％）)」』〉》】”’](?=[ぁ-ゟ])/gu;

  // Names: a seam after ・ and after the prefix ラスト.
  const NAME_SEAM = /・(?=.)|^ラスト(?=[゠-ヿ])/gu;

  /* ---------- Pure parts (also read by scripts/archive-zenith.test.mjs) ----------
     Each returns null when the text needs nothing, else its pieces in order:
     a string, { glue }, { join } or { wbr: true }. Joined, the strings, glue
     and join texts are always the input itself. */

  function glueParts(value) {
    const matches = [...value.matchAll(GLUE)].filter(
      (match) => !BRACKET.test(match[0]) || /\s/u.test(match[0]),
    );
    if (!matches.length) return null;
    const parts = [];
    let cursor = 0;
    for (const match of matches) {
      if (match.index > cursor) parts.push(value.slice(cursor, match.index));
      parts.push({ glue: match[0] });
      cursor = match.index + match[0].length;
    }
    if (cursor < value.length) parts.push(value.slice(cursor));
    return parts;
  }

  function phraseParts(value) {
    const cuts = new Set();
    for (const match of value.matchAll(SEAM)) {
      const run = match[1];
      if (run !== undefined && run.length < 2 && !PARTICLE.test(run)) continue;
      const cut = match.index + match[0].length;
      if (cut > 0 && cut < value.length) cuts.add(cut);
    }
    const joins = new Set([...value.matchAll(JOIN)].map((match) => match.index));
    if (!cuts.size && !joins.size) return null;
    const parts = [];
    let text = "";
    const flush = () => {
      if (text) parts.push(text);
      text = "";
    };
    for (let index = 0; index < value.length;) {
      if (cuts.has(index)) {
        flush();
        parts.push({ wbr: true });
      }
      if (joins.has(index)) {
        flush();
        parts.push({ join: value.slice(index, index + 2) });
        index += 2;
        continue;
      }
      text += value[index];
      index += 1;
    }
    flush();
    return parts;
  }

  function nameParts(value) {
    const cuts = [...value.matchAll(NAME_SEAM)].map((match) => match.index + match[0].length);
    if (!cuts.length) return null;
    const parts = [];
    let cursor = 0;
    for (const cut of cuts) {
      parts.push(value.slice(cursor, cut), { wbr: true });
      cursor = cut;
    }
    parts.push(value.slice(cursor));
    return parts;
  }

  /* ---------- DOM ---------- */

  function textNodes(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.nodeValue.trim()) continue;
      if (node.parentElement?.closest(".zn-glue, .zn-join, .name-word, .sr-only, script, style")) {
        continue;
      }
      nodes.push(node);
    }
    return nodes;
  }

  // The marked text goes back as one inline run, so a label that lays out
  // as a flex row (the figure labels on phones, two section titles) keeps a
  // single item for its text instead of one per piece.
  function mark(node, partsOf) {
    const parts = partsOf(node.nodeValue);
    if (!parts) return;
    const run = document.createElement("span");
    run.className = "zn-run";
    for (const part of parts) {
      if (typeof part === "string") {
        run.append(part);
      } else if (part.wbr) {
        run.append(document.createElement("wbr"));
      } else {
        const span = document.createElement("span");
        span.className = part.glue ? "zn-glue" : "zn-join";
        span.textContent = part.glue ?? part.join;
        run.append(span);
      }
    }
    node.replaceWith(run);
  }

  function each(root, selector, partsOf) {
    for (const element of root.querySelectorAll(selector)) {
      for (const node of textNodes(element)) mark(node, partsOf);
    }
  }

  // The analyzer rebuilds its difference rows on every choice: their
  // values are marked again in the next frame (a pass over marked text
  // changes nothing, so the watch settles at once).
  function watchDifference(root) {
    const section = root.querySelector('[id$="saga-form-compare-ios"]');
    if (!section || typeof MutationObserver !== "function") return;
    let frame = 0;
    new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        each(section, ".compare-diff-value", glueParts);
      });
    }).observe(section, { childList: true, subtree: true });
  }

  function run() {
    const roots = document.querySelectorAll(ROOT);
    if (!roots.length) return;
    for (const root of roots) {
      each(root, FIGURE_TEXT, glueParts);
      each(root, NAMES, nameParts);
      each(root, PHRASE_TEXT, phraseParts);
      watchDifference(root);
    }
    document.documentElement.dataset.znPhrases = "true";
    document.documentElement.dataset.znBreaks = "true";
    // The analyzer's rows measure their labels; let them settle again.
    window.ArchiveComparisonUI?.refresh?.();
  }

  window.ArchiveZenithBreaks = Object.freeze({ glueParts, phraseParts, nameParts });

  const start = () => {
    try {
      run();
    } catch (error) {
      console.warn("[archive-zenith]", error);
    }
  };
  // After the controllers and the Rexonance revision (DOMContentLoaded),
  // in the next frame, as the name enhancer does.
  if (document.readyState === "complete") {
    window.requestAnimationFrame(start);
  } else {
    document.addEventListener("DOMContentLoaded", () => window.requestAnimationFrame(start), {
      once: true,
    });
  }
})();
