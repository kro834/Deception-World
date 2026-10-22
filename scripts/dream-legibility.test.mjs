import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
const flat = (source) => source.replace(/\s+/g, " ");
const craft = flat(read("styles-dream-karakuri.css"));
const zenith = flat(read("styles-dream-zenith.css"));
const cabinet = flat(read("styles-dream-karakuri-cabinet.css"));
const kinema = flat(read("styles-dream-kinema.css"));

test("lacquer prologue owns both its surface and readable ink, including the signature", () => {
  assert.match(craft, /\.dream-prologue-card > p:not\(\.dream-prologue-sign\) \{ color: #f4ecdc;/);
  assert.match(craft, /\.dream-prologue-card h2 \{ color: #edcb96;/);
  assert.match(craft, /\.dream-prologue-card > p\.dream-prologue-sign \{ color: #d7c7b2;/);
});

test("open chapter titles and affordances no longer inherit paper-edition ink", () => {
  assert.match(
    craft,
    /\.dream-story-case\[open\] \.dream-story-case-heading > span \{ color: #f4ecdc;/,
  );
  assert.match(craft, /\.dream-story-case-heading > small\) \{ color: #dfcaae;/);
  assert.match(craft, /\.dream-story-case-number::before \{ color: #edcb96;/);
});

test("the dark glossary restores the local palette for headings, citations and index folds", () => {
  const tokens = zenith.match(/> #glossary \{([^}]+)\}/)?.[1];
  assert.ok(tokens);
  for (const token of ["--ts-kin", "--ts-kin-light", "--ts-kinari", "--ts-ginnezu"]) {
    assert.ok(tokens.includes(`${token}:`), token);
  }
  assert.match(zenith, /> #glossary > \.dream-annex-heading h2 \{ color: var\(--ts-kin-light\);/);
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
  assert.match(cabinet, /\.dream-karakuri-chapter-heading p \{[^}]*color: #604b30;/);
});
