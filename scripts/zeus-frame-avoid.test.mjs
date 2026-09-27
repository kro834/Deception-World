import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* The form archive runs in a sandboxed frame the page cannot read, so the
   floating Zeus button used to rest on its titles and controls. The archive
   reports them (public/archive-zeus-bridge.js) and the button keeps off them
   as it does on the page itself (src/components/zeus-button.tsx). */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const bridge = read("public/archive-zeus-bridge.js");
const zeus = read("src/components/zeus-button.tsx");

test("the archive stays sandboxed and reports through the bridge", () => {
  const route = read("src/routes/form-archive.tsx");
  // The frame is never given the page's origin to make this work.
  assert.match(route, /sandbox="allow-scripts allow-downloads"/);
  assert.doesNotMatch(route, /allow-same-origin/);
  const build = read("scripts/build-embedded-archives.mjs");
  assert.match(
    build,
    /zeusBridgeScript = '<script src="\/archive-zeus-bridge\.js\?v=[\w-]+" defer><\/script>'/,
  );
  for (const kind of ["saga", "realm"]) {
    const html = read(`public/${kind}-form-archive-embedded.html`);
    assert.equal(html.match(/archive-zeus-bridge\.js\?v=[\w-]+/g)?.length, 1, kind);
  }
});

test("the bridge measures what the button avoids, and only in its viewport", () => {
  const list = (source, name) =>
    [
      ...source
        .slice(source.indexOf(name))
        .split(".join")[0]
        .matchAll(/"([^"]+)"|'([^']+)'/g),
    ]
      .map(([, a, b]) => a ?? b)
      .filter((part) => part !== ",");
  const avoid = list(zeus, "const ZEUS_AVOID_TEXT_SELECTOR");
  const words = bridge
    .match(/const WORDS = '([^']+)'/)?.[1]
    .split(",")
    .map((part) => part.trim());
  assert.deepEqual(words, avoid);
  assert.equal(
    bridge.match(/const DISPLAY = "([^"]+)"/)?.[1],
    zeus.match(/const ZEUS_DISPLAY_TEXT_SELECTOR = "([^"]+)"/)?.[1],
  );
  assert.equal(
    bridge.match(/const END = "([^"]+)"/)?.[1],
    zeus.match(/const ZEUS_END_TEXT_SELECTOR = "([^"]+)"/)?.[1],
  );
  assert.match(bridge, /const DISPLAY_MIN_PX = 24;/);
  assert.match(zeus, /const ZEUS_DISPLAY_TEXT_MIN_PX = 24;/);
  // Boxes in the frame's viewport only, capped, sent to the page.
  assert.match(bridge, /inView\(element\.getBoundingClientRect\(\), width, height\)/);
  assert.match(bridge, /const MAX_BOXES = 480;/);
  assert.match(bridge, /type: "deception-world:frame-avoid"/);
  // Once a scroll settles, not on every frame.
  assert.match(bridge, /schedule\("scroll", 90\)/);
  assert.doesNotMatch(bridge, /requestAnimationFrame|setInterval/);
});

test("the page trusts only its own frames and never cancels a press on a report", () => {
  const handler = zeus.slice(
    zeus.indexOf("const onFrameAvoid"),
    zeus.indexOf("const significantResize"),
  );
  assert.match(handler, /data\.type !== FRAME_AVOID_MESSAGE \|\| !event\.source/);
  assert.match(handler, /candidate\.contentWindow === source/);
  assert.match(handler, /if \(!frame\) return;/);
  // A press in progress is left alone; only an archive scroll lets words
  // count again over a spot the reader dropped the button on.
  assert.match(
    handler,
    /if \(activePointer\.current != null\) return;\s*if \(data\.reason === "scroll"\) droppedHere\.current = false;/,
  );
  assert.doesNotMatch(handler, /cancelPointer/);
  // Reported boxes are validated and capped before use.
  assert.match(zeus, /const FRAME_AVOID_MAX = 480;/);
  assert.match(zeus, /typeof n === "number" && Number\.isFinite\(n\)/);
  // Placed through the frame's box and cut to it; a frame that left is dropped.
  assert.match(zeus, /Math\.max\(clip\.left, box\.left \+ left\)/);
  assert.match(zeus, /frameAvoid\.delete\(source\)/);
  // Words join the page's words; fixed controls join its controls.
  assert.match(zeus, /readFrameAvoid\(\(entry\) => entry\.words\)/);
  assert.match(zeus, /readFrameAvoid\(\(entry\) => entry\.controls\)/);
  assert.match(zeus, /window\.removeEventListener\("message", onFrameAvoid\)/);
});
