// Covered entries into a character file fetch each picture once
// (2026-09-30). The route cover paints the destination as a CSS background
// (load-gate composeScene, --file), which cannot follow a srcset: it asks the
// asset loader for the file the warm-up picked, so the cover, the warm-up and
// the hero share one request. The World's RELATED cards warm only what the
// file shows on arrival (its hero), not a form pickup that loads lazily.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { preloadAssets, warmedSource } from "../src/lib/asset-loader.ts";
import { dossierImage } from "../src/lib/dossier-images.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const loadGate = read("src/components/load-gate.tsx");
const nav = read("src/components/world/dossier-nav.tsx");
const riderPage = read("src/components/world/rider-page.tsx");
const worldHome = read("src/components/world/world-home.tsx");

const navEntries = (list) => {
  const block = nav.slice(nav.indexOf(`export const ${list}`));
  const body = block.slice(0, block.indexOf("\n];"));
  return [...body.matchAll(/href: "([^"]+)",\s*assets: \[\s*"([^"]+)"/g)].map(
    ([, href, first]) => ({
      href,
      first,
    }),
  );
};

test("the cover paints the file the warm-up fetched", () => {
  assert.match(
    loadGate,
    /const file =\s*DETAIL_ROUTE\.test\(to\) && isImageAsset\(assets\[0\]\) \? warmedSource\(assets\[0\]\) : null;/,
  );
  assert.match(loadGate, /import \{ preloadAssets, warmedSource \} from "@\/lib\/asset-loader";/);
  // The cover still carries it as its --file background, at the same place.
  assert.match(
    loadGate,
    /if \(scene\.file\) vars\["--file"\] = `url\(\$\{JSON\.stringify\(scene\.file\)\}\)`;/,
  );
});

test("every rider's cover file is the delivery file its hero shows", () => {
  const riders = navEntries("RIDER_NAV");
  assert.equal(riders.length, 8);
  for (const { href, first } of riders) {
    const id = href.split("/").pop();
    const block = riderPage.slice(riderPage.indexOf(`id: "${id}",`));
    const civilian = block.match(/civilianImg: "([^"]+)"/)[1];
    // The hero's one candidate (rider-page.tsx): the delivery WebP, or
    // James's own WebP on the over-zeztz file.
    const hero =
      id === "over-zeztz" ? "/character-james-20260829.webp" : dossierImage(civilian).srcSet;
    assert.ok(hero && /\.webp$/.test(hero), `${id}: hero ${hero}`);
    assert.equal(warmedSource(first), hero, `${id}: the cover asks for ${hero}`);
    const warm = dossierImage(first).srcSet ?? first;
    assert.equal(warm, hero, `${id}: the warm-up asks for ${hero}`);
  }
});

test("a warm-up that has picked a candidate hands the cover that exact file", async (t) => {
  const originalImage = globalThis.Image;
  t.after(() => {
    if (originalImage) globalThis.Image = originalImage;
    else delete globalThis.Image;
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  globalThis.Image = class {
    naturalWidth = 0;
    srcset = "";
    sizes = "";
    src = "";
    get currentSrc() {
      return this.srcset ? "http://x.test/manager-reemu-720.webp" : this.src;
    }
    async decode() {
      await gate;
      this.naturalWidth = 720;
    }
  };
  const url = "/manager-reemu.jpeg";
  // A width set with nothing picked yet names the URL (no guess).
  assert.equal(warmedSource(url), url);
  const warming = preloadAssets([url], () => undefined);
  await Promise.resolve();
  // While it decodes, the browser's choice is already known.
  assert.equal(warmedSource(url), "http://x.test/manager-reemu-720.webp");
  release();
  await warming;
  assert.equal(warmedSource(url), "http://x.test/manager-reemu-720.webp");
  // Anything that is not a dossier picture is its own file.
  assert.equal(warmedSource("/poster-card-03.jpeg"), "/poster-card-03.jpeg");
});

test("the World's RELATED warm-ups name only the file's hero", () => {
  const related = navEntries("RELATED_NAV");
  assert.deepEqual(
    related.map(({ href }) => href),
    ["/characters/terra", "/characters/luna"],
  );
  for (const { href, first } of related) {
    assert.ok(dossierImage(first).srcSet, `${href}: the hero's candidates`);
  }
  // Cards and EP 02 pickups into テラ / ルナ reuse RELATED_NAV's list; the
  // form pickups (rider-realm-earth / -moon, 710-760 KB) load lazily there.
  for (const id of ["01", "02"]) {
    const uses = worldHome.match(
      new RegExp(`RELATED_NAV\\.find\\(\\(item\\) => item\\.id === "${id}"\\)\\?\\.assets`, "g"),
    );
    assert.equal(uses?.length, 2, `RELATED ${id}: the card and the EP 02 pickup`);
  }
  for (const target of ["/characters/terra", "/characters/luna"]) {
    const links = [...worldHome.matchAll(new RegExp(`to(?:=|: )"${target}"`, "g"))];
    assert.equal(links.length, 2, `${target}: the RELATED card and the EP 02 pickup`);
    for (const link of links) {
      const rest = worldHome.slice(link.index);
      const assets = rest.slice(rest.indexOf("assets"), rest.indexOf("assets") + 160);
      assert.match(assets, /^assets(?:=\{|: )\s*RELATED_NAV\.find/, `${target}: ${assets}`);
      assert.doesNotMatch(assets, /rider-realm-|-thumb/, `${target}: ${assets}`);
    }
  }
});
