import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const dossierNav = readFileSync(
  new URL("../src/components/world/dossier-nav.tsx", import.meta.url),
  "utf8",
);
const riderPage = readFileSync(
  new URL("../src/components/world/rider-page.tsx", import.meta.url),
  "utf8",
);
const worldHome = readFileSync(
  new URL("../src/components/world/world-home.tsx", import.meta.url),
  "utf8",
);

const replacements = [
  {
    id: "saga",
    path: "/civilian-yuma-20260826.jpeg",
    file: new URL("../public/civilian-yuma-20260826.jpeg", import.meta.url),
  },
  {
    id: "realm",
    path: "/civilian-bell-20260826.jpeg",
    file: new URL("../public/civilian-bell-20260826.jpeg", import.meta.url),
  },
];

test("Yuma and Bell use the supplied visuals in dossiers and route preloads", () => {
  for (const replacement of replacements) {
    assert.match(
      dossierNav,
      new RegExp(`id: "${replacement.id}"[^\\n]+assets: \\["${replacement.path.replaceAll("/", "\\/").replace(".", "\\.")}"\\]`),
    );
    assert.match(riderPage, new RegExp(`civilianImg: "${replacement.path.replaceAll("/", "\\/").replace(".", "\\.")}"`));
  }
  assert.doesNotMatch(riderPage, /civilian-(?:saga|realm)\.jpeg/);
  assert.doesNotMatch(worldHome, /civilian-realm\.jpeg/);
});

test("the replacement character images are lightweight local JPEGs", () => {
  for (const replacement of replacements) {
    assert.equal(existsSync(replacement.file), true);
    const bytes = readFileSync(replacement.file);
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
    assert.ok(statSync(replacement.file).size < 500_000);
  }
});
