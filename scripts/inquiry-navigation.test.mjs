import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

const guides = {};
runInNewContext(compile("src/lib/inquiry-guides.ts"), { exports: guides });
const navigationSource = compile("src/components/library/inquiry-navigation.tsx");
const Link = Symbol("Router Link");

function mount(location) {
  const calls = [];
  const exports = {};
  runInNewContext(navigationSource, {
    exports,
    require(name) {
      if (name === "react") return { useRef: (current) => ({ current }) };
      if (name === "react/jsx-runtime") {
        const jsx = (type, props, key) => ({ type, props, key });
        return { jsx, jsxs: jsx };
      }
      if (name === "@tanstack/react-router")
        return {
          Link,
          useRouterState: ({ select }) => select({ location }),
          useRouter: () => ({ navigate: (options) => calls.push(options) }),
        };
      if (name === "@/lib/inquiry-guides") return guides;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { tree: exports.InquiryNavigation(), calls };
}

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree === null || tree === undefined || typeof tree === "boolean") return "";
  if (typeof tree === "object") return text(tree.props?.children);
  return String(tree);
}

test("ordinary visits, invalid query values and unrelated routes do not activate the guide", () => {
  for (const guide of [undefined, "unknown", "", ["keepers"], { id: "keepers" }, 1]) {
    assert.equal(
      mount({ pathname: "/world", search: { guide }, hash: "manager-archive" }).tree,
      null,
    );
  }
  for (const pathname of ["/library", "/gallery", "/search", "/managers/zeus-extra"]) {
    assert.equal(mount({ pathname, search: { guide: "keepers" }, hash: "" }).tree, null);
  }
});

test("every guide stop offers only its actual neighbours and returns to the same guide", () => {
  for (const guide of guides.INQUIRY_GUIDES) {
    for (const [index, stop] of guide.stops.entries()) {
      const { tree } = mount({ pathname: stop.to, search: { guide: guide.id }, hash: "elsewhere" });
      assert.equal(tree.type, "details");
      assert.equal(tree.key, `${guide.id}:${stop.id}`);
      assert.equal(tree.props["data-tone"], guide.color);
      assert.equal(
        text(nodes(tree, (node) => node.type === "summary")[0]),
        `◇探索案内${index + 1} / ${guide.stops.length}`,
      );
      const links = nodes(tree, (node) => node.type === Link);
      const neighbours = [guide.stops[index - 1], guide.stops[index + 1]].filter(Boolean);
      assert.equal(links.length, neighbours.length + 1);
      neighbours.forEach((neighbour, position) => {
        assert.equal(links[position].props.to, neighbour.to);
        assert.equal(links[position].props.hash, neighbour.hash);
        assert.equal(links[position].props.search.guide, guide.id);
      });
      const returning = links.at(-1);
      assert.equal(returning.props.to, "/library");
      assert.equal(returning.props.hash, "inquiry");
      assert.equal(returning.props.search.guide, guide.id);
      assert.match(text(returning), /問いの案内へ戻る/);
      assert.ok(text(tree).includes(stop.lookFor));
      assert.match(text(tree), /読了の記録ではありません/);
    }
  }
});

test("ending the guide preserves the document, anchor and every unrelated query value", () => {
  const search = { guide: "keepers", q: "ゼウス", shown: 48, category: "people" };
  const { tree, calls } = mount({ pathname: "/managers/zeus", search, hash: "dossier-abilities" });
  const button = nodes(tree, (node) => node.type === "button")[0];
  button.props.onClick();
  assert.equal(calls.length, 1);
  const navigation = calls[0];
  assert.equal(navigation.to, "/managers/zeus");
  assert.equal(navigation.hash, "dossier-abilities");
  assert.equal(navigation.replace, true);
  assert.equal(navigation.resetScroll, false);
  const current = { ...search, extra: "added since render" };
  const nextSearch = navigation.search(current);
  assert.equal(nextSearch.guide, undefined);
  assert.equal(nextSearch.q, current.q);
  assert.equal(nextSearch.shown, current.shown);
  assert.equal(nextSearch.category, current.category);
  assert.equal(nextSearch.extra, current.extra);
  assert.equal(current.guide, "keepers", "the router's current search must not be mutated");
});

test("Escape closes the open disclosure and restores summary focus without ending the guide", () => {
  const { tree, calls } = mount({
    pathname: "/world",
    search: { guide: "keepers" },
    hash: "manager-archive",
  });
  let focusCount = 0;
  const details = {
    open: true,
    querySelector(selector) {
      assert.equal(selector, "summary");
      return { focus: () => focusCount++ };
    },
  };
  tree.props.ref.current = details;
  let prevented = 0;
  let stopped = 0;
  const key = (value) =>
    tree.props.onKeyDown({
      key: value,
      preventDefault: () => prevented++,
      stopPropagation: () => stopped++,
    });
  key("Enter");
  assert.equal(details.open, true);
  assert.equal(focusCount, 0);
  key("Escape");
  assert.equal(details.open, false);
  assert.equal(focusCount, 1);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
  assert.equal(calls.length, 0);
  key("Escape");
  assert.equal(focusCount, 1, "closed disclosure must leave Escape available to the page");
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
});

test("Escape remains safe before a details element has been attached", () => {
  const { tree } = mount({ pathname: "/world", search: { guide: "keepers" }, hash: "" });
  tree.props.onKeyDown({
    key: "Escape",
    preventDefault: () => assert.fail("unattached disclosure must not consume Escape"),
    stopPropagation: () => assert.fail("unattached disclosure must not stop propagation"),
  });
});
