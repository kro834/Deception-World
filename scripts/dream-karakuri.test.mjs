import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const cabinet = read("src/components/dream-chapter/dream-karakuri-cabinet.tsx");
const desk = read("src/components/dream-chapter/dream-programme-desk.tsx");
const lantern = read("src/components/dream-chapter/dream-stage-lantern.tsx");
const chapter = read("src/components/dream-chapter/dream-chapter.tsx");
const route = read("src/routes/dream-chapter.tsx");
const flat = (source) => source.replace(/\s+/g, " ");
const cabinetCss = flat(read("src/styles-dream-karakuri-cabinet.css"));
const programmeCss = flat(read("src/styles-dream-karakuri-programme.css"));
const karakuriCss = flat(read("src/styles-dream-karakuri.css"));

test("the chapter cabinet is a six-item keyboard-operable tab interface", () => {
  assert.match(cabinet, /role="tablist"/);
  assert.match(cabinet, /aria-label="あらすじを選ぶ"/);
  assert.match(cabinet, /role="tab"/);
  assert.match(cabinet, /aria-selected=\{selected === index\}/);
  assert.match(cabinet, /aria-controls=\{panelId\(index\)\}/);
  assert.match(cabinet, /tabIndex=\{selected === index \? 0 : -1\}/);
  assert.match(cabinet, /event\.key === "ArrowRight" \|\| event\.key === "ArrowDown"/);
  assert.match(cabinet, /event\.key === "ArrowLeft" \|\| event\.key === "ArrowUp"/);
  assert.match(cabinet, /event\.key === "Home"/);
  assert.match(cabinet, /event\.key === "End"/);
  assert.match(cabinet, /role="tabpanel"/);
  assert.match(cabinet, /aria-hidden=\{selected !== index\}/);
  assert.match(cabinet, /inert=\{selected !== index\}/);
  assert.match(cabinet, /href=\{`#dream-case-\$\{episode\.no\}`\}/);
});

test("lantern changes only the stage atmosphere and remains a pressed-state control", () => {
  assert.match(lantern, /aria-label="舞台の夢灯り"/);
  assert.match(lantern, /aria-pressed=\{lit\}/);
  assert.match(lantern, /stage\.dataset\.dreamLantern = lit \? "lit" : "dim"/);
  assert.match(karakuriCss, /\.dream-hero\[data-dream-lantern="dim"\]\s+\.dream-hero-lamplight/);
  assert.match(lantern, /<button[\s\S]*?aria-pressed=\{lit\}/);
  assert.doesNotMatch(lantern, /<button[^>]*\bhidden\b/);
  assert.match(chapter, /<DreamStageLantern\s*\/>/);
});

test("paper reel exposes previous/next actions and a polite live position", () => {
  assert.match(desk, /const stepReel = \(delta: number\)/);
  assert.match(desk, /aria-live="polite"/);
  assert.match(desk, /aria-atomic="true"/);
  assert.match(desk, /role="status"/);
  assert.match(desk, /aria-label=\{`前の\$\{reelLabel\}を表示`\}/);
  assert.match(desk, /aria-label=\{`次の\$\{reelLabel\}を表示`\}/);
  assert.match(desk, /aria-pressed=\{reelMode === "quotes"\}/);
  assert.match(desk, /aria-pressed=\{reelMode === "notes"\}/);
  assert.match(
    desk,
    /\(current\.quoteIndex \+ delta \+ DREAM_QUOTES\.length\) % DREAM_QUOTES\.length/,
  );
  assert.match(
    desk,
    /\(current\.noteIndex \+ delta \+ DREAM_CASE_NOTES\.length\) % DREAM_CASE_NOTES\.length/,
  );
});

test("new cabinet and reel motion stop for reduced motion and economy settings", () => {
  assert.match(cabinetCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    cabinetCss,
    /\[data-world-effects="economy"\][\s\S]*?\.dream-karakuri-shoji-leaf[\s\S]*?animation:\s*none;/,
  );
  assert.match(
    programmeCss,
    /@media \(prefers-reduced-motion: no-preference\)[\s\S]*?\.dream-programme-reel-sheet\[data-reel-operated="true"\][\s\S]*?animation:\s*dream-programme-paper-feed/,
  );
  assert.match(programmeCss, /not\(\[data-world-effects="economy"\]\)/);
  assert.match(programmeCss, /not\(\[data-world-effects="saver"\]\)/);
  assert.match(
    programmeCss,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.dream-programme-reel \*\s*\{\s*animation:\s*none !important;/,
  );
});

test("Karakuri stylesheet loads after Zenith and before the cinematic skin", () => {
  assert.match(route, /import dreamKarakuriCssUrl from "@\/styles-dream-karakuri\.css\?url"/);
  assert.match(
    route,
    /\{ rel: "stylesheet", href: dreamZenithCssUrl \}[\s\S]*?\{ rel: "stylesheet", href: dreamKarakuriCssUrl \}[\s\S]*?CINEMATIC_STYLESHEET_LINK/,
  );
});

test("口上 keeps its kinari paper under the karakuri frame (its ink is set for paper)", () => {
  const rule = karakuriCss.match(/\.dream-prologue-card \{[^}]*\}/)?.[0] ?? "";
  assert.match(rule, /linear-gradient\(118deg, #f4ecdc, #e8ddc8\)/);
  assert.doesNotMatch(rule, /#241a24|#17111a/);
});
