import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DREAM_ARSENAL,
  DREAM_ATLAS,
  DREAM_CHRONICLE,
  DREAM_RELATIONS,
} from "../src/components/dream-chapter/dream-chapter-extra-data.ts";
import {
  atlasChronicleCases,
  relatedArsenalGroups,
} from "../src/components/dream-chapter/dream-archive-navigation.ts";

const component = readFileSync(
  new URL("../src/components/dream-chapter/dream-chapter-extra.tsx", import.meta.url),
  "utf8",
);

test("atlas chapter links use only a precise canonical place match", () => {
  assert.deepEqual(atlasChronicleCases(DREAM_CHRONICLE, "博麗神社"), ["2", "3", "4"]);
  assert.deepEqual(atlasChronicleCases(DREAM_CHRONICLE, "迷いの竹林・永遠亭"), []);
  for (const place of DREAM_ATLAS) {
    const chapters = atlasChronicleCases(DREAM_CHRONICLE, place.name);
    assert.equal(new Set(chapters).size, chapters.length, place.name);
    for (const no of chapters) {
      assert.ok(
        DREAM_CHRONICLE.some((event) => event.place === place.name && event.case === no),
        `${place.name} CASE ${no}`,
      );
    }
  }
});

test("relation-to-arsenal links require an explicit group or owner", () => {
  assert.deepEqual(relatedArsenalGroups(DREAM_ARSENAL, ["シエル", "東風谷慶弥"]), [
    { group: "シエル / 仮面ライダーサーガ", index: 1 },
    { group: "東風谷慶弥", index: 2 },
  ]);
  assert.deepEqual(relatedArsenalGroups(DREAM_ARSENAL, ["ベル"]), []);
  for (const tie of DREAM_RELATIONS) {
    for (const link of relatedArsenalGroups(DREAM_ARSENAL, [tie.a, tie.b])) {
      assert.equal(DREAM_ARSENAL[link.index - 1].group, link.group);
    }
  }
});

test("each archive explorer keeps its native target, filter and recovery control", () => {
  assert.match(component, /<article\s+id=\{`dream-atlas-\$\{index \+ 1\}`\}/);
  assert.match(component, /id=\{`dream-relations-circle-\$\{index \+ 1\}`\}/);
  assert.match(component, /id=\{`dream-arsenal-group-\$\{groupIndex \+ 1\}`\}/);
  assert.match(component, /<select\s+id="dream-relations-person"/);
  assert.match(component, /<input\s+id="dream-arsenal-search"\s+type="search"/);
  assert.match(component, /検索を解除して全件を見る/);
  assert.doesNotMatch(component, /hashchange|scrollIntoView|preventDefault\(/);
});
