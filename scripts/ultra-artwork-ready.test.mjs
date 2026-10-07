import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("artwork readiness stays false until the owning route has committed", () => {
  const source = read("src/lib/use-ultra-artwork-ready.ts")
    .replace(/^import .*;\n/gmu, "")
    .replace("export function", "function");
  let state;
  const effects = [];
  const hook = runInNewContext(`${source}\nuseUltraArtworkReady`, {
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

test("all three artwork owners keep the marker absent from server HTML", () => {
  for (const [path, host] of [
    ["src/components/world/world-home.tsx", "poster-frame"],
    ["src/components/gallery/gallery-page.tsx", "gallery-feature-open"],
    ["src/components/dream-chapter/dream-chapter.tsx", "dream-poster-current"],
  ]) {
    const source = read(path);
    assert.match(source, /const artworkReady = useUltraArtworkReady\(\)/);
    assert.match(
      source,
      new RegExp(
        `className="${host}"\\s+data-ultra-artwork-ready=\\{artworkReady \\? "true" : undefined\\}`,
      ),
    );
  }
  const target = read("src/lib/ultra-artwork-target.js");
  assert.match(target, /data-ultra-artwork-ready/);
  assert.match(target, /attributeFilter:[\s\S]*?data-ultra-artwork-ready/);
});
