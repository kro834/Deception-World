import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("independent exhibition readiness stays false until the owning route has committed", () => {
  const source = read("src/lib/use-exhibition-artwork-ready.ts")
    .replace(/^import .*;\n/gmu, "")
    .replace("export function", "function");
  let state;
  const effects = [];
  const hook = runInNewContext(`${source}\nuseExhibitionArtworkReady`, {
    useState(initial) {
      if (state === undefined) state = initial;
      return [
        state,
        (value) => {
          state = value;
        },
      ];
    },
    useEffect(callback, dependencies) {
      assert.equal(dependencies.length, 0);
      effects.push(callback);
    },
  });
  assert.equal(hook(), false, "SSR and initial client render cannot expose a portal target");
  assert.equal(state, false, "render alone must not enable the portal");
  effects[0]();
  assert.equal(hook(), true, "a committed owner can expose its artwork target");
});

test("normal artwork pages no longer register retired Ultra portal readiness", () => {
  for (const path of [
    "src/components/world/world-home.tsx",
    "src/components/gallery/gallery-page.tsx",
    "src/components/dream-chapter/dream-chapter.tsx",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /useUltraArtworkReady|data-ultra-artwork-ready/);
  }
  const route = read("src/routes/exhibition.tsx");
  assert.match(route, /const ready = useExhibitionArtworkReady\(\)/);
  assert.match(route, /artworkReady=\{ready\}/);
  assert.doesNotMatch(route, /useUltraArtworkReady|ultra-mode|ultra-quality/);
});
