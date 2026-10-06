import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DREAM_CASES,
  DREAM_STORY_CROSSINGS,
} from "../src/components/dream-chapter/dream-chapter-data.ts";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("six chapter cases retain their titles and distinct substantive summaries", () => {
  assert.deepEqual(
    DREAM_CASES.map(({ no, title }) => `${no}:${title}`),
    ["0:交わる", "1:開く", "2:開ける", "3:明ける", "4:来たる", "5:叛く"],
  );
  for (const record of DREAM_CASES) {
    assert.ok(record.lead.length > 10);
    assert.ok(record.paragraphs.length >= 3);
    for (const paragraph of record.paragraphs) assert.ok(paragraph.length >= 80);
  }
  const paragraphs = DREAM_CASES.flatMap(({ paragraphs }) => paragraphs);
  assert.equal(new Set(paragraphs).size, paragraphs.length);
  assert.match(DREAM_CASES[1].paragraphs.join(""), /最後の心の扉は開きかけたまま残されていた/);
  assert.match(DREAM_CASES[2].paragraphs.join(""), /霊夢に協力を求める/);
  assert.match(DREAM_CASES[2].paragraphs.join(""), /マキャベル.{0,12}融和/);
  const finalCase = DREAM_CASES[5].paragraphs.join("");
  assert.match(finalCase, /二つの世界|二世界/);
  assert.match(finalCase, /ヴァルトマン/);
  assert.match(finalCase, /告白/);
  assert.match(finalCase, /契約/);
  assert.match(finalCase, /サードアイ/);
  assert.match(finalCase, /認知の歪み/);
  assert.match(finalCase, /サヨ/);
  assert.match(finalCase, /怪作奪還|怪作を迎えに行く/);
  assert.match(finalCase, /まだ|準備|これから/);
  assert.doesNotMatch(finalCase, /元の現実(?:へ|に)帰還を果た|救出を完了|死者全員が帰還/);
});

test("the latest revolt scenes remain preparations, not a completed rescue or revival", () => {
  const finalCase = DREAM_CASES[5].paragraphs.join("");
  for (const scene of ["橙", "藍", "小指", "神奈子", "諏訪子", "朝食", "妖夢", "毛布", "狗瓦", "こいし", "指先"]) {
    assert.ok(finalCase.includes(scene), scene);
  }
  assert.match(finalCase, /怪作を迎えに行く出発を前に/);
  assert.match(finalCase, /意識の戻らない狗瓦/);
  assert.match(finalCase, /指先が、誰にも気づかれないほどかすかに動いた/);
  assert.doesNotMatch(finalCase, /花火屋(?:が|は).{0,12}(?:復活|蘇生|生き返)|狗瓦(?:が|は).{0,12}(?:目覚め|意識を取り戻)|奪還(?:に成功|を果た|を完了)/);
});

test("Touhou crossings explain source-specific roles, not invented alliances", () => {
  assert.deepEqual(
    DREAM_STORY_CROSSINGS.map(({ name }) => name),
    ["博麗神社", "守矢神社", "永遠亭"],
  );
  for (const place of DREAM_STORY_CROSSINGS) {
    assert.ok(place.role.length > 0);
    assert.ok(place.body.length >= 60);
  }
  assert.match(DREAM_CASES[2].paragraphs.join(""), /博麗神社で霊夢に協力を求める/);
});

test("case reader uses native details without adding a modal or scroll lock", () => {
  const page = read("src/components/dream-chapter/dream-chapter.tsx");
  const cases = page.slice(
    page.indexOf('id="cases"'),
    page.indexOf('<footer className="dream-footer">'),
  );
  assert.match(
    cases,
    /<details\s+className="dream-story-case"\s+id=\{`dream-case-\$\{episode.no\}`\}/,
  );
  assert.match(cases, /<summary>/);
  assert.match(cases, /aria-describedby="dream-story-scope"/);
  assert.match(cases, /各章のあらすじには、物語の展開・ネタバレを含みます。/);
  assert.doesNotMatch(
    cases,
    /onPointer|onTouch|preventDefault|acquireViewportScrollLock|<img|<dialog/,
  );
  assert.match(cases, /<DreamStoryIndex \/>/);
  assert.match(cases, /<DreamStoryNavigation no=\{episode.no\} \/>/);
  assert.match(cases, /id=\{`dream-case-note-\$\{note.no\}`\}/);
  const css = read("src/styles-dream-story.css");
  assert.match(css, /touch-action: pan-y pinch-zoom/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(
    css,
    /overflow(?:-y)?:\s*(?:hidden|auto|scroll)|backdrop-filter|height:\s*\d+(?:vh|svh)/,
  );
});
