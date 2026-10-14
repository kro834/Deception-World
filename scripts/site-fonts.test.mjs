import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SITE_CORE_FONTS_URL, SITE_DISPLAY_FONTS_URL, siteFontLinks } from "../src/lib/site-fonts.ts";

test("opening loads its real fonts without the unused display-family stylesheet", () => {
  assert.deepEqual(siteFontLinks(true), [{ rel: "stylesheet", href: SITE_CORE_FONTS_URL }]);
  const families = new URL(SITE_CORE_FONTS_URL).searchParams.getAll("family");
  assert.deepEqual(families, ["Cinzel:wght@400..700", "Noto Sans JP:wght@400..600", "Oxanium:wght@400..700"]);
  assert.equal(new URL(SITE_CORE_FONTS_URL).searchParams.get("display"), "swap");
});

test("every non-opening route retains the complete display family and shares the core URL", () => {
  assert.deepEqual(siteFontLinks(false), [
    ...siteFontLinks(true),
    { rel: "stylesheet", href: SITE_DISPLAY_FONTS_URL },
  ]);
  assert.equal(new URL(SITE_DISPLAY_FONTS_URL).searchParams.get("family"), "Zen Kaku Gothic New:wght@500;600;700");
  assert.equal(new URL(SITE_DISPLAY_FONTS_URL).searchParams.get("display"), "swap");
  const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
  assert.match(root, /siteFontLinks\(matches\.some\(\(match\) => \(match\.routeId as string\) === "\/"\)\)/);
});
