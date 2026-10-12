import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import {
  CITY_FLIGHT,
  RainCityScene,
  cityFlightAt,
} from "../src/components/cinematic/rain-city-scene.ts";
import { OPENING_DIVE } from "../src/components/cinematic/opening-timing.ts";

test("the rainy street's landing clock is exactly the handoff's landing clock", () => {
  assert.equal(CITY_FLIGHT.end, OPENING_DIVE.glEnd);
  assert.ok(0 <= CITY_FLIGHT.enter && CITY_FLIGHT.enter < CITY_FLIGHT.clear);
  assert.ok(CITY_FLIGHT.clear < CITY_FLIGHT.exit && CITY_FLIGHT.exit < CITY_FLIGHT.end);
});

test("the flight is deterministic, moves forward continuously and stays within the street", () => {
  let previous = cityFlightAt(0);
  for (let frame = 1; frame <= 420; frame++) {
    const t = (frame / 420) * CITY_FLIGHT.end;
    const state = cityFlightAt(t);
    assert.deepEqual(state, cityFlightAt(t));
    assert.ok(Object.values(state).every(Number.isFinite));
    assert.ok(state.z < previous.z, `forward motion at ${t}`);
    assert.ok(Math.abs(state.x) < 2 && state.y > 2 && state.y < 4, `street clearance at ${t}`);
    assert.ok(Math.abs(state.x - previous.x) < 0.1 && Math.abs(state.y - previous.y) < 0.1);
    assert.ok(Math.abs(state.opacity - previous.opacity) < 0.06, `continuous dissolve at ${t}`);
    previous = state;
  }
  assert.deepEqual(cityFlightAt(-1), cityFlightAt(0));
  assert.deepEqual(cityFlightAt(CITY_FLIGHT.end + 10), cityFlightAt(CITY_FLIGHT.end));
});

test("street exposure rises once, holds, then dissolves fully before the page receives input", () => {
  let peakSeen = false;
  let descending = false;
  let prior = 0;
  for (let frame = 0; frame <= 420; frame++) {
    const { opacity } = cityFlightAt((frame / 420) * CITY_FLIGHT.end);
    assert.ok(opacity >= 0 && opacity <= 1);
    if (opacity === 1) peakSeen = true;
    if (opacity < prior) descending = true;
    if (descending) assert.ok(opacity <= prior);
    prior = opacity;
  }
  assert.ok(peakSeen);
  assert.equal(cityFlightAt(0).opacity, 0);
  assert.equal(cityFlightAt(CITY_FLIGHT.end).opacity, 0);
});

test("draw skips invisible and disposed frames, with no independent animation loop", () => {
  let rendered = 0;
  const fake = {
    disposed: false,
    canvas: { style: {} },
    time: { value: 0 },
    camera: new THREE.PerspectiveCamera(),
    scene: {},
    renderer: {
      render() {
        rendered++;
      },
    },
  };
  RainCityScene.prototype.draw.call(fake, 0);
  RainCityScene.prototype.draw.call(fake, CITY_FLIGHT.end);
  assert.equal(rendered, 0);
  RainCityScene.prototype.draw.call(fake, 1.5);
  assert.equal(rendered, 1);
  assert.equal(fake.time.value, 1.5);
  fake.disposed = true;
  RainCityScene.prototype.draw.call(fake, 1.6);
  assert.equal(rendered, 1);
  const source = readFileSync(
    new URL("../src/components/cinematic/rain-city-scene.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /requestAnimationFrame\(|setAnimationLoop\(|setInterval\(/);
});

test("resize caps physical pixels, follows quality rungs and does nothing after disposal", () => {
  const originalDpr = Object.getOwnPropertyDescriptor(globalThis, "devicePixelRatio");
  Object.defineProperty(globalThis, "devicePixelRatio", { value: 3, configurable: true });
  try {
    const sizes = [];
    const reflectionSizes = [];
    const fake = {
      disposed: false,
      reflection: {
        getRenderTarget() {
          return {
            setSize(w, h) {
              reflectionSizes.push([w, h]);
            },
          };
        },
      },
      renderer: {
        setSize(w, h, updateStyle) {
          sizes.push([w, h, updateStyle]);
        },
      },
      camera: new THREE.PerspectiveCamera(),
    };
    RainCityScene.prototype.resize.call(fake, 390, 844, 0);
    assert.ok(sizes[0][0] * sizes[0][1] <= 752000);
    assert.equal(sizes[0][2], false);
    assert.ok(reflectionSizes[0][0] * reflectionSizes[0][1] < sizes[0][0] * sizes[0][1]);
    assert.equal(fake.camera.aspect, 390 / 844);
    RainCityScene.prototype.resize.call(fake, 390, 844, 1);
    assert.ok(sizes[1][0] < sizes[0][0] && sizes[1][1] < sizes[0][1]);
    RainCityScene.prototype.resize.call(fake, 3840, 2160, 0);
    assert.ok(sizes[2][0] * sizes[2][1] <= 1604000);
    fake.disposed = true;
    RainCityScene.prototype.resize.call(fake, 100, 100);
    assert.equal(sizes.length, 3);
  } finally {
    if (originalDpr) Object.defineProperty(globalThis, "devicePixelRatio", originalDpr);
    else delete globalThis.devicePixelRatio;
  }
});

test("dispose releases shared geometry, materials, instance buffers and context exactly once", () => {
  const calls = [];
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const instances = new THREE.InstancedMesh(geometry, material, 1);
  geometry.addEventListener("dispose", () => calls.push("geometry"));
  material.addEventListener("dispose", () => calls.push("material"));
  instances.addEventListener("dispose", () => calls.push("instances"));
  const scene = new THREE.Scene();
  scene.add(instances);
  const fake = {
    disposed: false,
    geometries: new Set([geometry]),
    materials: new Set([material]),
    scene,
    reflection: {
      dispose() {
        calls.push("reflection");
      },
    },
    renderer: {
      dispose() {
        calls.push("renderer");
      },
      forceContextLoss() {
        calls.push("context");
      },
    },
    canvas: {
      remove() {
        calls.push("canvas");
      },
    },
  };
  RainCityScene.prototype.dispose.call(fake);
  RainCityScene.prototype.dispose.call(fake);
  for (const resource of [
    "geometry",
    "material",
    "instances",
    "reflection",
    "renderer",
    "context",
    "canvas",
  ])
    assert.equal(calls.filter((item) => item === resource).length, 1, resource);
  assert.equal(fake.disposed, true);
});
