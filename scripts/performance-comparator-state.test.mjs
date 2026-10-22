import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const cases = [
  {
    file: "rexonance-saga",
    component: "RexonancePerformance",
    page: "RexonanceSaga",
    catalog: "PERFORMANCE_BASELINES",
    state: "performanceBaseline",
    setter: "setPerformanceBaseline",
    initial: "extreme",
    values: ["vertex", "vinculum", "extreme"],
  },
  {
    file: "extreme-saga",
    component: "ExtremePerformance",
    page: "ExtremeSaga",
    catalog: "COMPARISONS",
    state: "baseline",
    setter: "setBaseline",
    initial: "diluculum",
    values: ["diluculum", "vinculum"],
    buttons: true,
  },
];

function harness(config) {
  const source = readFileSync(
    new URL(`../src/components/${config.file}/${config.file}.tsx`, import.meta.url),
    "utf8",
  );
  const tree = ts.createSourceFile(
    "comparison.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const statements = tree.statements.filter(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((declaration) =>
        [config.catalog, config.component, "releaseControlFocus"].includes(
          declaration.name.getText(tree),
        ),
      ),
  );
  assert.equal(statements.length, 3);
  const compiled = ts.transpileModule(
    `${statements.map((node) => node.getText(tree)).join("\n")}\nglobalThis.control = ${config.component}; globalThis.catalog = ${config.catalog};`,
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    },
  ).outputText;
  const frames = [];
  let state;
  let statePresent = false;
  let reference;
  let memoCalls = 0;
  const context = {
    React,
    memo: (component) => {
      memoCalls++;
      return component;
    },
    useState(initial) {
      if (!statePresent) {
        state = initial;
        statePresent = true;
      }
      return [
        state,
        (value) => {
          state = typeof value === "function" ? value(state) : value;
        },
      ];
    },
    useRef: (initial) => (reference ??= { current: initial }),
    window: {
      requestAnimationFrame: (callback) => {
        frames.push(callback);
      },
    },
    document: { activeElement: null },
  };
  runInNewContext(compiled, context);
  assert.equal(memoCalls, 1, "the actual chapter must use memo");
  return {
    source,
    context,
    frames,
    render: () => context.control(),
    flush: () => {
      frames.splice(0).forEach((callback) => callback());
    },
  };
}

function nodes(root, predicate) {
  const result = [];
  function visit(node) {
    if (!React.isValidElement(node)) return;
    if (predicate(node)) result.push(node);
    React.Children.forEach(node.props.children, visit);
  }
  visit(root);
  return result;
}
const byClass = (root, className) =>
  nodes(root, (node) => node.props.className?.split(" ").includes(className))[0];
function text(root) {
  if (root == null || typeof root === "boolean") return "";
  if (Array.isArray(root)) return root.map(text).join("");
  return React.isValidElement(root) ? text(root.props.children) : String(root);
}

function selectedBaseline(root, config) {
  if (!config.buttons) return nodes(root, (node) => node.type === "select")[0].props.value;
  const group = byClass(root, "exs-opponent-options");
  assert.equal(group.props.role, "group");
  assert.equal(group.props["aria-labelledby"], "exs-opponent-label");
  assert.equal(
    text(nodes(root, (node) => node.props.id === "exs-opponent-label")[0]).trim(),
    "比較する相手",
  );
  const buttons = nodes(group, (node) => node.type === "button");
  assert.deepEqual(
    buttons.map((button) => button.key),
    config.values,
  );
  buttons.forEach((button) => assert.equal(button.props.type, "button"));
  const selected = buttons.filter((button) => button.props["aria-pressed"] === true);
  assert.equal(
    selected.length,
    1,
    "exactly one of the always-present opponent buttons is selected",
  );
  return selected[0].key;
}

function changeBaseline(root, config, value) {
  if (config.buttons) {
    const button = nodes(
      byClass(root, "exs-opponent-options"),
      (node) => node.type === "button" && node.key === value,
    )[0];
    button.props.onClick();
    return;
  }
  const select = nodes(root, (node) => node.type === "select")[0];
  const event = { currentTarget: { value } };
  select.props.onInput?.(event);
  select.props.onChange(event);
}

