import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const worldHome = readFileSync(
  new URL("../src/components/world/world-home.tsx", import.meta.url),
  "utf8",
);
const riderPage = readFileSync(
  new URL("../src/components/world/rider-page.tsx", import.meta.url),
  "utf8",
);
const managerPage = readFileSync(
  new URL("../src/components/world/manager-stub.tsx", import.meta.url),
  "utf8",
);
const thumbnail = new URL(
  "../public/rider-vandal-thumbnail-20260827.jpeg",
  import.meta.url,
);
const dossierImage = new URL(
  "../public/rider-vandal-20260826.jpeg",
  import.meta.url,
);

test("Vandal uses the dedicated thumbnail in the rider index", () => {
  assert.match(
    worldHome,
    /id: "vandal"[^\n]+img: "\/rider-vandal-thumbnail-20260827\.jpeg"/,
  );
  assert.doesNotMatch(worldHome, /id: "vandal"[^\n]+img: "\/rider-vandal-20260826\.jpeg"/);
});

test("Vandal keeps the full visual across both dossiers", () => {
  assert.equal((riderPage.match(/\/rider-vandal-20260826\.jpeg/g) ?? []).length, 2);
  assert.match(
    managerPage,
    /export const REX_LOI:[^]*?rider: \{[^]*?img: "\/rider-vandal-20260826\.jpeg"/,
  );
  assert.doesNotMatch(worldHome, /\/rider-vandaal\.jpeg/);
  assert.doesNotMatch(riderPage, /\/rider-profile-vandal\.jpeg/);
  assert.doesNotMatch(managerPage, /\/manager-rex-loi-rider\.jpeg/);
});

test("the Vandal thumbnail and dossier visual are lightweight local JPEGs", () => {
  for (const image of [thumbnail, dossierImage]) {
    assert.equal(existsSync(image), true);
    const bytes = readFileSync(image);
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
    assert.ok(statSync(image).size < 500_000);
  }
});
