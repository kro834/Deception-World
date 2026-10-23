import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
function load(path, imports, globals = {}) {
  const exports = {};
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, {
    exports,
    require: (name) => {
      if (Object.hasOwn(imports, name)) return imports[name];
      if (name.endsWith("?url")) return { default: "/recovery.css" };
      return nativeRequire(name);
    },
    ...globals,
  });
  return exports;
}

function NativeLink({ to, hash, children, ...props }) {
  return jsx.jsx("a", { ...props, href: `${to}${hash ? `#${hash}` : ""}`, children });
}

const router = { Link: NativeLink, createFileRoute: () => (options) => options };

test("download identifies the same ZIP retry and offers inspection without starting a download", () => {
  const { Route } = load("src/routes/download.tsx", {
    "@tanstack/react-router": router,
    "@/lib/world-head": { createWorldHead: (value) => value },
  });
  const html = renderToStaticMarkup(Route.component());
  assert.match(html, /aria-labelledby="export-heading"/);
  assert.match(html, /aria-describedby="export-scope"/);
  assert.match(html, /href="\/api\/export" aria-describedby="export-retry-note"/);
  assert.match(html, /id="export-retry-note">再試行も同じmainのZIPを取得します。/);
  assert.match(html, /公開サイトの配信版とは異なる場合があります。/);
  assert.match(html, /投稿した画像・しおり・個人設定・node_modules は含みません。/);
  assert.match(html, /href="\/library"/);
  assert.match(
    html,
    /href="https:\/\/github.com\/kro834\/Deception-World\/tree\/main" target="_blank" rel="noopener noreferrer"/,
  );
  assert.match(html, /GitHubで内容を確認（別タブ）/);
  assert.doesNotMatch(html, /ダウンロードが完了|保存しました/);
});

function recovery(recent) {
  const { RecoveryTiles } = load("src/components/library/recovery-tiles.tsx", {
    "@tanstack/react-router": router,
    "@/lib/library-data": {
      LIBRARY_ENTRIES: [
        { id: "world", path: "/world", title: "ワールド" },
        { id: "chapter", path: "/dream-chapter", hash: "dream-case-2", title: "CASE 2 ／ 記録" },
      ],
    },
    "@/lib/record-art": { pathArt: () => ({ src: "/portrait.webp" }) },
    "@/lib/record-images": { recordImage: (src) => ({ src }) },
    "./library-store": { useLibraryStore: () => ({ saved: { recent } }) },
  });
  return RecoveryTiles;
}

test("404 continues the actual previous chapter and retains its fragment", () => {
  const RecoveryTiles = recovery([{ id: "world" }, { id: "removed" }, { id: "chapter" }]);
  const { NotFoundComponent } = load("src/lib/error-component.tsx", {
    "@/components/library/recovery-tiles": { RecoveryTiles },
    "lucide-react": { TriangleAlert: () => null },
  });
  const html = renderToStaticMarkup(NotFoundComponent());
  assert.match(html, /aria-labelledby="not-found-heading"/);
  assert.match(html, /aria-describedby="not-found-description"/);
  assert.match(html, /URLを確認するか/);
  assert.match(html, /href="\/dream-chapter#dream-case-2"/);
  assert.match(html, /aria-label="最近読んだ資料：CASE 2 ／ 記録"/);
  assert.match(html, /<small>最近読んだ資料<\/small>/);
  assert.equal((html.match(/<a\b/g) ?? []).length, 3);
});

test("404 keeps library and search usable when saved history has no remaining record", () => {
  const html = renderToStaticMarkup(recovery([{ id: "removed" }])());
  assert.match(html, /href="\/library"/);
  assert.match(html, /href="\/search"/);
  assert.doesNotMatch(html, /CONTINUE|最近読んだ資料/);
});

test("load failure keeps full document retry and plain recovery links usable without the router", () => {
  let reloads = 0;
  const location = {
    href: "https://example.test/dream-chapter?q=record#dream-case-2",
    reload: () => reloads++,
  };
  const { AppErrorComponent } = load(
    "src/lib/error-component.tsx",
    {
      "@/components/library/recovery-tiles": { RecoveryTiles: () => null },
      "lucide-react": { TriangleAlert: () => null },
    },
    { window: { location } },
  );
  const tree = AppErrorComponent();
  const html = renderToStaticMarkup(tree);
  assert.match(html, /aria-describedby="load-error-description"/);
  for (const path of ["world", "library", "search"]) assert.ok(html.includes(`href="/${path}"`));
  const actions = tree.props.children[1].props.children.at(-1);
  actions.props.children[0].props.onClick();
  assert.equal(reloads, 1);
  assert.equal(location.href, "https://example.test/dream-chapter?q=record#dream-case-2");
  assert.ok(actions.props.children.slice(1).every((link) => link.type === "a"));
});
