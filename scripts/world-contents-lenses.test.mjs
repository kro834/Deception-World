import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const special = read("src/components/world/world-special.tsx");
const ring = read("src/styles-ring-world.css");
const zeus = read("src/components/zeus-button.tsx");

const chapters = () => {
  const block = special.slice(
    special.indexOf("const CHAPTERS: readonly Chapter[] = ["),
    special.indexOf("];", special.indexOf("const CHAPTERS")),
  );
  return [...block.matchAll(/\{\s*href: "([^"]+)",\s*no: "(\d\d)",[^}]*?\}/g)].map((m) => ({
    href: m[1],
    no: m[2],
    image: m[0].match(/image: "([^"]+)"/)?.[1],
  }));
};

test("every chapter on the 目次 ring has a picture that ships, none repeated", () => {
  const list = chapters();
  assert.deepEqual(
    list.map((chapter) => chapter.no),
    ["01", "02", "03", "04", "05", "06"],
  );
  for (const { no, image } of list) {
    assert.ok(image, `${no} has a picture (a bare numeral read as an image that failed)`);
    assert.ok(existsSync(new URL(`../public${image}`, import.meta.url)), `${no}: public${image}`);
  }
  assert.equal(new Set(list.map((chapter) => chapter.image)).size, list.length);
  // 04-06 pictures come from their own chapters (the roster, the brief's
  // stage stills, the records' key art), never generated for the map.
  const byNo = Object.fromEntries(list.map((chapter) => [chapter.no, chapter.image]));
  assert.equal(byNo["04"], "/civilian-argenome-delivery-360.webp");
  assert.equal(byNo["05"], "/episode-02-legends-delivery-600.webp");
  assert.equal(byNo["06"], "/episode-04-kill-delivery-600.webp");
  assert.match(read("src/components/world/world-annex.tsx"), /civilian\("\/civilian-argenome\.jpeg"/);
  assert.match(read("src/components/world/world-brief-art.tsx"), /"\/episode-02-legends\.jpeg"/);
  assert.match(read("src/components/world/world-annex.tsx"), /"04": \{ src: "\/episode-04-kill\.jpeg"/);
});

test("a lens with a picture keeps 01-03's treatment: the image and the small numeral node", () => {
  assert.match(
    special,
    /<li key=\{href\} data-phase=\{phase\} data-art=\{image \? "" : undefined\}>/,
  );
  assert.match(
    special,
    /\{image && <img src=\{image\} alt="" loading="lazy" decoding="async" \/>\}/,
  );
  // The big centred numeral and its label offset are for a lens without art only.
  const annexRules = [...ring.matchAll(/> li\[data-phase="annex"\](\S*)\n\s*\.ws-map-label/g)];
  assert.equal(annexRules.length, 4);
  for (const rule of annexRules) assert.equal(rule[1], ":not([data-art])");
});

test("MOVE steps off the 目次 lenses", () => {
  const avoid = zeus.slice(zeus.indexOf("const ZEUS_AVOID_SELECTOR"), zeus.indexOf('].join(",")'));
  assert.ok(avoid.includes('".ws-map > li > a"'));
});
