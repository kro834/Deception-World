import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DREAM_CASES,
  DREAM_STORY_CROSSINGS,
} from "../src/components/dream-chapter/dream-chapter-data.ts";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("six midpoint cases retain their titles and distinct substantive summaries", () => {
  assert.deepEqual(
    DREAM_CASES.map(({ no, title }) => `${no}:${title}`),
    ["0:交わる", "1:開く", "2:開ける", "3:明ける", "4:来たる", "5:叛く"],
  );
  for (const record of DREAM_CASES) {
    assert.ok(record.lead.length > 10);
    assert.equal(record.paragraphs.length, 2);
    for (const paragraph of record.paragraphs) assert.ok(paragraph.length >= 80);
  }
  assert.equal(new Set(DREAM_CASES.flatMap(({ paragraphs }) => paragraphs)).size, 12);
  assert.match(DREAM_CASES[1].paragraphs.join(""), /最後の扉はまだ開かれていなかった/);
  assert.match(DREAM_CASES[5].paragraphs.join(""), /怪作も奪われたまま/);
  assert.match(DREAM_CASES[5].paragraphs.join(""), /記録はこの場面まで/);
  assert.match(DREAM_CASES[5].paragraphs.join(""), /まだ明かされていない/);
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
  assert.match(DREAM_CASES[2].paragraphs.join(""), /無条件に仲間となるのではなく/);
});

test("case reader uses native details without adding a modal or scroll lock", () => {
  const page = read("src/components/dream-chapter/dream-chapter.tsx");
  const cases = page.slice(
    page.indexOf('<section id="cases"'),
    page.indexOf('<footer className="dream-footer">'),
  );
  assert.match(cases, /<details className="dream-story-case">/);
  assert.match(cases, /<summary>/);
  assert.match(cases, /aria-describedby="dream-story-scope"/);
  assert.match(cases, /中盤までの内容を含みます/);
  assert.match(cases, /記録途中/);
  assert.doesNotMatch(
    cases,
    /onPointer|onTouch|preventDefault|acquireViewportScrollLock|<img|<dialog/,
  );
  const css = read("src/styles-dream-story.css");
  assert.match(css, /touch-action: pan-y pinch-zoom/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(
    css,
    /overflow(?:-y)?:\s*(?:hidden|auto|scroll)|backdrop-filter|height:\s*\d+(?:vh|svh)/,
  );
});
