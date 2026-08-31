import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("the Over Zeztz rider thumbnail stays distinct from James civilian artwork", () => {
  const dossierNav = readSource("src/components/world/dossier-nav.tsx");
  const riderPage = readSource("src/components/world/rider-page.tsx");
  const worldHome = readSource("src/components/world/world-home.tsx");

  assert.match(
    dossierNav,
    /id: "over-zeztz"[\s\S]{0,300}?assets: \["\/character-james-20260829\.webp"\]/,
  );
  assert.match(
    worldHome,
    /id: "over-zeztz"[\s\S]{0,900}?img: "\/rider-over-zeztz-thumbnail-20260829\.jpg"/,
  );
  assert.match(
    riderPage,
    /id: "over-zeztz"[\s\S]{0,1600}?civilianImg: "\/character-james-20260829\.jpg"/,
  );

  const riderThumbnail = new URL(
    "../public/rider-over-zeztz-thumbnail-20260829.jpg",
    import.meta.url,
  );
  assert.ok(existsSync(riderThumbnail));
  assert.ok(statSync(riderThumbnail).size > 100_000);
  assert.deepEqual([...readFileSync(riderThumbnail).subarray(0, 2)], [0xff, 0xd8]);
});
