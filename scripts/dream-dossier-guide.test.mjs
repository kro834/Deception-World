import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/components/dream-chapter/dream-dossier-guide.tsx", import.meta.url),
  "utf8",
);

function guideHarness() {
  const exports = {};
  const state = [];
  let cursor = 0;
  let effect;
  let dependencies;
  let cleanup;
  const jsx = (type, props) => ({ type, props });
  runInNewContext(
    ts.transpileModule(`${source}\nexports.moveToDossierStop = moveToDossierStop;`, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      require(name) {
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        return {
          useState(initial) {
            const index = cursor++;
            if (!(index in state)) state[index] = initial;
            return [
              state[index],
              (value) => {
                state[index] = value;
              },
            ];
          },
          useEffect(callback, next) {
            if (!dependencies || next.some((value, index) => value !== dependencies[index])) {
              effect = callback;
              dependencies = next;
            }
          },
        };
      },
    },
  );
  return {
    ...exports,
    render(props, beforeEffects) {
      cursor = 0;
      let tree = exports.DreamDossierGuide(props);
      beforeEffects?.();
      if (effect) {
        cleanup?.();
        const current = effect;
        effect = undefined;
        cleanup = current();
        cursor = 0;
        tree = exports.DreamDossierGuide(props);
      }
      return tree;
    },
    cleanup: () => cleanup?.(),
  };
}

function heading(textContent, tabindex) {
  const attributes = new Map(tabindex === undefined ? [] : [["tabindex", tabindex]]);
  const events = [];
  return {
    textContent,
    attributes,
    events,
    isConnected: true,
    hasAttribute: (key) => attributes.has(key),
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: (key) => attributes.delete(key),
    scrollIntoView: (options) => events.push(["scroll", { ...options }]),
    focus: (options) => events.push(["focus", { ...options }]),
  };
}

function dossier(title, sections) {
  return {
    current: {
      querySelector: () => title,
      querySelectorAll: (selector) => {
        assert.equal(selector, ".dream-dossier-sections > section > header h3");
        return sections;
      },
    },
  };
}

function controls(tree) {
  return { select: tree.props.children[0].props.children[1], button: tree.props.children[1] };
}

test("contents materializes every rendered section, including supplements and linked records", () => {
  const ui = guideHarness();
  const title = heading("シエル"),
    body = heading("人物記録");
  const supplement = heading("追補資料"),
    relations = heading("因縁・関係性の記録（2件）");
  const scope = dossier(title, [body, supplement, relations]);
  const tree = ui.render({ scope, recordId: "ciel", name: "シエル" });
  assert.equal(tree.props["aria-label"], "シエルの資料内目次");
  const { select } = controls(tree);
  assert.equal(select.props.disabled, false);
  // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明）
  // The options are the destinations' names, without 01 / 02 ordinals.
  assert.deepEqual(
    Array.from(select.props.children, (option) => option.props.children),
    ["基本資料・プロフィール", "人物記録", "追補資料", "因縁・関係性の記録（2件）"],
  );
  for (const target of [title, body, supplement, relations]) {
    assert.equal(target.attributes.get("tabindex"), "-1");
  }
  assert.equal(select.props.children.length, 4);
});

test("a parent scope attached during commit is read after refs become available", () => {
  const ui = guideHarness();
  const scope = { current: null };
  const title = heading("シエル"),
    section = heading("人物記録");
  const tree = ui.render({ scope, recordId: "ciel", name: "シエル" }, () => {
    scope.current = dossier(title, [section]).current;
  });
  assert.equal(controls(tree).select.props.children.length, 2);
  assert.equal(controls(tree).button.props.disabled, false);
  assert.match(source, /useEffect\(\(\) =>/);
  assert.doesNotMatch(source, /useLayoutEffect/);
});

test("selecting a destination preserves native select keyboard behavior until explicit navigation", () => {
  const ui = guideHarness();
  const title = heading("シエル"),
    body = heading("追補資料");
  const props = { scope: dossier(title, [body]), recordId: "ciel", name: "シエル" };
  let tree = ui.render(props);
  controls(tree).select.props.onChange({ currentTarget: { value: "1" } });
  assert.equal(body.events.length, 0, "arrowing in the select never unexpectedly moves focus");
  tree = ui.render(props);
  controls(tree).button.props.onClick();
  assert.deepEqual(body.events, [
    ["scroll", { behavior: "auto", block: "start", inline: "nearest" }],
    ["focus", { preventScroll: true }],
  ]);
  assert.equal(title.events.length, 0);
  assert.doesNotMatch(source, /location\.|history\.|href=|requestAnimationFrame/);
});

test("record switching rebuilds local destinations and restores only assigned focus attributes", () => {
  const ui = guideHarness();
  const title = heading("シエル"),
    preserved = heading("人物記録", "0");
  const scope = dossier(title, [preserved]);
  let tree = ui.render({ scope, recordId: "ciel", name: "シエル" });
  controls(tree).select.props.onChange({ currentTarget: { value: "1" } });
  const nextTitle = heading("ドルミネンス"),
    nextSection = heading("機密記録");
  scope.current = dossier(nextTitle, [nextSection]).current;
  tree = ui.render({ scope, recordId: "dolminence", name: "ドルミネンス" });
  assert.equal(controls(tree).select.props.value, "0");
  assert.equal(title.attributes.has("tabindex"), false);
  assert.equal(preserved.attributes.get("tabindex"), "0");
  controls(tree).button.props.onClick();
  assert.equal(nextTitle.events.length, 2);
  ui.cleanup();
  assert.equal(nextTitle.attributes.has("tabindex"), false);
  assert.equal(nextSection.attributes.has("tabindex"), false);
});

test("stale detached targets and absent content cannot trigger navigation", () => {
  const ui = guideHarness();
  const target = heading("古い資料");
  target.isConnected = false;
  ui.moveToDossierStop(target);
  ui.moveToDossierStop(undefined);
  assert.equal(target.events.length, 0);
  const tree = ui.render({ scope: dossier(null, []), recordId: "empty", name: "資料" });
  assert.equal(controls(tree).select.props.disabled, true);
  assert.equal(controls(tree).button.props.disabled, true);
});
