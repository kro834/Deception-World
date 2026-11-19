import assert from "node:assert/strict";
import test from "node:test";
import { parseDogArchiveSearch, DOG_ARCHIVE_ENTRIES } from "../src/lib/dogs-archive/entries.ts";
import { guardDogsArchiveNavigation } from "../src/lib/dogs-archive/touch-guard.ts";

class Surface extends EventTarget {
  registrations = [];
  innerWidth = 390;
  addEventListener(type, fn, options) {
    this.registrations.push({ type, fn, options });
    super.addEventListener(type, fn, typeof options === "boolean" ? { capture: options } : options);
  }
  removeEventListener(type, fn, options) {
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
    this.registrations = this.registrations.filter(
      (entry) =>
        entry.type !== type ||
        entry.fn !== fn ||
        (typeof entry.options === "boolean" ? entry.options : Boolean(entry.options?.capture)) !==
          capture,
    );
    super.removeEventListener(type, fn, { capture });
  }
}
function fixture(width = 390) {
  const doc = new Surface();
  doc.defaultView = new Surface();
  doc.defaultView.innerWidth = width;
  doc.documentElement = { clientWidth: width };
  return { doc, release: guardDogsArchiveNavigation(doc) };
}
const touch = (identifier, clientX) => ({ identifier, clientX });
function send(target, type, values = {}, cancelable = true) {
  const event = new Event(type, { cancelable });
  for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}
const stroke = (doc, type, touches, cancelable) => send(doc, type, { touches }, cancelable);

test("all five individuals have stable deep links; absent or malformed searches open the fifth", () => {
  assert.deepEqual(
    DOG_ARCHIVE_ENTRIES.map(({ id }) => id),
    [1, 2, 3, 4, 5],
  );
  for (let dog = 1; dog <= 5; dog++) {
    assert.deepEqual(parseDogArchiveSearch({ dog }), { dog });
    assert.deepEqual(parseDogArchiveSearch({ dog: String(dog) }), { dog });
  }
  for (const dog of [
    undefined,
    null,
    0,
    6,
    -1,
    1.5,
    Infinity,
    NaN,
    "",
    "05",
    "1.5",
    "1x",
    [2],
    {},
    true,
  ]) {
    assert.deepEqual(parseDogArchiveSearch({ dog, unrelated: 1 }), { dog: 5 });
  }
  assert.deepEqual(parseDogArchiveSearch({}), { dog: 5 });
});

test("published records map the five numbers to the supplied identities", () => {
  assert.deepEqual(
    DOG_ARCHIVE_ENTRIES.map(({ id, name, human }) => [id, name, human?.name]),
    [
      [1, "アルケオン", undefined],
      [2, "ヴァルグ", undefined],
      [3, "アガサ", "かつての六詠"],
      [4, "エウレル", "ゼウス"],
      [5, "シエル", "月城悠真"],
    ],
  );
});

test("only records with human artwork accept a direct human-form link", () => {
  for (const dog of [3, 4, 5]) {
    assert.deepEqual(parseDogArchiveSearch({ dog: String(dog), form: "human" }), {
      dog,
      form: "human",
    });
    assert.deepEqual(parseDogArchiveSearch({ dog, form: "unknown" }), { dog });
  }
  for (const dog of [1, 2]) {
    assert.deepEqual(parseDogArchiveSearch({ dog, form: "human" }), { dog });
  }
});

test("edge cancellation is installed before input with non-passive capture listeners", () => {
  const { doc, release } = fixture();
  for (const type of ["touchstart", "touchmove", "wheel"]) {
    assert.deepEqual(doc.registrations.find((entry) => entry.type === type).options, {
      passive: false,
      capture: true,
    });
  }
  assert.equal(
    doc.registrations.some(({ type }) => type === "popstate"),
    false,
  );
  assert.equal(
    doc.defaultView.registrations.some(({ type }) => type === "popstate"),
    false,
  );
  release();
  release();
  assert.equal(doc.registrations.length, 0);
  assert.equal(doc.defaultView.registrations.length, 0);
});

test("both edge starts cancel on the first sample; centre touches and pinch remain available", () => {
  for (const width of [320, 390, 834, 1194]) {
    const { doc, release } = fixture(width);
    for (const x of [0, 32, width - 32, width - 1]) {
      assert.equal(stroke(doc, "touchstart", [touch(7, x)]), true, `${width}:${x}`);
      assert.equal(stroke(doc, "touchmove", [touch(7, width / 2)]), true);
    }
    for (const x of [33, width / 2, width - 33]) {
      assert.equal(stroke(doc, "touchstart", [touch(7, x)]), false);
      assert.equal(stroke(doc, "touchmove", [touch(7, 1)]), false);
    }
    assert.equal(stroke(doc, "touchstart", [touch(1, 1), touch(2, 80)]), false);
    assert.equal(stroke(doc, "touchmove", [touch(1, 1)]), false);
    release();
  }
});

