import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("src/components/gallery/gallery-page.tsx");
const search = read("src/components/gallery/gallery-search-controls.tsx");
const route = read("src/routes/gallery.tsx");
const baseCss = read("src/styles-gallery.css");
const searchCss = read("src/styles-gallery-search.css");
const displayCss = read("src/styles-gallery-display.css");
const shuffleCss = read("src/styles-gallery-shuffle.css");
const refinementCss = read("src/styles-gallery-refinement.css");

const searchExports = {};
runInNewContext(
  ts.transpileModule(search, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText,
  { exports: searchExports, require: createRequire(import.meta.url) },
);

function renderSearch(query) {
  return renderToStaticMarkup(
    React.createElement(searchExports.GallerySearchControls, { query, onQueryChange() {} }),
  );
}

function attribute(tag, name) {
  return tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
}

function rule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1];
  assert.ok(block, `missing CSS rule: ${selector}`);
  return block;
}

test("search label and description point to the rendered input; native hints start closed", () => {
  const html = renderSearch("");
  const input = html.match(/<input\b[^>]*type="search"[^>]*>/)?.[0];
  const label = html.match(/<label\b[^>]*>作品を検索<\/label>/)?.[0];
  const hint = html.match(/<details\b[^>]*class="gallery-search-tips"[^>]*>/)?.[0];
  assert.ok(input);
  assert.ok(label);
  assert.ok(hint);
  assert.equal(attribute(label, "for"), attribute(input, "id"));
  assert.equal(
    attribute(input, "aria-describedby"),
    attribute(html.match(/<p\b[^>]*class="gallery-search-help"[^>]*>/)?.[0] ?? "", "id"),
  );
  assert.match(input, /aria-label="作品を番号、画像の説明、公開タイトルで検索"/);
  assert.equal(attribute(hint, "open"), undefined);
  assert.match(html, /<summary>検索のヒント<\/summary>/);
  assert.doesNotMatch(html, /検索を解除/);
});

