import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/lib/ciel-inferno-renderer.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function harness({ coarse = false, dpr = 1, webgl = true } = {}) {
  const stats = {
    fieldDraws: 0,
    fieldDisposals: 0,
    context2d: Object.create(null),
    pathCalls: [],
    atlasStates: [],
    image: null,
  };
  const count = (name) => {
    stats.context2d[name] = (stats.context2d[name] || 0) + 1;
  };
  const detailContext = new Proxy(
    {
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      fillStyle: "#000",
      strokeStyle: "#000",
      lineWidth: 1,
      moveTo(...points) {
        count("moveTo");
        stats.pathCalls.push(["moveTo", ...points]);
      },
      lineTo(...points) {
        count("lineTo");
        stats.pathCalls.push(["lineTo", ...points]);
      },
      bezierCurveTo(...points) {
        count("bezierCurveTo");
        stats.pathCalls.push(["bezierCurveTo", ...points]);
      },
    },
    {
      get(target, name) {
        if (name in target) return target[name];
        return (..._args) => count(String(name));
      },
      set(target, name, value) {
        target[name] = value;
        return true;
      },
    },
  );
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TRIANGLES: 8,
    DEPTH_TEST: 9,
    BLEND: 10,
    createShader: (type) => ({ type }),
    shaderSource() {},
    compileShader() {},
    getShaderParameter: () => true,
    deleteShader() {},
    createProgram: () => ({}),
    attachShader() {},
    linkProgram() {},
    getProgramParameter: () => true,
    useProgram() {},
    createBuffer: () => ({}),
    bindBuffer() {},
    bufferData() {},
    getAttribLocation: () => 0,
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    getUniformLocation: (_program, name) => ({ name }),
    disable() {},
    viewport() {},
    uniform2f() {},
    uniform1f() {},
    drawArrays() {
      stats.fieldDraws++;
    },
    deleteBuffer() {},
    deleteProgram() {},
    getExtension: () => ({
      loseContext() {
        stats.fieldDisposals++;
      },
    }),
  };
  const listeners = new Map();
  const canvas = (isField) => ({
    width: 0,
    height: 0,
    hidden: false,
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    removeEventListener(type, callback) {
      if (listeners.get(type) === callback) listeners.delete(type);
    },
    getContext(kind) {
      if (kind === "2d") return detailContext;
      if (isField && webgl && /^webgl/.test(kind)) return gl;
      return null;
    },
  });
  const field = canvas(true);
  const detail = canvas(false);
  class MockImage {
    constructor() {
      stats.image = this;
      this.naturalWidth = 0;
      this.naturalHeight = 0;
      this.decode = undefined;
      this.onload = null;
      this.onerror = null;
    }
    set src(value) {
      this._src = value;
    }
    get src() {
      return this._src;
    }
  }
  const exports = {};
  runInNewContext(compiled, {
    exports,
    Image: MockImage,
    Float32Array,
    Math,
    globalThis: { devicePixelRatio: dpr },
  });
  const renderer = exports.createCielInfernoRenderer({
    field,
    detail,
    coarse,
    onFailure() {
      stats.failureCount = (stats.failureCount || 0) + 1;
    },
    onAtlasState(state) {
      stats.atlasStates.push(state);
    },
  });
  return {
    renderer,
    field,
    detail,
    stats,
    listeners,
    sampleLife: exports.sampleCielFireLife,
    sampleArrival: exports.sampleCielBurnArrival,
  };
}

