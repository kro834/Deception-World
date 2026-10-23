import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Script, createContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { DREAM_CASES } from "../src/components/dream-chapter/dream-chapter-data.ts";
import {
  DREAM_READER_STORAGE_KEY,
  mountDreamReader,
  validateDreamReaderState,
} from "../src/lib/dream-reader-state.js";

const require = createRequire(import.meta.url);
const source = (name) =>
  readFileSync(new URL(`../src/components/dream-chapter/${name}`, import.meta.url), "utf8");

function loadRoom(localStorage) {
  const js = ts.transpileModule(source("dream-reading-room.tsx"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  const context = createContext({
    exports,
    localStorage,
    require(specifier) {
      if (specifier === "@tanstack/react-router") return { useRouter: () => ({}) };
      if (specifier === "@/lib/viewport-scroll-lock.js")
        return { acquireViewportScrollLock: () => () => {} };
      if (specifier === "@/lib/dream-reader-state.js")
        return {
          DREAM_READER_STORAGE_KEY,
          DREAM_READER_DEFAULTS: { size: "standard", spacing: "standard", bookmark: null },
          validateDreamReaderState,
        };
      if (specifier === "./dream-chapter-data") return { DREAM_CASES };
      if (specifier.endsWith(".css")) return {};
      return require(specifier);
    },
  });
  new Script(js, { filename: "dream-reading-room.tsx" }).runInContext(context);
  return exports.DreamReadingRoom;
}

function fakeReaderEnvironment(initialValue = null, denied = false) {
  const listeners = new Map();
  const docListeners = new Map();
  const attrs = new Map();
  let value = initialValue;
  const add = (map, name, callback) => {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(callback);
  };
  const remove = (map, name, callback) => map.get(name)?.delete(callback);
  const document = {
    hidden: false,
    documentElement: { removeAttribute() {} },
    addEventListener(name, callback) {
      add(docListeners, name, callback);
    },
    removeEventListener(name, callback) {
      remove(docListeners, name, callback);
    },
  };
  const root = {
    ownerDocument: document,
    getAttribute(name) {
      return attrs.get(name) ?? null;
    },
    setAttribute(name, entry) {
      attrs.set(name, entry);
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const environment = {
    get localStorage() {
      if (denied) throw new Error("storage denied");
      return {
        getItem() {
          return value;
        },
        setItem(_key, next) {
          value = next;
        },
      };
    },
    addEventListener(name, callback) {
      add(listeners, name, callback);
    },
    removeEventListener(name, callback) {
      remove(listeners, name, callback);
    },
    clearTimeout() {},
    emit(name) {
      for (const callback of listeners.get(name) ?? []) callback();
    },
  };
  return {
    root,
    environment,
    setStorage(next) {
      value = next;
    },
    listeners,
  };
}

test("entry keeps the room out of the initial module and opens it only on click", () => {
  const launcher = source("dream-reading-launcher.tsx");
  const room = source("dream-reading-room.tsx");
  const style = source("dream-reading-style.ts");
  assert.doesNotMatch(launcher, /^import\s+\{?\s*DreamReadingRoom\s*\}?\s+from/m);
  assert.match(launcher, /import type \{ DreamReadingRoom \}/);
  assert.ok(
    launcher.indexOf("const enter = async () =>") <
      launcher.indexOf('import("./dream-reading-room")'),
  );
  assert.match(
    launcher,
    /Promise\.all\(\[import\("\.\/dream-reading-room"\), prepareReadingStyle\(\)\]\)/,
  );
  assert.doesNotMatch(room, /import ["']\.\/dream-reading-room\.css["']/);
  assert.match(style, /import stylesheet from "\.\/dream-reading-room\.css\?url"/);
  assert.match(style, /link\.rel = "stylesheet"/);
  assert.match(style, /ready = null;\s*reject\(new Error\("Reading stylesheet unavailable"\)\)/);
  assert.match(launcher, /onClick=\{\(\) => void enter\(\)\}/);
  assert.match(launcher, /open && Room\s*\? createPortal/);
  assert.match(launcher, /generation\.current \+= 1/);
});

test("room renders every canonical paragraph in its original order and restores a validated chapter", () => {
  for (const episode of DREAM_CASES) {
    const Room = loadRoom({
      getItem: () =>
        JSON.stringify({
          version: 1,
          size: "large",
          spacing: "comfortable",
          bookmark: { caseNo: episode.no, paragraph: 1 },
        }),
    });
    const html = renderToStaticMarkup(React.createElement(Room, { trigger: null, onClose() {} }));
    // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明）
    // The sheet heads with its chapter numeral and title; the English reading is not repeated.
    assert.ok(html.includes(`CASE 0${episode.no}</p>`));
    assert.ok(!html.includes(episode.reading));
    assert.equal(
      (html.match(/data-room-paragraph="\d+"/g) ?? []).length,
      episode.paragraphs.length,
    );
    let prior = -1;
    for (const paragraph of episode.paragraphs) {
      const next = html.indexOf(paragraph);
      assert.ok(next > prior, `CASE ${episode.no}: missing or reordered canonical paragraph`);
      prior = next;
    }
  }
});

test("room uses the shared versioned bookmark and notifies the page reader after a save", () => {
  const room = source("dream-reading-room.tsx");
  assert.match(room, /localStorage\.setItem\(\s*DREAM_READER_STORAGE_KEY/);
  assert.match(
    room,
    /JSON\.stringify\(\{ version: 1, size, spacing, bookmark: \{ caseNo: chapter, paragraph \} \}\)/,
  );
  assert.match(room, /dispatchEvent\(new Event\("dream-reader-state-change"\)\)/);

  const fixture = fakeReaderEnvironment();
  const states = [];
  const controller = mountDreamReader(
    fixture.root,
    DREAM_CASES,
    (state) => states.push(state),
    fixture.environment,
  );
  fixture.setStorage(
    JSON.stringify({
      version: 1,
      size: "large",
      spacing: "comfortable",
      bookmark: { caseNo: "5", paragraph: 4 },
    }),
  );
  fixture.environment.emit("dream-reader-state-change");
  assert.deepEqual(states.at(-1), {
    size: "large",
    spacing: "comfortable",
    bookmark: { caseNo: "5", paragraph: 4 },
    available: true,
  });
  assert.equal(fixture.root.getAttribute("data-dream-reader-size"), "large");
  controller.dispose();
  assert.equal(fixture.listeners.get("dream-reader-state-change")?.size, 0);
  assert.equal(fixture.root.getAttribute("data-dream-reader-size"), null);
  const count = states.length;
  fixture.environment.emit("dream-reader-state-change");
  assert.equal(states.length, count);
});

test("dialog freezes the departure scroll before showModal and releases on history and disposal", () => {
  const room = source("dream-reading-room.tsx");
  const lock = room.indexOf("acquireViewportScrollLock({ freezeBody: true })");
  const show = room.indexOf("modal.showModal()");
  assert.ok(lock > 0 && lock < show);
  assert.match(room, /const stopHistory = router\.history\.subscribe/);
  assert.match(room, /historyDismissed = true;\s*release\(\);\s*close\(\);/);
  assert.match(room, /return \(\) => \{\s*stopHistory\(\);\s*release\(\);/);
  assert.match(room, /if \(released\) return;/);
  assert.match(
    room,
    /if \(!historyDismissed && trigger\?\.isConnected\) trigger\.focus\(\{ preventScroll: true \}\)/,
  );
});

test("denied or malformed storage keeps the room readable and the page reader usable", () => {
  const Room = loadRoom({
    getItem() {
      throw new Error("storage denied");
    },
  });
  const html = renderToStaticMarkup(React.createElement(Room, { trigger: null, onClose() {} }));
  assert.ok(html.includes(DREAM_CASES[0].paragraphs[0]));
  assert.equal(
    (html.match(/data-room-paragraph="\d+"/g) ?? []).length,
    DREAM_CASES[0].paragraphs.length,
  );
  const MalformedRoom = loadRoom({ getItem: () => "{not-json" });
  const malformedHtml = renderToStaticMarkup(
    React.createElement(MalformedRoom, { trigger: null, onClose() {} }),
  );
  assert.ok(malformedHtml.includes(DREAM_CASES[0].paragraphs[0]));
  const room = source("dream-reading-room.tsx");
  assert.match(
    room,
    /catch \{\s*setStatus\("このブラウザーでは保存できません。読書室はこのまま利用できます。"\)/,
  );

  const fixture = fakeReaderEnvironment(null, true);
  const states = [];
  const controller = mountDreamReader(
    fixture.root,
    DREAM_CASES,
    (state) => states.push(state),
    fixture.environment,
  );
  assert.equal(states.at(-1).available, false);
  controller.setSize("large");
  assert.equal(states.at(-1).size, "large");
  controller.dispose();
});
