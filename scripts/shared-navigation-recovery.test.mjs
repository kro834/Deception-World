import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
function load(path, require, globals = {}) {
  const exports = {};
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    { exports, require, ...globals },
  );
  return exports;
}

function walk(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = walk(child, predicate);
    if (found) return found;
  }
  return null;
}

function mountMenu({ pageTop = null, locationTop = null, groupHeight = 600 } = {}) {
  const effects = [];
  const cleanups = [];
  const changes = [];
  const window = new EventTarget();
  const document = {
    documentElement: { dataset: {} },
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  class Element {
    isConnected = true;
    style = { removeProperty() {} };
    children = [];
    focus(options) {
      this.focusOptions = options;
      document.activeElement = this;
    }
    blur() {
      if (document.activeElement === this) document.activeElement = document.body;
    }
  }
  const opener = new Element();
  const close = new Element();
  const panel = new Element();
  panel.scrollTop = 0;
  panel.getBoundingClientRect = () => ({ top: 0, bottom: 320 });
  panel.contains = (node) => node === panel || node === close;
  panel.ownerDocument = document;
  panel.parentElement = document.body = new Element();
  document.body.children = [panel];
  document.activeElement = opener;
  const group = {
    getBoundingClientRect: () => ({ top: 200 - panel.scrollTop, height: groupHeight }),
  };
  const row = (top) =>
    top === null
      ? null
      : {
          getBoundingClientRect: () => ({
            top: top - panel.scrollTop,
            bottom: top + 48 - panel.scrollTop,
          }),
          closest: () => group,
        };
  const pageRow = row(pageTop);
  const locationRow = row(locationTop);
  panel.querySelectorAll = () => [];
  panel.querySelector = (selector) => {
    if (selector.includes('aria-current="page"')) return pageRow;
    if (selector.includes('aria-current="location"')) return locationRow;
    if (selector === ".side-panel-head") return { getBoundingClientRect: () => ({ bottom: 84 }) };
    if (selector === ".side-panel-close") return close;
    return null;
  };
  window.sessionStorage = { getItem: () => null };
  window.getComputedStyle = () => ({ paddingBottom: "24px", visibility: "visible" });
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  const module = load(
    "src/components/world/world-chrome.tsx",
    (name) => {
      if (name === "react")
        return {
          useEffect: (effect) => effects.push(effect),
          useLayoutEffect: (effect) => effects.push(effect),
          useState: (initial) => [initial, () => {}],
          useRef: (current) => ({ current }),
        };
      if (name === "react/jsx-runtime")
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      if (name === "@tanstack/react-router")
        return {
          useRouter: () => ({ history: { subscribe: () => () => {} } }),
          useRouterState: ({ select }) =>
            select({ location: { pathname: "/world", hash: "records" } }),
        };
      if (name === "@/lib/viewport-scroll-lock.js")
        return { acquireViewportScrollLock: () => () => {} };
      if (name === "./dossier-nav")
        return { RIDER_NAV: [], RIKUEI_NAV: [], RELATED_NAV: [], RE_DIVE_RIKUEI_NAV: [] };
      if (name === "@/lib/thumbnail-images") return { launcherTile: () => undefined };
      return {};
    },
    { window, document, HTMLElement: Element, Node: Element },
  );
  const tree = module.SideMenuLayer({ open: true, onOpenChange: (open) => changes.push(open) });
  walk(tree, (node) => node.props?.id === "site-side-panel").props.ref.current = panel;
  const closeButton = walk(tree, (node) => node.props?.["aria-label"] === "メニューを閉じる");
  for (const effect of effects) {
    const cleanup = effect();
    if (typeof cleanup === "function") cleanups.push(cleanup);
  }
  return {
    panel,
    pageRow,
    locationRow,
    close,
    opener,
    document,
    changes,
    closeBy: (detail) => {
      document.activeElement = close;
      closeButton.props.onClick({ detail, currentTarget: close });
      cleanups.forEach((cleanup) => cleanup());
    },
    unmount: () => cleanups.forEach((cleanup) => cleanup()),
  };
}

test("keyboard closing restores the trigger after a pointer-opened menu", () => {
  const menu = mountMenu();
  menu.closeBy(0);
  assert.equal(menu.document.activeElement, menu.opener);
  assert.equal(menu.opener.focusOptions.preventScroll, true);
  assert.deepEqual(menu.changes, [false]);
  assert.equal(menu.document.documentElement.dataset.sideMenuOpen, undefined);
});

test("pointer closing does not force a keyboard focus ring on the trigger", () => {
  const menu = mountMenu();
  menu.closeBy(1);
  assert.notEqual(menu.document.activeElement, menu.opener);
  assert.equal(menu.opener.focusOptions, undefined);
  assert.equal(menu.document.documentElement.dataset.sideMenuOpen, undefined);
});

test("short landscape shows the current World location even when its group is too tall", () => {
  const menu = mountMenu({ locationTop: 640 });
  assert.equal(menu.panel.scrollTop, 392);
  const bounds = menu.locationRow.getBoundingClientRect();
  assert.ok(bounds.top >= 84 && bounds.bottom <= 320 - 24);
  menu.unmount();
});

test("a current dossier file keeps priority over a section marker", () => {
  const menu = mountMenu({ pageTop: 800, locationTop: 640 });
  assert.equal(menu.panel.scrollTop, 552);
  assert.equal(menu.pageRow.getBoundingClientRect().bottom, 296);
  menu.unmount();
});

test("a group that fits still opens with its heading below the sticky panel head", () => {
  const menu = mountMenu({ locationTop: 320, groupHeight: 180 });
  assert.equal(menu.panel.scrollTop, 108);
  menu.unmount();
});

function NativeLink({ to, hash, children, ...props }) {
  return React.createElement("a", { ...props, href: `${to}${hash ? `#${hash}` : ""}` }, children);
}

function recoveryMarkup(recent) {
  const { RecoveryTiles } = load("src/components/library/recovery-tiles.tsx", (name) => {
    if (name === "@tanstack/react-router") return { Link: NativeLink };
    if (name === "@/lib/library-data")
      return {
        LIBRARY_ENTRIES: [
          { id: "realm", path: "/riders/realm", hash: "dossier-profile", title: "レルム" },
        ],
      };
    if (name === "@/lib/record-art") return { pathArt: () => ({ src: "/portrait.webp" }) };
    if (name === "@/lib/record-images") return { recordImage: (src) => ({ src }) };
    if (name === "./library-store") return { useLibraryStore: () => ({ saved: { recent } }) };
    if (name.endsWith("?url")) return { default: "sheet.css" };
    return nativeRequire(name);
  });
  const { NotFoundComponent } = load("src/lib/error-component.tsx", (name) => {
    if (name === "@/components/library/recovery-tiles") return { RecoveryTiles };
    if (name === "lucide-react") return { TriangleAlert: () => null };
    if (name.endsWith("?url")) return { default: "sheet.css" };
    return nativeRequire(name);
  });
  return renderToStaticMarkup(React.createElement(NotFoundComponent));
}

for (const [name, recent, expected] of [
  ["no saved history", [], "/library"],
  ["a valid recent file", [{ id: "realm" }], "/riders/realm#dossier-profile"],
  ["a removed recent file", [{ id: "missing" }], "/library"],
]) {
  test(`404 offers three native recovery destinations with ${name}`, () => {
    const html = recoveryMarkup(recent);
    assert.equal((html.match(/<a\b/g) ?? []).length, 3);
    assert.equal((html.match(/href="\/world"/g) ?? []).length, 1);
    assert.equal((html.match(/href="\/search"/g) ?? []).length, 1);
    assert.ok(html.includes(`href="${expected}"`));
    assert.match(html, /<h1>記録が見つかりません。<\/h1>/);
    assert.match(html, /<nav class="recovery-tiles" aria-label="次に開く資料">/);
  });
}

test("download explains source-code scope without changing archive or retry destinations", () => {
  const { Route } = load("src/routes/download.tsx", (name) => {
    if (name === "@tanstack/react-router")
      return { createFileRoute: () => (options) => options, Link: NativeLink };
    if (name === "@/lib/world-head") return { createWorldHead: (head) => head };
    if (name.endsWith("?url")) return { default: "sheet.css" };
    return nativeRequire(name);
  });
  const html = renderToStaticMarkup(React.createElement(Route.component));
  assert.match(
    html,
    /href="https:\/\/github\.com\/kro834\/Deception-World\/archive\/refs\/heads\/main\.zip"/,
  );
  assert.match(html, /href="\/api\/export"/);
  assert.match(html, /href="\/world"/);
  assert.match(html, /最新mainのソースをZIPで保存する/);
  assert.match(html, /公開サイトの配信版とは異なる場合があります/);
  assert.match(html, /ギャラリーに投稿した画像・しおり・個人設定・node_modules は含みません/);
  assert.match(Route.head().title, /ソースコードの取得/);
});
