import assert from "node:assert/strict";
import test from "node:test";
import { detachedDOMReport } from "./heap-retainers.mjs";

// Minimal V8-format snapshots, with edges grouped by their owning node. The
// numeric offsets deliberately use the metadata rather than test-only IDs.
function snapshotFor(records, { detachedness = true, reorderFields = false } = {}) {
  const nodeFields = reorderFields
    ? ["name", "edge_count", "type", "id", "self_size"]
    : ["type", "name", "id", "self_size", "edge_count"];
  if (detachedness) nodeFields.push("detachedness");
  const edgeFields = reorderFields
    ? ["to_node", "name_or_index", "type"]
    : ["type", "name_or_index", "to_node"];
  const nodeTypes = ["synthetic", "native", "object"];
  const edgeTypes = ["property", "internal", "element", "hidden", "weak"];
  const strings = [];
  const stringIndex = (value) => {
    let index = strings.indexOf(value);
    if (index < 0) {
      index = strings.length;
      strings.push(value);
    }
    return index;
  };
  const nodes = records.flatMap((record, index) => {
    const values = {
      type: nodeTypes.indexOf(record.type ?? "native"),
      name: stringIndex(record.name),
      id: index * 2 + 1,
      self_size: 0,
      edge_count: record.edges?.length ?? 0,
      detachedness: record.detachedness ?? 0,
    };
    return nodeFields.map((field) => values[field]);
  });
  const edges = records.flatMap((record) =>
    (record.edges ?? []).flatMap(([type, name, to]) => {
      const values = {
        type: edgeTypes.indexOf(type),
        name_or_index: type === "element" || type === "hidden" ? name : stringIndex(name),
        to_node: to * nodeFields.length,
      };
      return edgeFields.map((field) => values[field]);
    }),
  );
  return {
    snapshot: {
      meta: {
        node_fields: nodeFields,
        node_types: nodeFields.map((field) => (field === "type" ? nodeTypes : "number")),
        edge_fields: edgeFields,
        edge_types: edgeFields.map((field) => (field === "type" ? edgeTypes : "number")),
      },
    },
    nodes,
    edges,
    strings,
  };
}

const mainName = '<main id="top" class="rxs-page rxs-rexonance-page">';

test("an attached page and detached JavaScript wrappers are not detached native DOM", () => {
  const report = detachedDOMReport(
    snapshotFor([
      { name: "(root)", type: "synthetic", edges: [["property", "document", 1]] },
      { name: mainName, detachedness: 1 },
      { name: mainName, type: "object", detachedness: 2 },
      { name: "Detached HTMLImageElement", detachedness: 0 },
    ]),
  );
  assert.deepEqual(report, {
    detachedNodes: 0,
    detachedMains: 0,
    histogram: {},
    retainers: [],
  });
});

test("detachedness 2 counts native DOM, including descendants and duplicate labels", () => {
  const report = detachedDOMReport(
    snapshotFor([
      { name: "(root)", type: "synthetic" },
      { name: "<img>", detachedness: 2 },
      { name: "<img>", detachedness: 2 },
      { name: "<figure>", detachedness: 2 },
      { name: "<main class=other-page>", detachedness: 2 },
      { name: mainName, type: "object", detachedness: 2 },
      { name: mainName, detachedness: 1 },
    ]),
  );
  assert.equal(report.detachedNodes, 4);
  assert.equal(report.detachedMains, 0);
  assert.deepEqual(report.histogram, {
    "<img>": 2,
    "<figure>": 1,
    "<main class=other-page>": 1,
  });
  assert.deepEqual(report.retainers, []);
});

test("the native viewport-listener retaining path is traced to the root without following cycles", () => {
  const report = detachedDOMReport(
    snapshotFor([
      { name: "(root)", type: "synthetic", edges: [["property", "document", 1]] },
      { name: "HTMLDocument", edges: [["internal", "media_query_matcher", 2]] },
      { name: "MediaQueryMatcher", edges: [["element", 7, 3]] },
      {
        name: "HTMLImageElement::ViewportChangeListener",
        edges: [["hidden", 0, 4]],
      },
      { name: "<img sizes=auto>", detachedness: 2, edges: [["internal", "parent", 5]] },
      {
        name: "<figure>",
        detachedness: 2,
        edges: [
          ["internal", "child", 4],
          ["internal", "parent", 6],
        ],
      },
      { name: mainName, detachedness: 2, edges: [["internal", "child", 5]] },
    ]),
  );
  assert.equal(report.detachedNodes, 3);
  assert.equal(report.detachedMains, 1);
  assert.deepEqual(report.retainers, [
    {
      target: mainName,
      path: [
        { owner: "(root)", edge: "document" },
        { owner: "HTMLDocument", edge: "media_query_matcher" },
        { owner: "MediaQueryMatcher", edge: "[7]" },
        { owner: "HTMLImageElement::ViewportChangeListener", edge: "[0]" },
        { owner: "<img sizes=auto>", edge: "parent" },
        { owner: "<figure>", edge: "parent" },
        { owner: mainName },
      ],
    },
  ]);
});

test("a shorter weak edge is excluded in favor of the actual strong retaining path", () => {
  const report = detachedDOMReport(
    snapshotFor(
      [
        {
          name: "(root)",
          type: "synthetic",
          edges: [
            ["weak", "not-an-owner", 2],
            ["property", "document", 1],
          ],
        },
        { name: "HTMLDocument", edges: [["internal", "retained-page", 2]] },
        { name: mainName, detachedness: 2 },
      ],
      { reorderFields: true },
    ),
  );
  assert.deepEqual(report.retainers[0].path, [
    { owner: "(root)", edge: "document" },
    { owner: "HTMLDocument", edge: "retained-page" },
    { owner: mainName },
  ]);
});

test("a weak-only reference is counted as detached but not misreported as a root owner", () => {
  const report = detachedDOMReport(
    snapshotFor([
      { name: "(root)", type: "synthetic", edges: [["weak", "only-weak", 1]] },
      { name: mainName, detachedness: 2 },
    ]),
  );
  assert.equal(report.detachedMains, 1);
  assert.deepEqual(report.retainers, [{ target: mainName, path: [] }]);
});

test("older heap metadata falls back to Detached native names only", () => {
  const detachedName = `Detached ${mainName}`;
  const report = detachedDOMReport(
    snapshotFor(
      [
        { name: "(root)", type: "synthetic", edges: [["property", "page", 1]] },
        { name: detachedName },
        { name: mainName },
        { name: "Detached HTMLImageElement", type: "object" },
      ],
      { detachedness: false },
    ),
  );
  assert.equal(report.detachedNodes, 1);
  assert.equal(report.detachedMains, 1);
  assert.deepEqual(report.retainers[0].path, [
    { owner: "(root)", edge: "page" },
    { owner: detachedName },
  ]);
});

test("all detached pages are counted even when retaining-path samples are capped", () => {
  const report = detachedDOMReport(
    snapshotFor([
      {
        name: "(root)",
        type: "synthetic",
        edges: [
          ["element", 0, 1],
          ["element", 1, 2],
          ["element", 2, 3],
        ],
      },
      { name: mainName, detachedness: 2 },
      { name: mainName, detachedness: 2 },
      { name: mainName, detachedness: 2 },
    ]),
  );
  assert.equal(report.detachedNodes, 3);
  assert.equal(report.detachedMains, 3);
  assert.equal(report.histogram[mainName], 3);
  assert.equal(report.retainers.length, 2);
});
