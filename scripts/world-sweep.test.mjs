import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* World and opening finishing sweep (2026-10-03). Each pin keeps one fix:
   the topbar sigil at 561-760px, the first-view warm-ups of the rider art and
   the archive's other tabs, the film scan standing down on typed headings,
   the opening deck's one-line label at 361-389px, and the annex's breaks
   (rider-name roles, the location names, the episode lines). */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const mirage = strip(read("src/styles-world-mirage.css"));
const reveal = strip(read("src/styles-world-reveal.css"));
const opening = strip(read("src/styles-opening-elevation.css"));
const annexCss = strip(read("src/styles-world-annex.css"));
const home = read("src/components/world/world-home.tsx");
const annex = read("src/components/world/world-annex.tsx");
const warm = read("src/components/world/world-swap-warmups.ts");
const other = read("src/components/world/other-artwork-card.tsx");

test("561-760px: the topbar hides the brand's wordmark, never its sigil", () => {
  const block = mirage.slice(mirage.indexOf("@media (min-width: 561px) and (max-width: 760px)"));
  assert.match(
    block,
    /^@media \(min-width: 561px\) and \(max-width: 760px\) \{\s*\.site-shell\.film-edition\.mirage-edition \.brand > span:not\(\.brand-sigil\) \{\s*display: none;/,
  );
  assert.doesNotMatch(mirage, /\.brand > span \{\s*display: none/);
});

test("first views of the rider rail and the archive tabs paint their pictures: one mount effect warms them", () => {
  assert.match(home, /import \{ warmWorldSwaps \} from "\.\/world-swap-warmups";/);
  assert.equal(home.match(/warmWorldSwaps\(/g)?.length, 1);
  assert.match(
    home,
    /useEffect\(\s*\(\) =>\s*warmWorldSwaps\(\s*shellRef\.current \?\? document,\s*RIDERS\.map\(\(rider\) => rider\.img\),\s*riderTabRef\.current,\s*\),\s*\[\],\s*\);/,
  );
  assert.doesNotMatch(home, /new Image\(/);
  // The warm-up asks for the painted element's own candidates.
  const sizes = home.match(/sizes="(\(max-width: 760px\) 92vw[^"]+)"/)[1];
  assert.match(warm, new RegExp(`RIDER_ART_SIZES = "${sizes.replace(/[()]/g, "\\$&")}";`));
  assert.match(home, /srcSet=\{r\.img\.replace\(\/\\\.jpe\?g\$\/i, "\.webp"\)\}/);
  assert.match(warm, /srcSet: source\.replace\(\/\\\.jpe\?g\$\/i, "\.webp"\), sizes: RIDER_ART_SIZES/);
  // Every picture the REVERSE and RELATED panels mount, and nothing else.
  const panels = home.slice(home.indexOf('id="manager-panel-1"'), home.indexOf("</GuardedLink>\n                  {Array.from({ length: 1 }"));
  const sources = [...panels.matchAll(/src="(\/[^"]+)"/g)].map((m) => m[1]);
  const thumbs = [...other.matchAll(/thumb: "([^"]+)"/g)].map((m) => m[1]);
  const listed = [...warm.matchAll(/"(\/character-[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set([...sources, ...thumbs])].sort(), [...new Set([...listed, ...thumbs])].sort());
  assert.match(warm, /\.\.\.OTHER_ARTWORK\.map\(\(artwork\) => artwork\.thumb\)/);
  // Near the block only, one at a time, at low priority (the helper), never
  // in economy rendering, and the shown rider is never fetched twice.
  assert.match(warm, /import \{ warmRexonanceStages \} from "@\/lib\/warm-rexonance-stages";/);
  assert.match(warm, /if \(document\.documentElement\.dataset\.worldEffects === "economy"\) return \(\) => \{\};/);
  assert.match(warm, /\.slice\(0, riderArt\.length - 1\)/);
  assert.match(warm, /root\.querySelector\("\.riders-section \.rider-console"\)/);
  assert.match(warm, /root\.querySelector\("#manager-archive"\)/);
});

test("a typed heading writes itself: the film scan stands down on it", () => {
  assert.match(
    reveal,
    /\.site-shell\.film-edition\.mirage-edition \[data-text-reveal\] > \.film-text-scan \{\s*display: none;\s*\}/,
  );
  // The typed headings keep the scan element (FilmTextScan) in their markup.
  assert.equal(home.match(/<h2 data-film-reveal data-text-reveal="heading"[^>]*>\s*<FilmTextScan \/>/g)?.length, 4);
});

test("361-389px portrait: ENTER THE WORLD keeps one line beside もう一度", () => {
  const block = opening.slice(opening.indexOf("@media (min-width: 361px) and (max-width: 389px) and (orientation: portrait)"));
  assert.match(
    block,
    /^@media \(min-width: 361px\) and \(max-width: 389px\) and \(orientation: portrait\) \{\s*\.cine-btn \{\s*padding-inline: 0\.8rem;\s*\}\s*\.cine-btn-primary \{\s*letter-spacing: 0\.08em;\s*white-space: nowrap;\s*\}\s*\}/,
  );
  // Still 12px (the phones' size), still at least 44px tall elsewhere.
  assert.match(opening, /@media \(max-width: 700px\) \{\s*\.cine-btn \{\s*padding-inline: 1\.1rem;\s*\}\s*\.cine-btn-primary \{\s*font-size: 12px;/);
});

test("the annex breaks between words: rider-name roles, location names, episode lines", () => {
  assert.match(annex, /import \{ DisplayName \} from "@\/components\/name-text";/);
  assert.match(annex, /<p className="wa-role">\s*<DisplayName value=\{entry\.role\} \/>\s*<\/p>/);
  assert.match(
    annexCss,
    /@media \(min-width: 900px\) \{\s*\.site-shell\.film-edition\.mirage-edition \.wa-locations li \{\s*grid-template-columns: 56px minmax\(11\.5rem, 0\.28fr\) minmax\(0, 1fr\);/,
  );
  assert.match(
    annexCss,
    /\.site-shell\.film-edition\.mirage-edition \.wa-episodes \.wa-quote blockquote p \{\s*text-wrap: balance;\s*\}/,
  );
});
