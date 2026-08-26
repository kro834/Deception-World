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
const image = new URL("../public/rider-vandal-20260826.jpeg", import.meta.url);

test("Vandal uses the supplied visual across its index and both dossiers", () => {
  assert.match(worldHome, /id: "vandal"[^\n]+img: "\/rider-vandal-20260826\.jpeg"/);
  assert.equal((riderPage.match(/\/rider-vandal-20260826\.jpeg/g) ?? []).length, 2);
  assert.match(
    managerPage,
    /export const REX_LOI:[^]*?rider: \{[^]*?img: "\/rider-vandal-20260826\.jpeg"/,
  );
  assert.doesNotMatch(worldHome, /\/rider-vandaal\.jpeg/);
  assert.doesNotMatch(riderPage, /\/rider-profile-vandal\.jpeg/);
  assert.doesNotMatch(managerPage, /\/manager-rex-loi-rider\.jpeg/);
});

test("the replacement Vandal image is a lightweight local JPEG", () => {
  assert.equal(existsSync(image), true);
  const bytes = readFileSync(image);
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  assert.ok(statSync(image).size < 500_000);
});
