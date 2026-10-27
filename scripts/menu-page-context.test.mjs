import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { defaultParseSearch, defaultStringifySearch } from "@tanstack/react-router";
import { readFileSync } from "node:fs";
import {
  getMenuPageContext,
  markCurrentMenuSection,
  preferredMenuRow,
} from "../src/lib/menu-page-context.ts";

function node(href, top = 0, height = 300, width = 600) {
  const attrs = new Map(href ? [["href", href]] : []);
  return {
    getAttribute: (name) => attrs.get(name) ?? null,
    setAttribute: (name, value) => attrs.set(name, value),
    removeAttribute: (name) => attrs.delete(name),
    getBoundingClientRect: () => ({ top, height, width, bottom: top + height }),
  };
}
function fixture(path = "/rexonance-saga", activeHref = "#assembly") {
  const rows = ["top", "assembly", "stages"].map((id) => node(`${path}#${id}`));
  const sections = new Map([
    ["top", node(null, -1200, 1800)],
    ["assembly", node(null, -200)],
    ["stages", node(null, 700)],
  ]);
  const active = activeHref ? [node(activeHref)] : [];
  const doc = {
    getElementById: (id) => sections.get(id),
    querySelectorAll: () => active,
    documentElement: { clientHeight: 900 },
  };
  const page = node(path);
  page.setAttribute("aria-current", "page");
  const panel = {
    ownerDocument: doc,
    contains: (item) => rows.includes(item),
    querySelectorAll: () => rows,
    querySelector(selector) {
      if (selector.includes('aria-current="location"'))
        return rows.find((row) => row.getAttribute("aria-current") === "location") ?? null;
      if (selector.includes('aria-current="page"')) return page;
      return null;
    },
  };
  return { panel, rows, sections, active, page };
}

test("search, library, tours and archive resolve their own real local targets", () => {
  for (const [path, expected] of [
    ["/search", ["search-title", "record-results-heading"]],
    ["/library", ["library-main", "library-browser", "my-library", "inquiry"]],
    ["/gallery-tours", ["main", "gallery-tour-catalogue"]],
    ["/gallery", ["gallery-top", "gallery-collection"]],
    ["/form-archive", ["archive-switcher"]],
  ]) {
    const page = getMenuPageContext(path);
    assert.deepEqual(
      page.sections.map(([id]) => id),
      expected,
    );
    assert.ok(page.title && page.image);
    assert.equal(getMenuPageContext(`${path}/`), page);
  }
  assert.equal(getMenuPageContext("/world"), undefined);
});

test("the page's current local chapter wins over the duplicate site launcher", () => {
  const f = fixture();
  markCurrentMenuSection(f.panel, "/rexonance-saga");
  assert.equal(preferredMenuRow(f.panel), f.rows[1]);
  assert.equal(f.rows[1].getAttribute("aria-current"), "location");
  assert.equal(f.rows[0].getAttribute("aria-current"), null);
});

test("local mark supports complete same-page URLs but ignores another page's current link", () => {
  const f = fixture("/final-stage", "/final-stage#stages");
  markCurrentMenuSection(f.panel, "/final-stage");
  assert.equal(preferredMenuRow(f.panel), f.rows[2]);
  f.active[0] = node("/world#stages");
  markCurrentMenuSection(f.panel, "/final-stage");
  assert.equal(preferredMenuRow(f.panel), f.rows[1]);
});

test("without an observed mark, the nearest visible section at the reading line wins", () => {
  const f = fixture("/rexonance-saga", null);
  // Outer #top also spans the viewport; it must not swallow the inner chapter.
  markCurrentMenuSection(f.panel, "/rexonance-saga");
  assert.equal(preferredMenuRow(f.panel), f.rows[1]);
  f.sections.set("stages", node(null, 200));
  markCurrentMenuSection(f.panel, "/rexonance-saga");
  assert.equal(preferredMenuRow(f.panel), f.rows[2]);
  assert.equal(f.rows[1].getAttribute("aria-current"), null);
});

