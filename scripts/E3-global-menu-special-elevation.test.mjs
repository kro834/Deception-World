import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const future = stripComments(read("src/styles-future-interface.css"));
const transitions = stripComments(read("src/styles-route-transitions.css"));
const world14 = stripComments(read("src/styles-world/14.css"));
const special = stripComments(read("src/styles-rexonance-saga.css"));
const chrome = read("src/components/world/world-chrome.tsx");
const rexonance = read("src/components/rexonance-saga/rexonance-saga.tsx");
const extreme = read("src/components/extreme-saga/extreme-saga.tsx");
const finalStage = read("src/components/final-stage/final-stage.tsx");

// The body of the first rule whose selector matches, and every @media block.
const ruleBody = (css, selector) => {
  const start = css.search(selector);
  assert.ok(start >= 0, `missing rule ${selector}`);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
};
const mediaBlocks = (css) => {
  const blocks = [];
  for (const match of css.matchAll(/@media[^{]*\{/g)) {
    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < css.length && depth; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    blocks.push({ query: match[0], start: match.index, end: i, body: css.slice(match.index, i) });
  }
  return blocks;
};

test("type: the Japanese composition baseline is global, zero-specificity and layout-only", () => {
  const root = ruleBody(future, /:where\(html:lang\(ja\)\)\s*\{/);
  assert.match(root, /line-break: strict;/);
  assert.match(root, /text-spacing-trim: trim-start;/);
  assert.match(root, /text-autospace: normal;/);
  // Headings, names, labels and controls: phrases, balanced lines.
  const labels = future.match(/:where\(\s*h1,[^)]*\bbutton,\s*a\s*\)\s*\{([^}]*)\}/);
  assert.ok(labels, "heading/label baseline");
  assert.match(labels[1], /word-break: auto-phrase;\s*text-wrap-style: balance;/);
  // Short copy: phrases, no orphaned last line.
  assert.match(future, /:where\(p, li\) \{\s*word-break: auto-phrase;\s*text-wrap-style: pretty;/);
  // Long-form prose stays flush (character breaking with strict kinsoku).
  assert.match(
    future,
    /:where\(\.manager-copy-body, \.fst-story-copy, \.dream-story-case-body, \.dream-prologue-card\)\s*:where\(p, li\) \{\s*word-break: normal;/,
  );
  // Under 350px the Dolminence names keep the default kinsoku (two lines, not
  // 仮面ライ／ダードレッ／ド).
  const dolminence = mediaBlocks(future).find((b) => b.body.includes(".dream-dolminence-copy b"));
  assert.match(dolminence.query, /@media \(max-width: 349px\)/);
  assert.match(
    dolminence.body,
    /:where\(\.dream-dolminence-copy b\) \{\s*line-break: normal;\s*\}/,
  );
  for (const [, body] of future.matchAll(/:where\([^{]*\{([^}]*)\}/g)) {
    // Nothing in the baseline paints or moves.
    assert.doesNotMatch(body, /\b(?:animation|transition|transform|filter|color|background)\b/);
    // Only the wrap style: the shorthand would also reset text-wrap-mode and
    // undo a container's inherited nowrap.
    assert.doesNotMatch(body, /\btext-wrap:|text-wrap-mode|white-space/);
  }
});

test("dives: rider and special-site dives arrive onto the page without a white-out", () => {
  const archiveDissolve = transitions.indexOf(".load-gate.archive-route-dive.is-arriving {");
  const riderArrival = transitions.indexOf(".load-gate.rider-route-dive.is-arriving {");
  assert.ok(
    archiveDissolve >= 0 && riderArrival > archiveDissolve,
    "rider arrival wins the cascade",
  );
  const block = mediaBlocks(transitions).find(
    (b) => b.start < riderArrival && b.end > riderArrival,
  );
  assert.match(block.query, /prefers-reduced-motion: no-preference/);
  assert.match(
    block.body,
    /\.load-gate\.rider-route-dive\.is-arriving \{\s*animation: dw-dive-gate-open 0\.48s cubic-bezier\(0\.4, 0, 0\.2, 1\) both;/,
  );
  assert.match(
    block.body,
    /\.rider-route-dive\.is-arriving \.cine-dive-flash \{\s*animation-name: dw-dive-exit-light-soft;/,
  );
  const soft = transitions.match(/@keyframes dw-dive-exit-light-soft \{([\s\S]*?)\n\}/)[1];
  const peaks = [...soft.matchAll(/opacity: ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...peaks) <= 0.56, `exit light peaks at ${Math.max(...peaks)}`);
  const open = transitions.match(/@keyframes dw-dive-gate-open \{([\s\S]*?)\n\}/)[1];
  assert.match(open, /0%,\s*34% \{\s*opacity: 1;\s*\}\s*to \{\s*opacity: 0;/);
  assert.doesNotMatch(open + soft, /transform|filter|scale/);
});

test("press: legacy :active states sink instead of growing", () => {
  assert.doesNotMatch(world14, /scale: 1\.0(?:34|18)/);
  assert.match(world14, /\.rider-nightmare-pickup-button:active \{\s*scale: 0\.97;/);
  assert.match(
    world14,
    /\.signal\.is-accessible:active,\s*\.dante-archive:active \{\s*transform: none;\s*scale: 0\.985;/,
  );
  // Reduced motion still pins every one of them at rest.
  assert.match(world14, /\.dante-archive \{\s*scale: 1 !important;/);
});

test("touch: special-site hovers answer fine pointers only, so taps never stick", () => {
  const fine = mediaBlocks(special).filter((b) =>
    /\(hover: hover\) and \(pointer: fine\)/.test(b.query),
  );
  const outside = fine.reduce((css, b) => css.replace(b.body, ""), special);
  const reducedOnly = mediaBlocks(outside).filter((b) => /prefers-reduced-motion/.test(b.query));
  const loose = reducedOnly.reduce((css, b) => css.replace(b.body, ""), outside);
  assert.doesNotMatch(
    loose,
    /:hover/,
    "every :hover sits behind (hover: hover) and (pointer: fine)",
  );
  assert.match(special, /\.rxs-local-nav nav a:focus-visible \{\s*color: #fff;/);
  const gated = fine.map((b) => b.body).join("\n");
  assert.match(
    gated,
    /\.rxs-stage-tabs\.liquid-swipe-tabs > button\[role="tab"\]:hover \{\s*transform: translateY\(-1px\);/,
  );
  assert.match(gated, /\.rxs-footer > a:hover \{[^}]*transform: translateY\(-2px\);/);
  assert.match(gated, /\.rxs-page \.rxs-brand:hover::before/);
});

test("wayfinding: the special sites show their way home", () => {
  // The DW sigil in front of the brand, decorative (the link's aria-label names it).
  assert.match(special, /\.rxs-page \.rxs-brand::after \{\s*content: "DW";\s*content: "DW" \/ "";/);
  assert.match(
    special,
    /\.rxs-page \.rxs-brand \{\s*position: relative;\s*padding-left: 42px;\s*\}/,
  );
  // The menu's STORIES: Dream Chapter, the World, Final Stage.
  const stories = chrome.slice(chrome.indexOf("<p>STORIES</p>"), chrome.indexOf("<p>RIDERS</p>"));
  const dream = stories.lastIndexOf("<span>映画第一作「ドリームチャプター」</span>");
  const home = stories.lastIndexOf("<span>ディセプションワールド</span>");
  const finale = stories.indexOf("<span>ファイナルステージ</span>");
  assert.ok(dream >= 0 && home > dream && finale > home, "Dream → MAIN SITE → Final Stage");
  assert.match(
    stories,
    /\{isSpecialSite \? \(\s*<GuardedLink\s+to="\/world"\s+hash="top"\s+assets=\{WORLD_ENTER_ASSETS\}\s+beforeNavigate=\{close\}\s*>\s*<span>ディセプションワールド<\/span>\s*<i>MAIN SITE<\/i>/,
  );
  assert.match(
    chrome,
    /const isSpecialSite =\s*context === "rexonance" \|\| context === "extreme" \|\| context === "final-stage";/,
  );
  // Every closing row ends on the same return, arrow first.
  for (const [name, source] of [
    ["rexonance", rexonance],
    ["extreme", extreme],
    ["final-stage", finalStage],
  ]) {
    const footer = source.slice(source.lastIndexOf("<footer"), source.lastIndexOf("</footer>"));
    assert.match(
      footer,
      /<GuardedLink\s+to="\/world"\s+hash="top"\s+assets=\{WORLD_ENTER_ASSETS\}\s+className="rxs-footer-return"\s*>\s*<span>メインサイトへ戻る<\/span>\s*<i aria-hidden="true">←<\/i>\s*<\/GuardedLink>\s*$/,
      `${name} footer ends on the way home`,
    );
  }
  assert.match(special, /\.rxs-footer > a\.rxs-footer-return \{\s*flex-direction: row-reverse;/);
  // One column per link beside the title from 1181px.
  assert.match(
    special,
    /@media \(min-width: 901px\) \{\s*\.rxs-footer:not\(\.fst-footer\) \{\s*grid-template-columns: minmax\(280px, 1fr\);\s*grid-auto-columns: auto;\s*grid-auto-flow: column;/,
  );
  // Narrower than 1181px, three links drop to one row under the title.
  assert.match(
    special,
    /@media \(min-width: 901px\) and \(max-width: 1180px\) \{\s*\.rxs-footer:not\(\.fst-footer\):has\(> a:nth-of-type\(3\)\) \{\s*grid-template-columns: minmax\(0, 1fr\) repeat\(3, auto\);\s*grid-auto-flow: row;\s*\}\s*\.rxs-footer:not\(\.fst-footer\):has\(> a:nth-of-type\(3\)\) > div \{\s*grid-column: 1 \/ -1;\s*\}\s*\.rxs-footer:not\(\.fst-footer\):has\(> a:nth-of-type\(3\)\) > a:first-of-type \{\s*grid-column-start: 2;/,
  );
  // The return is a step back on all three sites: the showcase restyles footer
  // links at (0,3,1), so its quiet tone is keyed at (0,4,1) and kept off Final
  // Stage, which has no --sc-* tokens.
  assert.match(
    special,
    /\.rxs-page\.rxs-page:where\(:not\(\.fst-page\)\) \.rxs-footer > a\.rxs-footer-return \{\s*border-color: var\(--sc-hairline-soft\);\s*color: rgb\(245 245 247 \/ 80%\);/,
  );
  // The Fold cover screen drops the sigil so the name clears the menu trigger.
  const fold = mediaBlocks(special).find((b) => /\(max-width: 300px\)/.test(b.query));
  assert.match(fold.body, /\.rxs-page \.rxs-brand \{\s*padding-left: 0;/);
  assert.match(fold.body, /\.rxs-page \.rxs-brand::after \{\s*content: none;/);
});

test("wayfinding: the menu lists the World's chapters in page order and marks the one in view", () => {
  const worldSections = chrome.slice(
    chrome.indexOf(') : context === "movie" ? ('),
    chrome.indexOf("<p>SPECIAL</p>"),
  );
  const worldOrder = ["top", "story", "manager-archive", "riders", "records", "re-dive"].map(
    (hash) => worldSections.lastIndexOf(`hash="${hash}"`),
  );
  assert.ok(
    worldOrder.every((index, i) => index > 0 && (i === 0 || index > worldOrder[i - 1])),
    `world SECTIONS order ${worldOrder}`,
  );
  const archive = chrome.match(/\) : context === "archive" \? \(\s*<>\s*\{\[([\s\S]*?)\]\.map/)[1];
  assert.deepEqual(
    [...archive.matchAll(/\["([\w-]+)"/g)].map((m) => m[1]),
    ["top", "story", "manager-archive", "riders", "records"],
  );
  // Read from the World header when the menu opens; only /world# rows are touched.
  assert.match(
    chrome,
    /useLayoutEffect\(\(\) => \{\s*const panel = panelRef\.current;\s*if \(!isOpen \|\| !panel\) return;\s*const header = document\s*\.querySelector\('\.topbar nav a\[aria-current="location"\]'\)/,
  );
  // 六詠 sits inside #story on the page: while it spans the header's marker,
  // its own row is lit instead of ストーリー.
  assert.match(
    chrome,
    /const archive = header === "#story" \? document\.getElementById\("manager-archive"\) : null;\s*let chapter = header;/,
  );
  assert.match(chrome, /import \{ worldChapterLine \} from "\.\/world-chapter-marker";/);
  assert.match(
    chrome,
    /const line = worldChapterLine\(archive\);\s*if \(top <= line && bottom > line\) chapter = "#manager-archive";/,
  );
  assert.match(chrome, /panel\.querySelectorAll\('\.side-panel-links > a\[href\^="\/world#"\]'\)/);
  assert.match(chrome, /row\.setAttribute\("aria-current", "location"\)/);
  // The chapter row reads like the current page: rail and filled chip, keyed by
  // the panel id so it outranks the World editions' row rules.
  const current =
    /#site-side-panel \.side-panel-links :is\(a, button\.side-panel-link-button\)\[aria-current="location"\] \{([^}]*)\}/;
  assert.match(future.match(current)[1], /box-shadow: inset 3px 0 0 rgb\(126 231 255 \/ 0\.9\);/);
  assert.match(
    future,
    /\[aria-current="location"\]\s*> i \{\s*color: #07121c;\s*background: rgb\(126 231 255 \/ 0\.9\);/,
  );
  assert.match(
    future,
    /@media \(forced-colors: active\) \{[\s\S]*?\[aria-current="location"\] \{\s*border-inline-start: 4px solid Highlight;/,
  );
});

test("wayfinding: phones list the eight riders in two columns from 390px", () => {
  const blocks = mediaBlocks(future);
  const phone = blocks.find(
    (b) =>
      b.query.includes("max-width: 840px") &&
      b.body.includes("#site-side-panel .side-panel-riders"),
  );
  assert.ok(phone, "phone riders grid");
  assert.match(
    phone.body,
    /#site-side-panel \.side-panel-riders \.side-panel-links \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.match(phone.body, /padding-inline: 16px 10px;/);
  assert.match(
    phone.body,
    /font-size: 13px;[\s\S]*?text-overflow: ellipsis;\s*white-space: nowrap;/,
  );
  const narrow = blocks.find((b) => b.query.includes("max-width: 389px"));
  assert.match(
    narrow.body,
    /#site-side-panel \.side-panel-riders \.side-panel-links \{\s*grid-template-columns: minmax\(0, 1fr\);/,
  );
  // While there are two columns, a short rule between them pairs each number
  // with its own name. A lit rider's rail (or forced-colors edge) stands in.
  assert.match(phone.body, /\{\s*position: relative;\s*display: grid;/);
  const divider = blocks.find((b) => b.query.includes("min-width: 390px"));
  assert.match(divider.query, /@media \(min-width: 390px\) and \(max-width: 840px\)/);
  assert.match(
    divider.body,
    /\.side-panel-riders\s*\.side-panel-links\s*> :is\(a, button\.side-panel-link-button\):nth-child\(even\):not\(\[aria-current\]\)::after \{\s*content: "";\s*position: absolute;\s*inset-block: 16px;\s*inset-inline-start: 0;\s*border-inline-start: 1px solid rgb\(167 190 205 \/ 0\.26\);\s*pointer-events: none;/,
  );
});

test("wayfinding: the menu and the World header read one chapter line", () => {
  const marker = read("src/components/world/world-chapter-marker.ts");
  const formula = "Math.max(92, Math.min(200, window.innerHeight * 0.22))";
  assert.ok(marker.includes(`return ${formula};`), "worldChapterMarker");
  assert.match(
    marker,
    /export function worldChapterLine\(section: Element, marker = worldChapterMarker\(\)\) \{\s*const landing = parseFloat\(getComputedStyle\(section\)\.scrollMarginTop\) \|\| 0;\s*return Math\.max\(marker, landing \+ 8\);/,
  );
  // WorldSectionNav either reads the shared line or still holds the same copy;
  // a change to only one side fails here instead of lighting two chapters.
  const home = read("src/components/world/world-home.tsx");
  const nav = home.slice(home.indexOf("const WorldSectionNav = memo("));
  const sharesModule = /from "\.\/world-chapter-marker"/.test(home);
  if (!sharesModule) {
    assert.ok(nav.includes(`const marker = ${formula};`), "WorldSectionNav marker drifted");
    assert.match(
      nav,
      /const landing = parseFloat\(getComputedStyle\(section\)\.scrollMarginTop\) \|\| 0;\s*if \(section\.getBoundingClientRect\(\)\.top <= Math\.max\(marker, landing \+ 8\)\)/,
      "WorldSectionNav hash-landing allowance drifted",
    );
  }
});
