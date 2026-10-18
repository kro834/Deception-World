import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

// ENTER THE WORLD no longer flies the title into the DW sigil (the camera
// dives through it): both dive tiers aim at the same point of the logo.
test("both dive tiers aim at the logo's ring without distorting the title", () => {
  const handoff = readFileSync(new URL("../src/components/cinematic/opening-handoff.tsx", import.meta.url), "utf8");
  const dive = readFileSync(new URL("../src/components/cinematic/opening-dive.ts", import.meta.url), "utf8");
  const ring = handoff.match(/const RING = \{ x: ([\d.]+), y: ([\d.]+) \};/);
  const diveRing = dive.match(/export const DIVE_RING = \{ x: ([\d.]+), y: ([\d.]+) \} as const;/);
  assert.ok(ring && diveRing);
  assert.deepEqual(ring.slice(1), diveRing.slice(1));
  // The CSS dive scales the logo uniformly about that point (never per axis).
  assert.match(handoff, /logo\.style\.transformOrigin = `\$\{sourceLogoRect\.width \* RING\.x\}px \$\{sourceLogoRect\.height \* RING\.y\}px`/);
  assert.doesNotMatch(handoff, /scale\([\d.]+,\s*[\d.]+\)/);
  assert.doesNotMatch(handoff, /fitLogoRect|rectTransform/);
});

test("EP6 shows the owner's arrival title and intentional error thumbnail without invented pickups", () => {
  const source = readFileSync(new URL("../src/components/world/world-home.tsx", import.meta.url), "utf8");
  const record = source.slice(source.indexOf('no: "06",', source.indexOf("const EPISODES"))).split("\n  },")[0];
  // Owner 2026-10-19: rename EP6 to 来訪 and replace its thumbnail with a deliberate ERROR screen.
  assert.match(record, /title: "来訪"/);
  assert.match(record, /src: "\/episode-06-arrival-error.svg"/);
  assert.doesNotMatch(record, /pickups:/);
  assert.ok(statSync(new URL("../public/episode-06-arrival-error.svg", import.meta.url)).size < 300_000);
  const svg = readFileSync(new URL("../public/episode-06-arrival-error.svg", import.meta.url), "utf8");
  assert.match(svg, />ERROR<\/text>/);
  assert.doesNotMatch(svg, /<script|<animate|<image|href=/);
  assert.ok(readFileSync(new URL("../src/lib/record-art.ts", import.meta.url), "utf8").includes('src: "/episode-06-arrival-error.svg"'));
});
