import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRealmArchiveMotion } from "./build-realm-archive-motion.mjs";

// The lightbox's closing fade holds its end state (fill: both) while the
// dialog closes. Left in place, that held opacity 0 covered the next
// opening once its own 380ms entrance ended: an empty dark plate.
const master = readFileSync(
  new URL("../archives/saga-form-archive-standalone.html", import.meta.url),
  "utf8",
);
const closeSource = master.slice(
  master.indexOf("  function finalizeLightboxClose("),
  master.indexOf("  lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);"),
);
const openSource = master.match(
  / {6}const inner = lightbox\.querySelector\('\.lightbox-inner'\);[\s\S]*?\], \{ duration: 380, easing: 'cubic-bezier\(\.16,\.82,\.22,1\)' \}\);\n {6}\}/,
)?.[0];

test("the close and open sources exist and Realm's controller is built from them", () => {
  assert.ok(closeSource.includes("async function closeLightbox()"));
  assert.ok(openSource, "the opening animation source exists");
  const realm = createRealmArchiveMotion(master);
  assert.ok(realm.includes(closeSource));
  assert.ok(realm.includes(openSource));
});

test("an opening first cancels whatever is still held on the plate", () => {
  assert.ok(
    openSource.indexOf("getAnimations?.().forEach(animation => animation.cancel())") <
      openSource.indexOf("inner?.animate("),
  );
});

function harness() {
  const held = new Set();
  const inner = {
    animate(_keyframes, options = {}) {
      let settle;
      const animation = {
        fill: options.fill,
        playState: "running",
        finished: new Promise((resolve, reject) => {
          settle = { resolve, reject };
        }),
        finish() {
          animation.playState = "finished";
          if (animation.fill !== "both" && animation.fill !== "forwards") held.delete(animation);
          settle.resolve(animation);
        },
        cancel() {
          if (animation.playState === "running") settle.reject(new Error("AbortError"));
          animation.playState = "idle";
          held.delete(animation);
        },
      };
      animation.finished.catch(() => {});
      held.add(animation);
      return animation;
    },
    getAnimations: () => [...held],
  };
  const classes = new Set();
  const attributes = new Set();
  const lightbox = {
    get open() {
      return attributes.has("open");
    },
    hasAttribute: (name) => attributes.has(name),
    setAttribute: (name) => attributes.add(name),
    removeAttribute: (name) => attributes.delete(name),
    close: () => attributes.delete("open"),
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
    querySelector: (selector) =>
      selector === ".lightbox-inner" ? inner : { removeAttribute() {}, alt: "" },
  };
  const context = vm.createContext({
    lightbox,
    reducedMotion: { matches: false },
    supportsWaapi: true,
    lastLightboxTrigger: { focus() {} },
  });
  vm.runInContext(closeSource, context);
  return {
    context,
    lightbox,
    inner,
    held,
    showModal: () => {
      attributes.add("open");
      // The opening's own first step (see openSource).
      inner.getAnimations().forEach((animation) => animation.cancel());
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("a finished close leaves nothing held on the plate", async () => {
  const ui = harness();
  ui.showModal();
  const closing = ui.context.closeLightbox();
  const [fade] = ui.held;
  assert.equal(fade.fill, "both");
  fade.finish();
  await closing;
  await flush();
  assert.equal(ui.lightbox.open, false);
  assert.equal(ui.lightbox.classList.contains("is-closing"), false);
  assert.equal(ui.held.size, 0, "the fade's end state is released");
});

test("a reset during the fade, then a new opening, keeps that opening open", async () => {
  const ui = harness();
  ui.showModal();
  const closing = ui.context.closeLightbox();
  // A page reset closes the dialog at once; the reader opens it again
  // before the 210ms fade would have ended.
  ui.context.finalizeLightboxClose({ restoreFocus: false });
  ui.showModal();
  await closing;
  await flush();
  assert.equal(ui.lightbox.open, true, "the late fade does not close the new opening");
  assert.equal(ui.held.size, 0);
});