test("burn arrival follows the contact seam and unequal upward fingers, not a radius", () => {
  const { sampleArrival, renderer } = harness();
  for (const [width, height] of [
    [320, 844],
    [1024, 768],
    [1440, 900],
  ]) {
    for (const angle of [-0.65, 2.45]) {
      const g = { width, height, mouthX: width * 0.82, mouthY: height * 0.72, angle };
      const arrivals = [];
      for (let x = 0; x <= 20; x++)
        for (let y = 0; y <= 30; y++) {
          const arrival = sampleArrival((x * width) / 20, (y * height) / 30, g);
          assert.ok(Number.isFinite(arrival) && arrival >= 2.1 && arrival <= 5.8);
          arrivals.push(arrival);
        }
      const coverage = [2.15, 2.5, 3, 4, 5.8].map((t) => arrivals.filter((a) => a <= t).length);
      for (let i = 1; i < coverage.length; i++) assert.ok(coverage[i] > coverage[i - 1]);
      assert.equal(coverage.at(-1), arrivals.length, "full coverage before extinction");
      const above = sampleArrival(g.mouthX, g.mouthY - height * 0.2, g);
      const radius = Math.min(width, height) * 0.15;
      const ring = Array.from({ length: 12 }, (_, i) =>
        sampleArrival(
          g.mouthX + Math.cos((i * Math.PI) / 6) * radius,
          g.mouthY + Math.sin((i * Math.PI) / 6) * radius,
          g,
        ),
      );
      assert.ok(Math.max(...ring) - Math.min(...ring) > 0.15, "equal radius is not equal arrival");
      assert.ok(
        sampleArrival(g.mouthX, g.mouthY, g) < above,
        "contact catches before flame climbs",
      );
    }
  }
  renderer.dispose();
});

test("fallback arrival cells stay contiguous in each column and only grow over time", () => {
  const { sampleArrival, renderer } = harness();
  const profiles = [
    { width: 320, height: 844, mouthY: 0.31 },
    { width: 768, height: 1024, mouthY: 0.31 },
    { width: 1440, height: 900, mouthY: 0.34 },
  ];
  const times = [2.12, 2.3, 2.6, 3.1, 4.2, 5.8];
  for (const profile of profiles) {
    for (const angle of [-0.65, 2.52]) {
      const { width, height } = profile;
      const geometry = {
        width,
        height,
        mouthX: width * 0.73,
        mouthY: height * profile.mouthY,
        angle,
      };
      const previous = Array(48).fill(0);
      for (const time of times) {
        for (let column = 0; column < 48; column++) {
          const burned = [];
          for (let row = 0; row < 72; row++) {
            const arrival = sampleArrival(
              ((column + 0.5) * width) / 48,
              ((row + 0.5) * height) / 72,
              geometry,
            );
            burned.push(arrival <= time);
          }
          const first = burned.indexOf(true);
          const last = burned.lastIndexOf(true);
          const count = first < 0 ? 0 : last - first + 1;
          assert.equal(
            burned.filter(Boolean).length,
            count,
            `${width}x${height}, angle ${angle}, column ${column}, time ${time}: one interval`,
          );
          assert.ok(
            count >= previous[column],
            `${width}x${height}, angle ${angle}, column ${column}: coverage never shrinks`,
          );
          previous[column] = count;
        }
      }
      assert.ok(
        previous.every((count) => count === 72),
        "all rows are burned by 5.8 seconds",
      );
    }
  }
  renderer.dispose();
});