for (const config of cases) {
  test(`${config.component}: all baseline changes retain values, row order, keys and live semantics`, () => {
    const h = harness(config);
    let root = h.render();
    assert.equal(selectedBaseline(root, config), config.initial);
    for (const value of [...config.values, ...config.values.toReversed()]) {
      changeBaseline(root, config, value);
      root = h.render();
      assert.equal(root.type, "section");
      assert.equal(root.props.id, "performance");
      assert.equal(root.props.className, "rxs-performance rxs-section");
      assert.deepEqual(
        React.Children.toArray(root.props.children).map((node) => node.type),
        ["header", "div", "div", "p"],
      );
      assert.equal(selectedBaseline(root, config), value);
      const metrics = byClass(root, "rxs-comparison-metrics");
      assert.equal(metrics.key, config.file === "rexonance-saga" ? null : value);
      assert.equal(metrics.props["data-baseline"], value);
      const expected = h.context.catalog[value];
      if (config.buttons) {
        assert.equal(
          metrics.props["aria-live"],
          undefined,
          "do not announce the whole four-row catalog",
        );
        assert.equal(metrics.props["aria-atomic"], undefined);
        const statuses = nodes(root, (node) => node.props.role === "status");
        assert.equal(statuses.length, 1);
        assert.equal(text(statuses[0]), `${expected.label}を基準に比較しています。`);
      } else {
        assert.equal(metrics.props["aria-live"], "polite");
        assert.equal(metrics.props["aria-atomic"], "true");
      }
      const rows = nodes(metrics, (node) => node.type === "article");
      assert.equal(rows.length, expected.metrics.length);
      expected.metrics.forEach((metric, index) => {
        const row = rows[index];
        assert.equal(row.key, config.file === "rexonance-saga" ? `${value}-${metric.label}` : metric.label);
        for (const label of [
          metric.label,
          metric.current,
          metric.previous,
          metric.relative,
          metric.multiplier,
          metric.delta,
        ])
          assert.ok(text(row).includes(label), `${value}: ${label}`);
        const bars = byClass(row, "rxs-bars");
        assert.ok(bars.props["aria-label"].includes(expected.label));
        const baselineBar = byClass(row, "is-extreme");
        assert.equal(baselineBar.props.style.width, `${metric.bar ?? metric.baselineBar}%`);
      });
      assert.equal(byClass(root, "rxs-processing-comparison").key, `${value}-processing`);
      assert.ok(text(byClass(root, "rxs-comparison-formula")).includes(`${expected.label}＝100%`));
      if (config.file === "rexonance-saga")
        assert.ok(text(root.props.children[0]).includes(expected.label));
      const html = renderToStaticMarkup(root);
      assert.ok(html.includes('id="performance"'));
      assert.ok(html.includes(config.buttons ? 'role="status"' : 'aria-live="polite"'));
      assert.equal((html.match(/<select\b/g) || []).length, config.buttons ? 0 : 1);
    }
  });

  test(`${config.component}: baseline state and pointer refs do not belong to the page`, () => {
    const h = harness(config);
    const parent = h.source.slice(h.source.indexOf(`export function ${config.page}()`));
    assert.ok(parent.includes(`<${config.component} />`));
    assert.ok(!parent.includes(config.setter));
    assert.ok(!parent.includes(`[${config.state},`));
    assert.ok(!parent.includes("activeComparison"));
    assert.ok(!parent.includes("activePerformanceBaseline"));
    assert.ok(!parent.includes("selectPointerInteractionRef"));
  });
}

test("Extreme opponent buttons preserve both keyboard and pointer focus while updating the real comparison", () => {
  const h = harness(cases[1]);
  const control = {
    blurCount: 0,
    blur() {
      this.blurCount++;
    },
  };
  h.context.document.activeElement = control;
  for (const [value, detail] of [
    ["vinculum", 0],
    ["diluculum", 1],
    ["vinculum", 1],
    ["diluculum", 0],
  ]) {
    const root = h.render();
    const button = nodes(
      byClass(root, "exs-opponent-options"),
      (node) => node.type === "button" && node.key === value,
    )[0];
    const event = { currentTarget: control, detail, key: "Enter" };
    if (detail === 0) button.props.onKeyDown?.(event);
    else {
      button.props.onPointerDown?.(event);
      button.props.onPointerUp?.(event);
    }
    button.props.onClick(event);
    h.flush();
    assert.equal(control.blurCount, 0, "neither input method forcibly blurs the chosen button");
    assert.equal(h.context.document.activeElement, control);
    const changed = h.render();
    assert.equal(selectedBaseline(changed, cases[1]), value);
    assert.equal(byClass(changed, "rxs-comparison-metrics").props["data-baseline"], value);
    assert.equal(
      text(nodes(changed, (node) => node.props.role === "status")[0]),
      `${h.context.catalog[value].label}を基準に比較しています。`,
    );
  }
});

test("Rex comparison retains native input/change synchronization and pointer focus marker", () => {
  const h = harness(cases[0]);
  let root = h.render();
  const control = { value: "vertex", dataset: {} };
  const select = nodes(root, (node) => node.type === "select")[0];
  select.props.onPointerDown({ currentTarget: control });
  assert.equal(control.dataset.pointerFocus, "true");
  select.props.onInput({ currentTarget: control });
  root = h.render();
  assert.equal(byClass(root, "rxs-comparison-metrics").props["data-baseline"], "vertex");
  control.value = "vinculum";
  select.props.onChange({ currentTarget: control });
  root = h.render();
  assert.equal(byClass(root, "rxs-comparison-metrics").props["data-baseline"], "vinculum");
});
