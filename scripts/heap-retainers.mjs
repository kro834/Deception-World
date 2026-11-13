// V8/Chromium heap data only: never retain a live browser Element while measuring.
// Warm-up may release canvas backing stores. Permit that bounded change in the
// labels without permitting a new image, listener, or growing native cohort.
export function detachedResourceGrowth(before, after) {
  const growth = [];
  if (after.detachedNodes > before.detachedNodes)
    growth.push({ target: "total", before: before.detachedNodes, after: after.detachedNodes });
  const canvasSize = (label) => {
    if (!label.startsWith("<canvas ")) return null;
    const width = label.match(/\bwidth="(\d+)"/);
    const height = label.match(/\bheight="(\d+)"/);
    return width && height ? [Number(width[1]), Number(height[1])] : null;
  };
  let released = Object.entries(before.histogram).reduce((sum, [label, count]) => {
    const size = canvasSize(label);
    return (
      sum +
      (size?.every((value) => value > 0) ? Math.max(0, count - (after.histogram[label] ?? 0)) : 0)
    );
  }, 0);
  for (const [label, count] of Object.entries(after.histogram)) {
    const previous = before.histogram[label] ?? 0;
    if (count <= previous) continue;
    const size = canvasSize(label);
    if (size?.every((value) => value === 0) && count - previous <= released) {
      released -= count - previous;
      continue;
    }
    growth.push({ target: label, before: previous, after: count });
  }
  return growth;
}

export function detachedDOMReport(snapshot, { allRetainers = false } = {}) {
  const { nodes, edges, strings } = snapshot;
  const meta = snapshot.snapshot.meta;
  const nf = meta.node_fields.length;
  const ef = meta.edge_fields.length;
  const field = (name) => meta.node_fields.indexOf(name);
  const type = field("type");
  const name = field("name");
  const detached = field("detachedness");
  const count = field("edge_count");
  const edgeType = meta.edge_fields.indexOf("type");
  const edgeName = meta.edge_fields.indexOf("name_or_index");
  const edgeTo = meta.edge_fields.indexOf("to_node");
  const nodeTypes = meta.node_types[type];
  const edgeTypes = meta.edge_types[edgeType];
  const size = nodes.length / nf;
  const nodeName = (i) => strings[nodes[i * nf + name]];
  const detachedNodes = [];
  const histogram = {};
  for (let i = 0; i < size; i++) {
    const label = nodeName(i);
    if (
      nodeTypes[nodes[i * nf + type]] === "native" &&
      (detached >= 0 ? nodes[i * nf + detached] === 2 : label.startsWith("Detached "))
    ) {
      detachedNodes.push(i);
      histogram[label] = (histogram[label] ?? 0) + 1;
    }
  }
  const mains = detachedNodes.filter((i) => /<main\b.*\brxs-page\b/.test(nodeName(i)));
  const report = {
    detachedNodes: detachedNodes.length,
    detachedMains: mains.length,
    histogram,
    retainers: [],
  };
  // Full audits must inspect every off-document resource, including a leak that
  // happens to appear after the diagnostic sample limit.
  const targets = allRetainers ? detachedNodes : mains.slice(0, 2);
  if (!targets.length) return report;

  // Reverse only strong edges; a WeakRef must not be presented as a leak owner.
  const starts = new Uint32Array(size + 1);
  for (let e = 0; e < edges.length; e += ef)
    if (edgeTypes[edges[e + edgeType]] !== "weak") starts[edges[e + edgeTo] / nf + 1]++;
  for (let i = 0; i < size; i++) starts[i + 1] += starts[i];
  const from = new Uint32Array(starts[size]);
  const indices = new Uint32Array(starts[size]);
  const cursor = starts.slice();
  let e = 0;
  for (let i = 0; i < size; i++) {
    const end = e + nodes[i * nf + count] * ef;
    for (; e < end; e += ef) {
      if (edgeTypes[edges[e + edgeType]] === "weak") continue;
      const to = edges[e + edgeTo] / nf;
      const slot = cursor[to]++;
      from[slot] = i;
      indices[slot] = e;
    }
  }
  for (const target of targets) {
    const next = new Int32Array(size).fill(-1);
    const via = new Int32Array(size).fill(-1);
    const queue = [target];
    next[target] = target;
    for (let q = 0; q < queue.length && next[0] < 0; q++) {
      const current = queue[q];
      for (let r = starts[current]; r < starts[current + 1]; r++) {
        const owner = from[r];
        if (next[owner] >= 0) continue;
        next[owner] = current;
        via[owner] = indices[r];
        queue.push(owner);
      }
    }
    const path = [];
    if (next[0] >= 0) {
      let i = 0;
      while (i !== target) {
        const edge = via[i];
        const kind = edgeTypes[edges[edge + edgeType]];
        const label = edges[edge + edgeName];
        path.push({
          owner: nodeName(i),
          edge: kind === "element" || kind === "hidden" ? `[${label}]` : strings[label],
        });
        i = next[i];
      }
      path.push({ owner: nodeName(target) });
    }
    report.retainers.push({ target: nodeName(target), path });
  }
  return report;
}
