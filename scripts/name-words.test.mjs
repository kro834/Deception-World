import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { nameWords, withWordBreaks } from "../src/lib/name-break-rules.js";

test("Saga and form suffixes have separate intact words without altering spelling", () => {
  for (const value of [
    "エクスプリームサーガ・ウルトラ",
    "仮面ライダーレクソナンスサーガ・マックス",
    "レクソナンスサーガ ウルトラ",
  ]) {
    const words = nameWords(value);
    assert.equal(words.map((word) => word.text).join(""), value);
    assert.equal(withWordBreaks(value).replaceAll("\u200b", ""), value);
    assert.ok(words.some((word) => /^サーガ[・ ]?$/.test(word.text) && word.protected));
    assert.ok(words.at(-1).protected);
  }
});

test("long words keep an emergency wrap; short named words remain protected", () => {
  const words = nameWords("エクスプリームサーガ・ウルトラ");
  assert.deepEqual(words, [
    { text: "エクスプリーム", protected: false },
    { text: "サーガ・", protected: true },
    { text: "ウルトラ", protected: true },
  ]);
  assert.deepEqual(nameWords("サイファー・ブラックサイト"), [
    { text: "サイファー・", protected: false },
    { text: "ブラックサイト", protected: false },
  ]);
  assert.equal(nameWords("仮面ライダーヴァンダール")[0].protected, false);
});

test("name protection is scoped; shared assets do not resize fonts or comparison rows", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const css = read("src/styles-name-words.css");
  assert.match(css, /\.name-word--protected\s*\{[^}]*white-space: nowrap;/);
  assert.match(css, /\.name-word\s*\{[^}]*overflow-wrap: anywhere;/);
  assert.doesNotMatch(css, /font-size|(?:min-|max-)?(?:height|width):/);
  assert.match(css, /font: inherit !important;/);
  const archive = read("src/lib/archive-name-words.js");
  assert.match(archive, /from "\.\/name-break-rules\.js"/);
  assert.doesNotMatch(archive, /MutationObserver|setInterval|addEventListener\("scroll"|innerHTML/);
  assert.match(read("scripts/build-embedded-archives.mjs"), /archive-name-words\.js/);
});