test("search clear action only appears for a nonempty query", () => {
  const html = renderSearch("青 金");
  assert.match(html, /value="青 金"/);
  assert.match(
    html,
    /<button\b[^>]*type="button"[^>]*class="gallery-search-clear"[^>]*>検索を解除<\/button>/,
  );
  assert.match(search, /onQueryChange\(""\)/);
  assert.match(search, /inputRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
});

test("browse panel preserves discovery, categories, shuffle, display settings, and then artwork grid", () => {
  const start = page.indexOf('<div className="gallery-browse-panel">');
  const end = page.indexOf('<div\n            className="gallery-grid"', start);
  assert.ok(start >= 0 && end > start);
  const panel = page.slice(start, end);
  const groups = [
    '<div className="gallery-discovery-controls">',
    '<nav className="gallery-filters" aria-label="展示の分類">',
    '<div className="gallery-shuffle-entry">',
    "<GalleryDisplaySettings",
  ];
  let previous = -1;
  for (const group of groups) {
    const position = panel.indexOf(group);
    assert.ok(position > previous, `${group} must remain in browse-panel order`);
    previous = position;
  }
  assert.match(panel, /<GallerySearchControls query=\{query\} onQueryChange=\{setQuery\} \/>/);
  assert.match(panel, /aria-pressed=\{favoritesOnly\}/);
  assert.match(panel, /<button[\s\S]*?className="gallery-shuffle-start"/);
  assert.match(panel, /value=\{display\.preferences\}/);
  assert.match(
    page.slice(end),
    /className="gallery-grid"[\s\S]*?data-gallery-density=\{display\.preferences\.density\}/,
  );
});

test("public-posting warning and compact limits stay visible before the optional details", () => {
  const section = page.slice(
    page.indexOf('<div className="gallery-submission-copy">'),
    page.indexOf(
      '<button\n              type="button"\n              className="gallery-personal-add"',
    ),
  );
  assert.match(section, /id="gallery-community-privacy"[\s\S]*?すべての訪問者に公開/);
  assert.match(
    section,
    /gallery-submission-specs" id="gallery-community-limits"[\s\S]*?1枚19MB（19MiB）まで[\s\S]*?画質を保つ可逆圧縮[\s\S]*?JPEG · PNG · WebP/,
  );
  assert.match(
    section,
    /<details className="gallery-submission-details">[\s\S]*?<summary>投稿前に確認<\/summary>/,
  );
  assert.doesNotMatch(section, /<details[^>]*\bopen\b/);
  assert.match(section, /自分用の設定としてこのブラウザーに保存/);
  assert.match(section, /解像度・色・透過を保つ可逆圧縮/);
  assert.match(section, /EXIF・GPS・XMPの撮影情報は除去/);
  assert.match(section, /ICC色プロファイルは保持/);
  assert.match(section, /ブラウザーのデータを消すと管理できなくなります/);
  assert.match(page, /aria-describedby="gallery-community-privacy gallery-community-limits"/);
});

test("pending selection still requires an explicit public-post confirmation", () => {
  const start = page.indexOf("{pendingImages.length > 0 && (");
  const end = page.indexOf("\n          {!communityLoaded", start);
  assert.ok(start >= 0 && end > start);
  const pending = page.slice(start, end);
  assert.match(pending, /すべての訪問者に公開されます/);
  assert.match(pending, /onClick=\{\(\) => \{\s*void addCommunityImages\(pendingImages\)/);
  assert.match(pending, /投稿する/);
  assert.match(pending, /onClick=\{\(\) => setPendingImages\(\[\]\)\}/);
  assert.match(pending, /選択を取り消す/);
});

test("artwork hint moves outside the mat without filtering or transforming original pixels", () => {
  assert.match(
    page,
    /<span className="gallery-work-frame">[\s\S]*?<\/span>\s*<span className="gallery-work-hint">/,
  );
  const hint = rule(refinementCss, ".gallery-page .gallery-work-hint");
  assert.match(hint, /position:\s*static;/);
  assert.match(hint, /opacity:\s*1;/);
  assert.match(hint, /transform:\s*none;/);
  assert.match(baseCss, /\.gallery-work-frame img\s*\{[^}]*object-fit:\s*contain;/);
  assert.match(
    refinementCss,
    /\.gallery-page \.gallery-work-open:hover \.gallery-work-frame img,\s*\.gallery-page \.gallery-work-open:focus-visible \.gallery-work-frame img\s*\{[^}]*filter:\s*none;[^}]*transform:\s*none;/,
  );
});

test("new controls retain 44px targets and reduced-motion, economy, forced-colors safeguards", () => {
  for (const selector of [
    ".gallery-page .gallery-search-clear",
    ".gallery-page .gallery-submission-details summary,\n.gallery-page .gallery-search-tips summary",
    ".gallery-page .gallery-personal-controls > .gallery-personal-add",
    ".gallery-page .gallery-favorite-toggle",
  ]) {
    assert.match(rule(refinementCss, selector), /min-height:\s*(?:44|48)px;/, selector);
  }
  assert.match(rule(baseCss, ".gallery-search input"), /min-height:\s*46px;/);
  assert.match(rule(baseCss, ".gallery-filters button"), /min-height:\s*44px;/);
  assert.match(rule(displayCss, ".gallery-display-choice"), /min-height:\s*44px;/);
  assert.match(
    rule(shuffleCss, ".gallery-shuffle-start,\n.gallery-shuffle-end button"),
    /min-height:\s*44px;/,
  );
  assert.match(
    refinementCss,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.gallery-page \.gallery-work-hint\s*\{\s*transition:\s*none;/,
  );
  assert.match(
    refinementCss,
    /@media \(forced-colors: active\)[\s\S]*?\.gallery-page \.gallery-browse-panel,[\s\S]*?forced-color-adjust:\s*auto;/,
  );
  assert.match(
    refinementCss,
    /html\[data-world-effects="economy"\] \.gallery-page \.gallery-viewer[\s\S]*?box-shadow:\s*none;/,
  );
  assert.match(searchCss, /\.gallery-search-clear:focus-visible\s*\{[^}]*outline:\s*2px/);
});

test("refinement stylesheet is the final gallery-specific route layer", () => {
  assert.match(
    route,
    /import galleryRefinementCssUrl from "@\/styles-gallery-refinement\.css\?url"/,
  );
  const links = route.slice(
    route.indexOf("stylesheetLinks: ["),
    route.indexOf("\n      ],", route.indexOf("stylesheetLinks: [")),
  );
  assert.match(links, /\{ rel: "stylesheet", href: galleryRefinementCssUrl \},\s*$/);
  assert.match(refinementCss, /@media \(max-width: 700px\)/);
  assert.match(refinementCss, /@media \(max-width: 390px\)/);
});

test("hero entrances share one responsive navigation without changing their destinations", () => {
  const actions = page.match(
    /<nav className="gallery-intro-actions" aria-label="ギャラリーの入口">([\s\S]*?)<\/nav>/,
  )?.[1];
  assert.ok(actions);
  assert.match(actions, /className="gallery-enter" href="#gallery-collection"/);
  assert.match(actions, /<Link to="\/gallery-tours">/);
  const layout = rule(refinementCss, ".gallery-page .gallery-intro-actions");
  assert.match(layout, /display:\s*grid;/);
  assert.match(layout, /grid-template-columns:\s*max-content minmax\(0, 1fr\);/);
  for (const selector of [
    ".gallery-page .gallery-intro-actions .gallery-enter",
    ".gallery-page .gallery-intro-actions .gallery-tour-invitation a",
    ".gallery-page .gallery-feature-settings :is(a, button)",
  ]) {
    assert.match(rule(refinementCss, selector), /min-height:\s*(?:44|48)px;/, selector);
  }
  assert.match(
    refinementCss,
    /@media \(max-width: 700px\)[\s\S]*?\.gallery-page \.gallery-intro \{\s*gap: 28px;\s*padding-block: 32px 48px;/,
  );
  // Geometry polish must not crop the user's personally selected top artwork.
  assert.match(page, /--gallery-feature-ratio[^\n]*featured\.width \/ featured\.height/);
  assert.doesNotMatch(refinementCss, /\.gallery-feature(?:-open)?\s+img\s*\{/);
});

test("narrow header keeps the full brand and refresh labels without shrinking touch targets", () => {
  assert.match(
    refinementCss,
    /@media \(max-width: 390px\) \{[\s\S]*?\.gallery-page \.gallery-brand \{\s*font-size: clamp\(12px, 3\.35vw, 13px\);/,
  );
  assert.match(rule(refinementCss, ".gallery-page .gallery-topbar-actions"), /gap: 8px;/);
  assert.match(rule(refinementCss, ".gallery-page .gallery-refresh"), /padding-inline: 6px;/);
  assert.match(page, /DECEPTION WORLD<span>VISUAL COLLECTION<\/span>/);
  assert.match(page, /refreshing \? "更新中" : justRefreshed \? "更新済み" : "更新"/);
  assert.match(rule(baseCss, ".gallery-refresh"), /min-height: 44px;/);
  assert.doesNotMatch(refinementCss, /\.gallery-(?:brand|refresh)\s*\{[^}]*display: none;/);
});