test("fallback mask paths stay finite and inside the viewport while tongues may extend beyond it", () => {
  for (const { width, height } of [
    { width: 320, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    const host = harness({ webgl: false });
    host.renderer.resize({
      width,
      height,
      mouthX: width * 0.73,
      mouthY: height * (width < 700 ? 0.31 : 0.34),
      angle: 2.52,
    });
    host.renderer.render(3300);
    const firstTongue = host.stats.pathCalls.findIndex((call) => call[0] === "bezierCurveTo");
    assert.ok(firstTongue > 0, "the char mask is drawn before flame tongues");
    assert.equal(
      host.stats.pathCalls[firstTongue - 1][0],
      "moveTo",
      "the first tongue starts a separate path",
    );
    const maskCalls = host.stats.pathCalls.slice(0, firstTongue - 1);
    for (const [operation, ...coordinates] of host.stats.pathCalls) {
      assert.ok(
        coordinates.every(Number.isFinite),
        `${operation} has only finite coordinates at ${width}x${height}`,
      );
    }
    for (const [operation, ...coordinates] of maskCalls) {
      assert.ok(operation === "moveTo" || operation === "lineTo");
      for (let index = 0; index < coordinates.length; index += 2) {
        assert.ok(coordinates[index] >= 0 && coordinates[index] <= width, "mask x stays in view");
        assert.ok(
          coordinates[index + 1] >= 0 && coordinates[index + 1] <= height,
          "mask y stays in view",
        );
      }
    }
    host.renderer.dispose();
  }
});

const dimensions = (field, detail) => ({
  field: [field.width, field.height],
  detail: [detail.width, detail.height],
});

test("canvas backing stores respect DPR and per-surface pixel budgets", () => {
  for (const profile of [
    { coarse: false, dpr: 3, width: 2560, height: 1600, budget: 1_300_000, maxRatio: 1.35 },
    { coarse: true, dpr: 3, width: 1280, height: 800, budget: 780_000, maxRatio: 1 },
  ]) {
    const host = harness(profile);
    host.renderer.resize({
      width: profile.width,
      height: profile.height,
      mouthX: profile.width * 0.2,
      mouthY: profile.height * 0.7,
      angle: 0.8,
    });
    const size = dimensions(host.field, host.detail);
    assert.deepEqual(size.field, size.detail, "both layers use one backing-store scale");
    assert.ok(size.field[0] <= profile.width * profile.maxRatio + 1);
    assert.ok(size.field[1] <= profile.height * profile.maxRatio + 1);
    assert.ok(size.field[0] * size.field[1] <= profile.budget + profile.width + profile.height);
    host.renderer.dispose();
  }
});

test("natural frames at the requested phase times stay finite and respect the frame cadence", () => {
  const host = harness({ dpr: 2 });
  host.renderer.resize({ width: 1440, height: 900, mouthX: 220, mouthY: 620, angle: -0.72 });
  const checkpoints = [0, 1800, 3300, 4800, 7000, 9100];
  let previousCalls = 0;
  for (const milliseconds of checkpoints) {
    host.renderer.render(milliseconds);
    const calls = Object.values(host.stats.context2d).reduce((sum, value) => sum + value, 0);
    assert.ok(Number.isFinite(calls));
    assert.ok(calls - previousCalls <= 1000, `bounded canvas calls at ${milliseconds}ms`);
    previousCalls = calls;
  }
  assert.equal(host.stats.fieldDraws, checkpoints.length - 1);
  const before = host.stats.fieldDraws;
  host.renderer.render(9110);
  assert.equal(host.stats.fieldDraws, before, "sub-cadence calls are skipped");
  host.renderer.render(9130);
  assert.equal(host.stats.fieldDraws, before + 1, "the next cadence boundary renders naturally");
  host.renderer.dispose();
});

test("a blocked sprite atlas selects the detailed canvas fallback and keeps phase work bounded", () => {
  const host = harness({ webgl: false });
  host.renderer.resize({ width: 1280, height: 800, mouthX: 240, mouthY: 590, angle: -0.65 });
  host.stats.image.onerror();
  assert.deepEqual(host.stats.atlasStates, ["fallback"]);
  let previousGeometryCalls = 0;
  for (const milliseconds of [1800, 3300, 4800, 7000]) {
    host.renderer.render(milliseconds);
    const geometryCalls =
      (host.stats.context2d.lineTo || 0) + (host.stats.context2d.bezierCurveTo || 0);
    assert.ok(
      geometryCalls >= previousGeometryCalls,
      `fallback detail is drawn by ${milliseconds}ms`,
    );
    assert.ok(
      geometryCalls - previousGeometryCalls <= 2000,
      `bounded path geometry at ${milliseconds}ms`,
    );
    previousGeometryCalls = geometryCalls;
  }
  assert.ok(host.stats.context2d.bezierCurveTo > 0, "fallback includes rising curved flame tips");
  assert.ok(previousGeometryCalls > 100, "fallback contains continuous flame and burn contours");
  assert.equal(host.stats.context2d.drawImage || 0, 0, "a failed atlas is never sampled");
  host.renderer.dispose();
});

test("a delayed valid atlas becomes ready and animates after the effect has begun", () => {
  const host = harness();
  host.renderer.resize({ width: 1280, height: 800, mouthX: 240, mouthY: 590, angle: -0.65 });
  host.renderer.render(1800);
  assert.deepEqual(host.stats.atlasStates, [], "the pending atlas has not been classified early");
  host.stats.image.naturalWidth = 2048;
  host.stats.image.naturalHeight = 512;
  host.stats.image.onload();
  assert.deepEqual(host.stats.atlasStates, ["ready"]);
  host.renderer.render(2100);
  host.renderer.render(2340);
  assert.ok(host.stats.context2d.drawImage > 0, "valid frames are sampled after delayed load");
  host.renderer.dispose();
});

test("dispose is idempotent and prevents all later rendering work", () => {
  const host = harness();
  host.renderer.resize({ width: 1440, height: 900, mouthX: 200, mouthY: 650, angle: 0.4 });
  host.renderer.render(1000);
  host.renderer.render(1030);
  const drawsBeforeDispose = host.stats.fieldDraws;
  const callsBeforeDispose = Object.values(host.stats.context2d).reduce(
    (sum, value) => sum + value,
    0,
  );
  host.renderer.dispose();
  host.renderer.dispose();
  host.renderer.render(3300);
  host.renderer.render(9100);
  host.renderer.resize({ width: 320, height: 844, mouthX: 60, mouthY: 600, angle: 1 });
  const callsAfterDispose = Object.values(host.stats.context2d).reduce(
    (sum, value) => sum + value,
    0,
  );
  assert.equal(host.stats.fieldDraws, drawsBeforeDispose);
  assert.equal(callsAfterDispose, callsBeforeDispose);
  assert.equal(host.stats.fieldDisposals, 1);
  assert.equal(host.field.width, 1);
  assert.equal(host.field.height, 1);
  assert.equal(host.detail.width, 1);
  assert.equal(host.detail.height, 1);
  assert.equal(host.stats.image.onload, null);
  assert.equal(host.stats.image.onerror, null);
});

test("nozzle lights first, closes before travelling gas, and all fire extinguishes", () => {
  const { renderer, sampleLife } = harness();
  assert.equal(sampleLife(0), 0);
  assert.ok(sampleLife(1.5, 0) > sampleLife(1.5, 0.8), "ignition propagates from the mouth");
  assert.equal(sampleLife(3, 0), 1);
  assert.equal(sampleLife(5.6, 0), 0, "source has closed");
  assert.ok(sampleLife(5.6, 1) > 0.8, "previously emitted gas still burns downstream");
  for (const travel of [0, 0.3, 0.8, 1.25]) {
    let previous = 1;
    for (let t = 4.35 + travel; t <= 9.2; t += 0.03) {
      const value = sampleLife(t, travel);
      assert.ok(value <= previous + 1e-9, "cooling does not reignite");
      assert.ok(value >= 0 && value <= 1);
      previous = value;
    }
    assert.equal(sampleLife(7.15, travel), 0);
  }
  renderer.dispose();
});

test("late smoke and ash do not respawn fire sprites after extinction", () => {
  const host = harness();
  host.renderer.resize({ width: 1024, height: 768, mouthX: 740, mouthY: 280, angle: 2.52 });
  host.stats.image.naturalWidth = 2048;
  host.stats.image.naturalHeight = 512;
  host.stats.image.onload();
  host.renderer.render(3000);
  host.renderer.render(3300);
  const litDraws = host.stats.context2d.drawImage;
  assert.ok(litDraws > 0);
  host.renderer.render(7150);
  host.renderer.render(8000);
  host.renderer.render(9100);
  assert.equal(host.stats.context2d.drawImage, litDraws, "cooldown samples no new flames");
  host.renderer.dispose();
});
