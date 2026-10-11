import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

const read = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const flat = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const [duel, impact, world, finalStage] = await Promise.all(
  [
    "src/styles-extreme-fightcard.css",
    "src/styles-extreme-impact.css",
    "src/styles-stage-world.css",
    "src/styles-stage-final-stage.css",
  ].map(async (path) => flat(await read(path))),
);

const rule = (css, ending) => {
  const match = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
    ([, selector, body]) => selector.trim().endsWith(ending) && body.includes("--"),
  );
  assert.ok(match, `missing ${ending}`);
  return match[2];
};

test("rx14 #6 bounds every Extreme form layer to the delivered portrait pixels", async () => {
  const canvas = rule(duel, "#exs-stage-panel > figure");
  assert.match(canvas, /width: min\(100%, calc\(1022px \/ var\(--exf-art-density\)\)\);/);
  assert.match(canvas, /max-height: calc\(1538px \/ var\(--exf-art-density\)\);/);
  assert.match(canvas, /justify-self: center;/);
  assert.match(canvas, /align-self: center;/);
  assert.match(
    duel,
    /#exs-stage-panel > figure > img \{[^}]*object-fit: contain;[^}]*transform: none;[^}]*scale: none;/,
  );
  assert.match(
    duel,
    /> \.exf-rival > span \{[^}]*background: var\(--ext-ink\) 50% 0 \/ contain no-repeat;/,
  );
  for (const [file, width] of [
    ["saga-extreme-middle-20261006.webp", 1023],
    ["saga-extreme-ultra-20261006.jpeg", 1022],
  ]) {
    const metadata = await sharp(new URL(`../public/${file}`, import.meta.url).pathname).metadata();
    assert.deepEqual([metadata.width, metadata.height], [width, 1538]);
    assert.ok(impact.includes(`url("/${file}") 50% 0 / contain no-repeat`));
  }
});

test("rx14 #6 keeps the World print contained with no extra scale or scroll settle", async () => {
  const metadata = await sharp(
    new URL("../public/deception-world-poster-delivery.webp", import.meta.url).pathname,
  ).metadata();
  assert.deepEqual([metadata.width, metadata.height], [1024, 1536]);
  assert.match(
    world,
    /\.finale-backdrop \{[^}]*inset: calc\(var\(--film-topbar-height, 76px\) \+ 18px\) var\(--sw-gutter\) 28px;[^}]*grid-template: minmax\(0, 1fr\) \/ minmax\(0, 1fr\);[^}]*place-items: center;/,
  );
  const poster = rule(world, ".finale-backdrop img");
  assert.match(poster, /width: min\(100%, calc\(1024px \/ var\(--sw-poster-density\)\)\);/);
  assert.match(poster, /height: min\(100%, calc\(1536px \/ var\(--sw-poster-density\)\)\);/);
  for (const declaration of [
    "object-fit: contain;",
    "transform: none;",
    "scale: none;",
    "animation: none;",
    "will-change: auto;",
  ]) {
    assert.ok(poster.includes(declaration), declaration);
  }
});

test("rx14 #6 keeps physical pixels bounded on the audited desktop and retina viewports", () => {
  for (const [css, token] of [
    [duel, "--exf-art-density"],
    [world, "--sw-poster-density"],
  ]) {
    for (const density of [2, 3, 4]) {
      const media = css.match(
        new RegExp(`@media \\(resolution > ${density - 1}dppx\\) \\{[^{}]*\\{([^{}]*)\\}`),
      );
      assert.ok(media, `missing density ${density}`);
      assert.ok(media[1].includes(`${token}: ${density};`));
    }
  }
  // Contain uses the smaller axis; the former cover used the larger one.
  for (const [naturalWidth, naturalHeight] of [
    [1022, 1538],
    [1024, 1536],
  ]) {
    for (const [viewportWidth, viewportHeight] of [
      [1440, 900],
      [1024, 1366],
      [390, 844],
      [2560, 1440],
    ]) {
      for (const dpr of [1, 1.25, 1.5, 2, 2.5, 3, 4]) {
        const density = Math.ceil(dpr);
        const boxWidth = Math.min(viewportWidth, naturalWidth / density);
        const boxHeight = Math.min(viewportHeight, naturalHeight / density);
        const physicalScale = Math.min(boxWidth / naturalWidth, boxHeight / naturalHeight) * dpr;
        assert.ok(
          physicalScale <= 1,
          `${viewportWidth}×${viewportHeight} @${dpr}: ${physicalScale}`,
        );
      }
    }
  }
});

test("rx14 #14 aligns the Final Stage end-card dash to its centred title", () => {
  assert.match(finalStage, /> \.fst-footer h2::after \{ margin-inline: auto; \}/);
});
