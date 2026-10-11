import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/components/world/world-home.tsx", import.meta.url),
  "utf8",
);
const body = source.match(/const syncActiveSection = \(\) => \{([\s\S]*?)\n {4}\};/)?.[1];
assert.ok(body, "exercise the actual World nav sync rather than a copy of the selection algorithm");
const makeSync = new Function(
  "sections",
  "window",
  "getComputedStyle",
  "setActiveSection",
  "lastActiveRef",
  "topbar",
  "shell",
  `let frame = 0; let previousTopbarHeight = 0; return () => {
    ${body.replace(/: WorldSectionId \| null/g, "").replace(/ as WorldSectionId/g, "")}
  };`,
);

test("World reads each section once per scroll tick, retaining every chapter and end boundary", () => {
  const ids = ["story", "riders", "records"];
  const rects = ids.map(() => ({ top: 0, bottom: 1000 }));
  const margins = [96, 96, 96];
  const reads = [0, 0, 0];
  let styles = 0;
  const sections = ids.map((id, index) => ({
    id,
    getBoundingClientRect() {
      reads[index]++;
      return { ...rects[index] };
    },
  }));
  const viewport = { innerHeight: 390 };
  const reported = [];
  const lastActiveRef = { current: undefined };
  const headerWrites = [];
  const topbar = { offsetHeight: 96 };
  const shell = { style: { setProperty: (...args) => headerWrites.push(args) } };
  const sync = makeSync(
    sections,
    viewport,
    (section) => {
      styles++;
      return { scrollMarginTop: String(margins[ids.indexOf(section.id)]) };
    },
    (value) => reported.push(value),
    lastActiveRef,
    topbar,
    shell,
  );
  const sample = (tops, bottom, expected) => {
    tops.forEach((top, index) => {
      rects[index].top = top;
    });
    rects[2].bottom = bottom;
    const before = [...reads];
    const beforeStyles = styles;
    sync();
    assert.equal(lastActiveRef.current, expected);
    assert.deepEqual(
      reads.map((count, index) => count - before[index]),
      [1, 1, 1],
    );
    assert.equal(
      styles - beforeStyles,
      3,
      "late styles remain live, not cached from an old viewport",
    );
  };
  sample([200, 1200, 2200], 3200, null);
  sample([96, 1200, 2200], 3200, "story");
  sample([-1000, 96, 1200], 2200, "riders");
  sample([-2000, -1000, 96], 1096, "records");
  sample([-3000, -2000, -1000], 92, null);

  // Desktop marker and later-applied hash margins are evaluated on that tick.
  viewport.innerHeight = 900;
  sample([-1000, 198, 1200], 2200, "riders");
  viewport.innerHeight = 390;
  margins[2] = 180;
  sample([-2000, -1000, 180], 1180, "records");
  const count = reported.length;
  sample([-2000, -1000, 180], 1180, "records");
  assert.equal(reported.length, count, "unchanged selection still avoids React updates");
  assert.deepEqual(headerWrites, [["--film-topbar-height", "96px"]]);
  topbar.offsetHeight = 110;
  sync();
  assert.deepEqual(headerWrites.at(-1), ["--film-topbar-height", "110px"]);
});