test("missing or hidden sections cannot become the current chapter", () => {
  const f = fixture("/gallery-tours", null);
  f.sections.delete("assembly");
  f.sections.set("stages", node(null, 200, 0));
  markCurrentMenuSection(f.panel, "/gallery-tours");
  assert.equal(preferredMenuRow(f.panel), f.rows[0]);
  f.sections.set("top", node(null, 0, 0));
  markCurrentMenuSection(f.panel, "/gallery-tours");
  assert.equal(preferredMenuRow(f.panel), f.page);
  f.sections.clear();
  markCurrentMenuSection(f.panel, "/gallery-tours");
  assert.equal(preferredMenuRow(f.panel), f.page);
});

test("opening the menu never rewrites hashes or scrolls the page to mark a chapter", () => {
  const f = fixture();
  const before = f.rows.map((row) => row.getAttribute("href"));
  markCurrentMenuSection(f.panel, "/rexonance-saga");
  assert.deepEqual(
    f.rows.map((row) => row.getAttribute("href")),
    before,
  );
});

test("archive is a single research destination, and same-page links preserve active query state", () => {
  const source = readFileSync(
    new URL("../src/components/world/world-chrome.tsx", import.meta.url),
    "utf8",
  );
  const find = source.slice(
    source.indexOf("<p>FIND A RECORD</p>"),
    source.indexOf("<LibraryCurrentButton"),
  );
  const system = source.slice(source.indexOf("<p>SYSTEM</p>"), source.indexOf("<ZeusButtonToggle"));
  assert.match(find, /to="\/form-archive"/);
  assert.doesNotMatch(system, /to="\/form-archive"/);
  assert.match(source, /search=\{\(previous\) => previous\}/);
});

function menuLinkFixture() {
  const source = readFileSync(
    new URL("../src/components/world/world-chrome.tsx", import.meta.url),
    "utf8",
  );
  const tree = ts.createSourceFile(
    "menu.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = tree.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === "MenuSectionLink",
  );
  const compiled = ts.transpileModule(
    `${declaration.getText(tree)}; globalThis.render = MenuSectionLink;`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
        jsx: ts.JsxEmit.React,
      },
    },
  ).outputText;
  const context = {
    Link: "router-link",
    useRouter: () => ({}),
    useRef: (current) => ({ current }),
    useEffect: () => {},
    focusMenuSectionAfterNavigation: () => () => {},
    React: { createElement: (type, props) => ({ type, props }) },
  };
  vm.runInNewContext(compiled, context);
  let closes = 0;
  const link = context.render({
    pathname: "/search",
    id: "record-results-heading",
    label: "検索結果",
    code: "RESULTS",
    onNavigate: () => closes++,
  });
  return { ...link, closes: () => closes };
}

test("real local-link query callback preserves numeric, symbolic and literally quoted search strings", () => {
  const { props } = menuLinkFixture();
  for (const q of ["123", "true", "null", '"Saga"', "サーガ & 光+影#1", "001"]) {
    const state = { q, category: "all", shown: 48 };
    const next = props.search(state);
    assert.equal(next, state);
    assert.deepEqual({ ...defaultParseSearch(defaultStringifySearch(next)) }, state);
  }
  const tour = { tour: "starlight", work: "g113" };
  assert.equal(props.search(tour), tour);
});

test("local menu activation closes once; modified clicks preserve native behavior and the open menu", () => {
  const link = menuLinkFixture();
  for (const variant of [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
    { defaultPrevented: true },
  ]) {
    link.props.onClick({ button: 0, ...variant });
  }
  assert.equal(link.closes(), 0);
  link.props.onClick({ button: 0, detail: 0, preventDefault() {} });
  assert.equal(link.closes(), 1);
  assert.equal(link.props.hash, "record-results-heading");
});

test("dossier current-file priority remains intact outside page-local menu contexts", () => {
  const f = fixture();
  markCurrentMenuSection(f.panel, "/rexonance-saga");
  assert.equal(preferredMenuRow(f.panel, false), f.page);
  assert.equal(preferredMenuRow(f.panel, true), f.rows[1]);
});
