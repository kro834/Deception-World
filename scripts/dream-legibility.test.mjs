import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
const flat = (source) => source.replace(/\s+/g, " ");
const craft = flat(read("styles-dream-karakuri.css"));
const zenith = flat(read("styles-dream-zenith.css"));
const cabinet = flat(read("styles-dream-karakuri-cabinet.css"));
const kinema = flat(read("styles-dream-kinema.css"));

test("paper prologue owns its pale surface and dark ink as one readable palette", () => {
  const surface = craft.match(/\.dream-prologue-card \{([^}]+)\}/)?.[1] ?? "";
  assert.match(surface, /color: #2d2230;/);
  assert.match(surface, /linear-gradient\(118deg, #f4ecdc, #e8ddc8\)/);
  assert.match(craft, /\.dream-prologue-card > p:not\(\.dream-prologue-sign\) \{ color: #2d2230;/);
  assert.match(craft, /\.dream-prologue-card h2 \{ color: #79353c;/);
  // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明）
  // The sign repeated the hero's collaboration line; the card holds only its address.
  assert.doesNotMatch(craft, /\.dream-prologue-card > p\.dream-prologue-sign \{/);
  assert.match(craft, /\.dream-prologue-card::after \{ color: #765627; background: #eee4d1;/);
});

test("open chapter titles and affordances no longer inherit paper-edition ink", () => {
  assert.match(
    craft,
    /\.dream-story-case\[open\] \.dream-story-case-heading > span \{ color: #f4ecdc;/,
  );
  // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明）
  // The reading line and the 其ノ一 / CASE ordinal are gone; the numeral keeps its ink.
  assert.match(craft, /\.dream-story-case\[open\] \.dream-story-case-number \{ color: #dfcaae;/);
  assert.doesNotMatch(craft, /\.dream-story-case-heading > small|\.dream-story-case-number::before/);
});

test("the dark glossary restores the local palette for headings, citations and index folds", () => {
  const tokens = zenith.match(/> #glossary \{([^}]+)\}/)?.[1];
  assert.ok(tokens);
  for (const token of ["--ts-kin", "--ts-kin-light", "--ts-kinari", "--ts-ginnezu"]) {
    assert.ok(tokens.includes(`${token}:`), token);
  }
  assert.match(zenith, /> #glossary > \.dream-annex-heading h2 \{ color: var\(--ts-kin-light\);/);
  assert.match(
    zenith,
    /@media \(forced-colors: active\) \{[^}]*> #glossary > \.dream-annex-heading h2 \{ color: CanvasText; -webkit-text-fill-color: currentColor;/,
  );
});

test("open reading sheets stay fully opaque while the chapter seal retains its own timeline", () => {
  assert.match(
    kinema,
    /\.dream-story-cases > li:has\(> \.dream-story-case\[open\]\) \{ animation-name: none;/,
  );
  assert.match(zenith, /linear-gradient\(180deg, #96322b 0%, #822c26 100%\)/);
});

test("chapter cabinet uses the programme faces and a 16px reading measure", () => {
  assert.doesNotMatch(cabinet, /font-family: "Yu Mincho"/);
  assert.match(
    cabinet,
    /\.dream-karakuri-excerpt \{[^}]*max-width: 43em;[^}]*font-size: 16px;[^}]*font-weight: 500;/,
  );
  // Owner (2026-10-21): kicker darkened from #604b30 to clear 4.5:1 on the aged paper.
  assert.match(cabinet, /\.dream-karakuri-chapter-heading p \{[^}]*color: #574329;/);
});
