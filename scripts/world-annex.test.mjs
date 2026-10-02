import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  WORLD_BRIEF,
  WORLD_CAST_ROSTER,
  WORLD_EPISODE_NOTES,
  WORLD_GLOSSARY,
  WORLD_LOCATIONS,
  WORLD_QUOTES,
} from "../src/components/world/world-annex-data.ts";

/* World annex (資料目次, 世界と組織, 人物一覧, エピソードの言葉, 用語集,
   名台詞). The additions come from the owner's story source; the existing
   /world page is unchanged apart from the three places that render them. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("src/components/world/world-home.tsx");
const annex = read("src/components/world/world-annex.tsx");
const data = read("src/components/world/world-annex-data.ts");
const route = read("src/routes/world.tsx");
const css = read("src/styles-world-annex.css").replace(/\/\*[\s\S]*?\*\//g, "");

test("world-home preserves its layout and copy outside explicitly approved edits", () => {
  const hooks = ['import { WorldAnnexRecords, WorldAnnexRiders } from "./world-annex";\n'];
  let stripped = home;
  for (const hook of hooks) {
    assert.ok(stripped.includes(hook), hook);
    stripped = stripped.replace(hook, "");
  }
  for (const name of ["WorldAnnexRiders", "WorldAnnexRecords"]) {
    assert.equal(home.split(`<${name} />`).length, 2, name);
    stripped = stripped.replace(`\n      <${name} />\n`, "");
  }
  // 2026-09-30: the poster deck asks for right-sized WebPs (posterImage and
  // preparePosterImage, src/lib/thumbnail-images.ts). Undoing exactly those
  // edits gives back the pinned file, so no string on /world moved with them.
  const backCard = (indent) =>
    `<img\n${indent}  src={current.src}\n${indent}  {...posterImage(current.src)}\n${indent}  alt=""\n${indent}  loading="lazy"\n${indent}  decoding="async"\n${indent}  fetchPriority="low"\n${indent}/>`;
  const posterHooks = [
    [
      'import {\n  episodeThumbnail,\n  managerThumbnail,\n  posterImage,\n  preparePosterImage,\n} from "@/lib/thumbnail-images";',
      'import { episodeThumbnail, managerThumbnail } from "@/lib/thumbnail-images";',
      1,
    ],
    [
      "preparePosterImage(image, POSTERS[nextIndex].src);",
      "image.src = POSTERS[nextIndex].src;",
      1,
    ],
    [
      "preparePosterImage(image, POSTERS[(poster + 1) % POSTERS.length].src);",
      "image.src = POSTERS[(poster + 1) % POSTERS.length].src;",
      1,
    ],
    [
      "preparePosterImage(finalImage, POSTERS[finalPoster].src);",
      "finalImage.src = POSTERS[finalPoster].src;",
      1,
    ],
    [
      backCard("              "),
      '<img src={current.src} alt="" loading="lazy" decoding="async" fetchPriority="low" />',
      3,
    ],
    ["\n                {...posterImage(nextPoster.src)}", "", 1],
    ["\n                    {...posterImage(previous.src)}", "", 1],
    ["\n                  {...posterImage(current.src)}", "", 1],
    // The hero backdrop shows the same poster, so it asks for the same file.
    ["\n                {...posterImage(previous.src)}", "", 1],
    ["\n              {...posterImage(current.src)}", "", 1],
    // Busy state covers the reduced-motion decode wait too; reversing these
    // exact behavioral edits keeps the original-copy fingerprint intact.
    [
      "    shuffleActive.current = true;\n    setShuffling(true);\n    setLocked(true);",
      "    shuffleActive.current = true;\n    setLocked(true);",
      1,
    ],
    [
      "        shuffleActive.current = false;\n        setShuffling(false);\n      });\n      return;",
      "        shuffleActive.current = false;\n      });\n      return;",
      1,
    ],
    [
      "    [0, 75, 155, 240, 335, 440, 560, 695, 850, 1025].forEach",
      "    setShuffling(true);\n    [0, 75, 155, 240, 335, 440, 560, 695, 850, 1025].forEach",
      1,
    ],
  ];
  // 2026-09-30: the テラ / ルナ cards and EP 02 pickups warm RELATED_NAV's
  // list (the file's hero only; scripts/rider-cover.test.mjs). Undoing exactly
  // those edits gives back the pinned file.
  const relatedCard = (id, first) =>
    `assets={\n                      RELATED_NAV.find((item) => item.id === "${id}")?.assets ?? [\n                        "${first}",\n                      ]\n                    }`;
  const oldCard = (name, form) =>
    `assets={[\n                      "/character-${name}.jpeg",\n                      "/character-${name}-thumb.jpeg",\n                      "/rider-realm-${form}.jpeg",\n                    ]}`;
  posterHooks.push(
    [
      'import { RELATED_NAV, RIDER_NAV, NameText } from "./dossier-nav";',
      'import { RIDER_NAV, NameText } from "./dossier-nav";',
      1,
    ],
    [
      '        // The file shows its hero on arrival; the form pickup loads lazily.\n        assets: RELATED_NAV.find((item) => item.id === "01")?.assets ?? ["/character-terra.jpeg"],',
      '        assets: ["/character-terra.jpeg", "/character-terra-thumb.jpeg", "/rider-realm-earth.jpeg"],',
      1,
    ],
    [
      '        assets: RELATED_NAV.find((item) => item.id === "02")?.assets ?? ["/character-luna.jpeg"],',
      '        assets: ["/character-luna.jpeg", "/character-luna-thumb.jpeg", "/rider-realm-moon.jpeg"],',
      1,
    ],
    [
      "                    // Only what the file shows on arrival (its hero); the\n                    // form pickup there (710-760 KB) loads lazily.\n                    " +
        relatedCard("01", "/character-terra.jpeg"),
      "                    " + oldCard("terra", "earth"),
      1,
    ],
    [relatedCard("02", "/character-luna.jpeg"), oldCard("luna", "moon"), 1],
  );
  // Shuffle previews now warm only their small candidate pool and move only
  // after decode; reverse those behavior-only edits so this copy pin remains
  // scoped to changes in the /world text and layout.
  const previewReadiness = [
    "    const previewReady = new Set<number>();",
    "    previewPool.forEach((index) => {",
    "      const image = index === finalPoster ? finalImage : new Image();",
    "      if (image !== finalImage) {",
    '        image.decoding = "async";',
    '        image.fetchPriority = "low";',
    "        preparePosterImage(image, POSTERS[index].src);",
    "      }",
    "      const decoded = index === finalPoster ? finalReady : image.decode?.();",
    "      if (!decoded) {",
    "        const markLoaded = () => {",
    "          if (image.complete && image.naturalWidth > 0) previewReady.add(index);",
    "        };",
    "        markLoaded();",
    '        image.addEventListener("load", markLoaded, { once: true });',
    "        return;",
    "      }",
    "      void decoded",
    "        .then(() => {",
    "          if (shuffleRunId.current !== runId) return;",
    "          if (image.naturalWidth > 0) previewReady.add(index);",
    "        })",
    "        .catch(() => {",
    "          if (shuffleRunId.current !== runId) return;",
    "          if (image.complete && image.naturalWidth > 0) previewReady.add(index);",
    "        });",
    "    });",
    "",
    "",
  ].join("\n");
  posterHooks.push(
    [previewReadiness, "", 1],
    [
      "        const previewPoster = previewPosters[index % previewPosters.length];\n" +
        "        const ready = isFinalStep\n" +
        "          ? await waitForFinalImage()\n" +
        "          : previewReady.has(previewPoster);",
      "        const ready = isFinalStep ? await waitForFinalImage() : true;",
      1,
    ],
    [
      "        const next = isFinalStep ? finalPoster : previewPoster;\n" +
        "        if (ready || (isFinalStep && finalImage.complete && finalImage.naturalWidth > 0)) {",
      "        const next = isFinalStep ? finalPoster : previewPosters[index % previewPosters.length];\n" +
        "        if (!isFinalStep || ready || (finalImage.complete && finalImage.naturalWidth > 0)) {",
      1,
    ],
  );
  for (const [edited, original, count] of posterHooks) {
    assert.equal(stripped.split(edited).length - 1, count, edited);
    stripped = stripped.replaceAll(edited, original);
  }
  // 2026-10-01: the owner requested source-grounded prose and scene selection.
  // Reverse only the two approved story paragraphs; every other string and
  // the existing layout remain protected by the original fingerprint.
  const storyEdits = [
    [
      "荒廃した碧栄で追跡を逃れる月城悠真の前に、死んだはずのベル・アレインが現れる。再会の一方で、サーガが管理人ローアの管轄から逸脱したことを知ったレックス・ロワは、世界の秩序を保つために「六詠」の介入を決める。",
      "世界、概念、領域、物語、法則。あらゆるものを管轄する管理人。その最上位に位置する六つの存在が、サーガ世界の行く末へ干渉を始める。",
    ],
    [
      "悠真を守るベルと、自らの創作物を守ろうとするローアのもとに、刑事、怪盗、別世界のエージェントが集まる。彼らが管理された運命に抗うなか、六詠第三位のシュザは、人が何を望むかさえ書き換える支配の手を伸ばす。",
      "シエル、ベル、ローア、レックス、華火、真守、ジェームズ、リュシアン。異なる立場を背負った八人は、ひとつの結末へ向けて交差する。",
    ],
  ];
  for (const [edited, original] of storyEdits) {
    assert.equal(stripped.split(edited).length - 1, 1, edited);
    stripped = stripped.replace(edited, original);
  }
  // 2026-10-02: the owner requested natural copy instead of abstract slogans.
  // Permit only the Sol-reviewed heading and introduction edits; the column
  // bodies, episode stories, facts and all markup retain their existing pin.
  const copyEdits = [
    [
      "const RIDERS_TITLE = <>八人の戦いが交わる。</>;",
      "const RIDERS_TITLE = <>八人が、世界へ。</>;",
    ],
    [
      "    戦いの記録を\n    <br />\n    辿る。",
      "    到達点は、\n    <br />\n    ひとつではない。",
    ],
    ["救うべき世界は、目の前にある。", "救うべきものは、夢の向こうにはない。"],
    [
      "6人の最上位管理人と8人のライダーが、現実世界を舞台に交錯する。",
      "6人の最上位管理人と、8人のライダーが同じ世界で交差する。",
    ],
    ["異なる立場の八人が、同じ世界で戦う。", "八つの軌跡が同じ世界で交差する。"],
  ];
  for (const [edited, original] of copyEdits) {
    assert.equal(stripped.split(edited).length - 1, 1, edited);
    stripped = stripped.replace(edited, original);
  }
  // SHA-256 of world-home.tsx before the annex (every existing string on
  // /world). Update only on the owner's request to change that copy.
  assert.equal(
    createHash("sha256").update(stripped).digest("hex"),
    "50bdfab3cbf6fe8e8e9c1d3aed6ba1ecc2a100346c647993f796f1ed10becc98",
  );
  // The WorldAnnexRiders hook stays where it was (this file is pinned), but
  // renders nothing: 02 RIDERS and 03 RECORDS sit back to back, and the
  // annex follows RECORDS as chapters 04-06. Nothing sits between the column
  // rail and the riders heading (verify-world-reveal presses the rail beside
  // that part-lit heading on a 412px phone).
  assert.match(annex, /export function WorldAnnexRiders\(\)\s*\{\s*return null;/);
  assert.match(home, /<\/section>\s*<\/section>\s*<section className="riders-section"/);
  assert.match(home, /<\/section>\s*<WorldAnnexRiders \/>\s*<section className="records-section"/);
  assert.match(
    home,
    /<\/section>\s*<\/section>\s*<WorldAnnexRecords \/>\s*<section className="finale-section"/,
  );
});

test("the annex data is complete", () => {
  assert.deepEqual(
    WORLD_BRIEF.map(({ id }) => id),
    ["rikuei", "kanri", "realms", "code"],
  );
  assert.equal(WORLD_LOCATIONS.length, 5);
  assert.equal(WORLD_CAST_ROSTER.length, 14);
  assert.equal(new Set(WORLD_CAST_ROSTER.map(({ id }) => id)).size, 14);
  for (const entry of WORLD_CAST_ROSTER) {
    assert.ok(entry.name && entry.role && entry.profile.length, entry.id);
    if (entry.to) assert.match(entry.to, /^\/(?:riders|managers|characters)\/[\w-]+$/, entry.id);
  }
  assert.deepEqual(
    WORLD_EPISODE_NOTES.map(({ no, title }) => `${no} ${title}`),
    ["01 HIDE-AND-SEEK", "02 LEGENDS", "03 DECEPTION WORLD"],
  );
  for (const episode of WORLD_EPISODE_NOTES) assert.equal(episode.lines.length, 3);
  assert.equal(WORLD_GLOSSARY.length, 13);
  for (const entry of WORLD_GLOSSARY) assert.ok(entry.body.length || entry.said.length, entry.term);
  assert.equal(WORLD_QUOTES.length, 10);
  // In-story text only: no chat handles, no ideographic indent spaces.
  assert.doesNotMatch(data, /@|\u3000/);
  // Conflicting or undecided facts stay out until the owner settles them.
  for (const held of [
    "採録制",
    "モスコ",
    "ニヒル",
    "ワンコ",
    "プロヴァンス",
    "慶弥",
    "シエル",
    "冤罪",
  ]) {
    assert.ok(!data.includes(held), held);
  }
});

test("each annex is its own section, listed in the contents", () => {
  // The annex now follows 03 RECORDS in chapter order 04-06.
  const ids = ["cast-roster", "world-brief", "episode-notes", "glossary", "quotes"];
  for (const id of ids) {
    assert.match(annex, new RegExp(`<section\\s+id="${id}"\\s+className="world-annex[ "]`), id);
    assert.match(annex, new RegExp(`aria-labelledby="${id}-title"`), id);
  }
  const hrefs = [...annex.matchAll(/href: "#([\w-]+)"/g)].map((match) => match[1]);
  assert.deepEqual(hrefs, ids);
  assert.match(annex, /<nav className="wa-contents" aria-labelledby="wa-contents-title">/);
  // Static documents: the typed reveal and film reveal stay on their blocks.
  assert.doesNotMatch(
    annex,
    /data-text-reveal|data-film-reveal|RevealText|data-performance-region/,
  );
  // The topbar keeps its three chapter links.
  assert.equal(home.match(/<a\s+href="#(?:story|riders|records)"\s+aria-label=/g)?.length, 3);
  assert.match(annex, /aria-label=\{`\$\{entry\.name\}の個別資料を開く`\}/);
});

test("the annex sheet sits before the Mirage face, which stays last", () => {
  const links = route.slice(route.search(/stylesheetLinks:\s*\[/));
  const order = [
    "href: worldReDiveCssUrl",
    "href: worldAnnexCssUrl",
    "href: MIRAGE_FONTS_URL",
    "href: worldMirageCssUrl",
  ].map((needle) => links.indexOf(needle));
  assert.ok(
    order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])),
    String(order),
  );
});

test("the annex sheet keeps the page rules", () => {
  for (const size of css.matchAll(/font-size:\s*([^;]+);/g)) {
    const minimum = size[1].match(/^clamp\(([\d.]+)px/)?.[1] ?? size[1].match(/^([\d.]+)px$/)?.[1];
    assert.ok(minimum != null && Number(minimum) >= 12, size[1]);
  }
  assert.doesNotMatch(css, /animation|@keyframes|view-timeline|scroll-timeline|transition/);
  assert.doesNotMatch(css, /touch-action:|overscroll-behavior:|backdrop-filter:|!important/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*-webkit-text-fill-color: CanvasText;/);
  assert.match(
    css,
    /\.wa-contents a:focus-visible,\s*\.site-shell\.film-edition\.mirage-edition \.wa-open:focus-visible \{\s*outline: 2px solid var\(--mr-focus\);/,
  );
  assert.match(
    css,
    /\.wa-contents a,\s*\.site-shell\.film-edition\.mirage-edition \.wa-open \{[^}]*min-height: 44px;/,
  );
  const selectors = [...css.matchAll(/(?:^|[{};])\s*([^{};@\s][^{};]*)\{/g)]
    .map((match) => match[1].trim())
    .filter((selector) => !/^(?:from|to|\d+%)$/.test(selector));
  for (const group of selectors) {
    // Split on top-level commas only (not those inside :is()).
    for (const part of group.split(/,\s*(?![^()]*\))/)) {
      assert.match(
        part,
        /^(?:html\[data-world-effects="economy"\]\s+)?\.site-shell\.film-edition\.mirage-edition\b/,
        part,
      );
    }
  }
});

test("the annex presentation: chapter openers, portraits, disclosures, the quote rail", () => {
  // Chapter openers are a still clone, never the choreographed class.
  assert.doesNotMatch(annex, /className="section-index"/);
  // Every image is decorative and lazy.
  const imgs = [...annex.matchAll(/<img\b[\s\S]*?\/>/g)].map((match) => match[0]);
  assert.ok(imgs.length >= 4, String(imgs.length));
  for (const img of imgs) {
    assert.match(img, /alt=""/, img);
    assert.match(img, /loading="lazy"/, img);
  }
  // Portrait and episode art: existing site files only.
  const paths = [...annex.matchAll(/"(\/[\w-]+\.(?:jpe?g|webp|png))"/g)].map((match) => match[1]);
  assert.ok(paths.length >= 13, String(paths.length));
  for (const path of paths) {
    assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)), path);
  }
  for (const key of ["rex-loi", "reemu", "shuza"]) {
    assert.ok(existsSync(new URL(`../public/manager-${key}-thumb.jpeg`, import.meta.url)), key);
  }
  // 2026-09-30: the rail is a keyboard stop only while it scrolls (below
  // 700px); the still desktop list is no longer an empty Tab stop.
  assert.match(
    annex,
    /<div\s+ref=\{railRef\}\s+className="wa-quote-rail"\s+role="region"\s+tabIndex=\{scrolls \? 0 : undefined\}\s+aria-labelledby="quotes-title"\s+id="world-quotes-rail"/,
  );
  assert.match(annex, /setScrolls\(rail\.scrollWidth > rail\.clientWidth \+ 1\)/);
  assert.match(annex, /const \[scrolls, setScrolls\] = useState\(true\);/);
  assert.match(css, /scroll-margin-top: calc\(\s*var\(--film-topbar-height/);
  assert.match(css, /summary:focus-visible \{\s*outline: 2px solid var\(--mr-focus\);/);
  // REALMS documents keep the office as their accessible name (it was the
  // old section's aria-label), and no heading sits inside a summary.
  assert.match(
    annex,
    /<details key=\{doc\.office\} className="wa-doc" aria-label=\{doc\.office\}>/,
  );
  assert.doesNotMatch(annex, /<summary>\s*<h\d/);
  // An opened profile takes the next row; dense packing closes the cell it left.
  assert.match(css, /\.wa-roster \{[^}]*grid-auto-flow: row dense;/);
});

test("the PROFILE switch reads as a control and stays under the finger", () => {
  // Native disclosure and its naming stay as they were (find-in-page opens it).
  assert.match(
    annex,
    /<details className="wa-profile" onToggle=\{keepProfileInPlace\}>\s*<summary onClick=\{noteProfileTop\}>\s*<span className="wa-sr">\{entry\.name\}<\/span> <span lang="en">PROFILE<\/span>\s*<\/summary>/,
  );
  // Opening moves the tile to the next row: the summary's top is noted on
  // click and restored with an instant scroll (no smooth scroll, no motion),
  // only after a click, and never above the topbar (its scroll-margin-top).
  assert.match(
    annex,
    /profileTops\.set\(event\.currentTarget, event\.currentTarget\.getBoundingClientRect\(\)\.top\)/,
  );
  assert.match(annex, /if \(!summary \|\| before === undefined\) return;/);
  assert.match(annex, /window\.scrollBy\(\{ top: shift, behavior: "instant" \}\)/);
  assert.match(annex, /getComputedStyle\(summary\)\.scrollMarginTop/);
  // The plate: a boxed, filled switch with a 44px hit area and a gold state
  // cell; open lights the plate and fills the cell. CLOSE is generated with
  // an empty alt so the accessible name stays "<name> PROFILE".
  assert.match(
    css,
    /\.wa-profile > summary,\s*\.site-shell\.film-edition\.mirage-edition \.wa-doc > summary \{[^}]*min-height: 44px;[^}]*border: 1px solid var\(--mr-line-strong\);[^}]*background: rgb\(122 232 255 \/ 6%\);/,
  );
  assert.match(
    css,
    /\.wa-profile\[open\] > summary::after,\s*\.site-shell\.film-edition\.mirage-edition \.wa-doc\[open\] > summary > i \{\s*border-color: var\(--mr-gold\);\s*background: var\(--mr-gold\);/,
  );
  assert.match(css, /\.wa-profile\[open\] > summary::before,[^{]*\{[^}]*rotate: -135deg;/);
  assert.match(
    css,
    /@container \(min-width: 196px\) \{[^}]*content: "CLOSE" \/ "";[^}]*font-size: 12px;/,
  );
  assert.match(
    css,
    /@media \(forced-colors: active\)[\s\S]*\.wa-profile\[open\] > summary::after,[^{]*\{\s*background: Highlight;/,
  );
});
