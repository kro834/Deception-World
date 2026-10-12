import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import {
  CITY_FLIGHT,
  CITY_IMPACTS,
  RainCityScene,
  cityFlightAt,
  cityRouteAt,
  cityTimeAt,
  cityDamageAt,
  fragmentAt,
} from "../src/components/cinematic/rain-city-scene.ts";

test("the retained rainy street has its independent flight clock", () => {
  assert.equal(CITY_FLIGHT.end, 5.6);
  assert.ok(0 <= CITY_FLIGHT.enter && CITY_FLIGHT.enter < CITY_FLIGHT.clear);
  assert.ok(CITY_FLIGHT.clear < CITY_FLIGHT.exit && CITY_FLIGHT.exit < CITY_FLIGHT.end);
});

test("the flight is deterministic and follows the curved street with continuous acceleration", () => {
  let previous = cityFlightAt(0);
  let speed = 0;
  for (let frame = 1; frame <= 420; frame++) {
    const t = (frame / 420) * CITY_FLIGHT.end;
    const state = cityFlightAt(t);
    assert.deepEqual(state, cityFlightAt(t));
    assert.ok(Object.values(state).every(Number.isFinite));
    assert.ok(state.z < previous.z, `forward motion at ${t}`);
    assert.ok(state.y > 2 && state.y < 4, `street clearance at ${t}`);
    const path = cityRouteAt(state.distance);
    assert.equal(state.x, path.x);
    assert.equal(state.z, path.z);
    const travel = Math.hypot(state.x - previous.x, state.z - previous.z);
    assert.ok(travel > speed * 0.995, `speed increases even while turning at ${t}`);
    speed = travel;
    assert.ok(Math.abs(state.heading - previous.heading) < 0.04);
    assert.ok(Math.abs(state.bank) < 0.12);
    assert.ok(Math.abs(state.opacity - previous.opacity) < 0.06, `continuous dissolve at ${t}`);
    previous = state;
  }
  assert.deepEqual(cityFlightAt(-1), cityFlightAt(0));
  assert.deepEqual(cityFlightAt(CITY_FLIGHT.end + 10), cityFlightAt(CITY_FLIGHT.end));
});

test("the camera turns into a second street, then straightens without sideways sliding", () => {
  assert.equal(cityRouteAt(35).heading, 0);
  assert.ok(cityRouteAt(105).heading > Math.PI / 3);
  assert.ok(cityRouteAt(200).heading < 0.25);
  for (const s of [55, 75, 100, 145, 170, 210]) {
    const a = cityRouteAt(s),
      b = cityRouteAt(s + 0.1);
    const direction = Math.atan2(b.x - a.x, a.z - b.z);
    assert.ok(Math.abs(direction - a.heading) < 0.025, `camera tangent at ${s}`);
  }
});

test("later districts are increasingly devastated and both collisions remain fully visible", () => {
  let last = 0;
  for (let s = 0; s <= 250; s++) {
    const damage = cityDamageAt(s);
    assert.ok(damage >= last && damage < 1);
    last = damage;
  }
  assert.ok(cityDamageAt(240) > cityDamageAt(20) + 0.7);
  for (const distance of CITY_IMPACTS) {
    const t = cityTimeAt(distance),
      state = cityFlightAt(t);
    assert.ok(Math.abs(state.distance - distance) < 0.000001);
    assert.equal(state.opacity, 1);
    assert.ok(t + 0.2 < CITY_FLIGHT.exit, "impact is not hidden by the landing dissolve");
  }
});

test("walls split outward on impact, fall, and rewind to their untouched pose", () => {
  const fragment = {
    x: 5,
    y: 12,
    z: -50,
    w: 2,
    h: 2,
    d: 0.5,
    yaw: 0.3,
    tilt: 0,
    start: 3,
    vx: 12,
    vy: 6,
    vz: -8,
    spin: 1.2,
  };
  const before = fragmentAt(fragment, 2);
  assert.equal(before.x, fragment.x);
  assert.equal(before.y, fragment.y);
  const impact = fragmentAt(fragment, 3.4);
  assert.ok(impact.x > before.x && impact.z < before.z && impact.tilt > before.tilt);
  assert.equal(fragmentAt(fragment, 10).y, fragment.h * 0.3);
  assert.deepEqual(fragmentAt(fragment, 2), before, "audit seek / compile warmup is reversible");
  assert.equal(fragment.x, 5, "the base pose is never mutated");
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
    heading: { value: 0 },
    fragments: [],
    destruction: [],
    debris: { instanceMatrix: {} },
    headlight: new THREE.PointLight(),
    updateLighting() {},
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

test("shadow-pool membership fades continuously without dimming the six street lights", () => {
  const fake = {
    lamps: [-30, -12, 0, 12, 30, 45].map((x) => ({ x, y: 7, z: 0 })),
    streetLights: Array.from({ length: 6 }, () => new THREE.SpotLight(0xffffff, 210)),
    lightPositions: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
  };
  const at = (x) => {
    RainCityScene.prototype.updateLighting.call(fake, x, 0);
    return new Map(
      fake.streetLights.slice(0, 2).map((light) => [light.position.x, light.shadow.intensity]),
    );
  };
  const before = at(-0.01),
    tie = at(0),
    after = at(0.01);
  assert.equal(tie.get(0), 1, "the nearest lamp keeps its shadow");
  assert.equal(tie.get(-12), 0, "the departing shadow vanishes at the tie");
  assert.ok(before.get(-12) < 0.001 && after.get(12) < 0.001);
  assert.deepEqual(at(-0.01), before, "a replay seeks to identical shadow strengths");
  assert.ok(fake.streetLights.every((light) => light.intensity === 210));
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
      dustPixels: { value: 0 },
      reflectionTexel: { value: new THREE.Vector2() },
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
  const texture = new THREE.Texture();
  const light = new THREE.SpotLight();
  light.shadow.dispose = () => calls.push("shadow");
  const instances = new THREE.InstancedMesh(geometry, material, 1);
  geometry.addEventListener("dispose", () => calls.push("geometry"));
  material.addEventListener("dispose", () => calls.push("material"));
  texture.addEventListener("dispose", () => calls.push("texture"));
  instances.addEventListener("dispose", () => calls.push("instances"));
  const scene = new THREE.Scene();
  scene.add(instances);
  const fake = {
    disposed: false,
    geometries: new Set([geometry]),
    materials: new Set([material]),
    textures: new Set([texture]),
    streetLights: [light],
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
    "texture",
    "shadow",
    "instances",
    "reflection",
    "renderer",
    "context",
    "canvas",
  ])
    assert.equal(calls.filter((item) => item === resource).length, 1, resource);
  assert.equal(fake.disposed, true);
});