test("foreign identifiers, interruption and pagehide release the original gesture", () => {
  const { doc, release } = fixture();
  for (const type of ["touchend", "touchcancel"]) {
    stroke(doc, "touchstart", [touch(1, 2)]);
    stroke(doc, type, []);
    assert.equal(stroke(doc, "touchmove", [touch(1, 2)]), false);
  }
  for (const touches of [[touch(2, 2)], [touch(1, 2), touch(2, 90)]]) {
    stroke(doc, "touchstart", [touch(1, 2)]);
    assert.equal(stroke(doc, "touchmove", touches), false);
    assert.equal(stroke(doc, "touchmove", [touch(1, 2)]), false);
  }
  stroke(doc, "touchstart", [touch(1, 2)]);
  send(doc.defaultView, "pagehide");
  assert.equal(stroke(doc, "touchmove", [touch(1, 2)]), false);
  assert.equal(stroke(doc, "touchstart", [touch(1, NaN)]), false);
  release();
  assert.equal(stroke(doc, "touchstart", [touch(1, 2)]), false);
});

test("horizontal trackpad gestures are guarded without taking vertical scroll or control-pinch", () => {
  const { doc, release } = fixture();
  assert.equal(send(doc, "wheel", { deltaX: 20, deltaY: 1, ctrlKey: false }), true);
  assert.equal(send(doc, "wheel", { deltaX: -20, deltaY: 0, ctrlKey: false }), true);
  assert.equal(send(doc, "wheel", { deltaX: 2, deltaY: 20, ctrlKey: false }), false);
  assert.equal(send(doc, "wheel", { deltaX: 20, deltaY: 0, ctrlKey: true }), false);
  assert.equal(send(doc, "wheel", { deltaX: 20, deltaY: 0, ctrlKey: false }, false), false);
  release();
  assert.equal(send(doc, "wheel", { deltaX: 20, deltaY: 0, ctrlKey: false }), false);
});

test("cancelling touch defaults preserves pointer input, propagation and non-cancelable events", () => {
  const { doc, release } = fixture();
  let pointer = 0,
    observed = 0;
  doc.addEventListener("pointermove", () => pointer++);
  doc.addEventListener("touchstart", () => observed++);
  assert.equal(stroke(doc, "touchstart", [touch(1, 2)], false), false);
  assert.equal(stroke(doc, "touchmove", [touch(1, 2)], false), false);
  doc.dispatchEvent(new Event("pointermove"));
  assert.deepEqual([pointer, observed], [1, 1]);
  release();
});

// Owner (2026-11-20): 「サイトも大きく改善します」 — arriving on the page no longer
// pulls the fifth dog's model (over 6 MB with its decoder and scene): its
// still stands until the visitor touches the stage or chooses here.
test("the model waits for the visitor; names are 12px; the phone's controls are one row", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  const viewer = read("components/dogs-archive/dog-viewer.tsx");
  assert.match(viewer, /const wanted = eager \|\| touched;/);
  assert.match(viewer, /if \(!active \|\| !wanted \|\| !host\.current\) return;/);
  assert.match(viewer, /onPointerDown=\{wanted \? undefined : \(\) => setTouched\(true\)\}/);
  assert.match(viewer, /status === "idle" \? null : \(\s*<span>立体模型を読み込み中<\/span>/);
  // The scene's code stays behind its dynamic import, inside the gated effect.
  assert.doesNotMatch(viewer, /^import (?!type)[^;]*dogs-archive\/scene/m);
  const route = read("routes/dogs-archive.tsx");
  assert.match(route, /const \[eager, setEager\] = useState\(false\);/);
  assert.match(route, /<DogViewer active eager=\{eager\} \/>/);
  const sheet = read("styles-dogs-archive.css");
  assert.doesNotMatch(sheet, /font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px/);
  assert.match(sheet, /min-height: calc\(var\(--sh-bar-h, 76px\) \+ env\(safe-area-inset-top, 0px\)\);/);
  const stage = read("styles-dogs-viewer.css");
  const phone = stage.slice(stage.indexOf("@media (max-width: 560px) {\n  .dogs-viewer {"));
  assert.match(phone, /\.dogs-viewer__toolbar \{[^}]*width: max-content;[^}]*flex-wrap: nowrap;/);
});
