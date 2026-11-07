import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { QUOTE_SCENES } from "../src/components/gallery-tours/quote-exhibition-data.ts";
import { normalizeTourSearch } from "../src/components/gallery-tours/tour-route-search.ts";
import {
  DREAM_CASE_NOTES,
  DREAM_CHARACTERS,
} from "../src/components/dream-chapter/dream-chapter-data.ts";
import { WORLD_EPISODE_NOTES } from "../src/components/world/world-annex-data.ts";
import { CAST } from "../src/components/final-stage/final-stage-data.ts";

test("every quote opens its original speaker and episode, including a shared scene URL", () => {
  for (const scene of QUOTE_SCENES) {
    assert.deepEqual(normalizeTourSearch({ quote: scene.id }), { quote: scene.id });
    const stem = scene.image.replace(/-delivery(?:-\d+)?\.webp$/, ".jpeg");
    assert.ok(existsSync(new URL(`../public${scene.image}`, import.meta.url)));
    if (scene.to === "/world") {
      const chapter = WORLD_EPISODE_NOTES.find((entry) => `wa-episode-${entry.no}` === scene.hash);
      assert.ok(chapter?.lines.some((line) => line.text === scene.line && line.by === scene.by));
      assert.ok(CAST.some((person) => person.name === scene.by && person.image === stem));
    } else {
      const note = DREAM_CASE_NOTES.find((entry) => `dream-case-note-${entry.no}` === scene.hash);
      assert.equal(note?.line, scene.line);
      assert.equal(note.by, scene.by);
      assert.ok(
        DREAM_CHARACTERS.some((person) => person.name === scene.by && person.portrait === stem),
      );
    }
  }
  assert.deepEqual(normalizeTourSearch({ quote: "__proto__" }), {});
  assert.deepEqual(normalizeTourSearch({ quote: "bell", tour: "starlight" }), {
    tour: "starlight",
  });
});
