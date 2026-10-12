import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  CITY_MAPS,
  loadCitySurfaceImages,
  closeCitySurfaceImages,
  cityTexture,
  applyCitySurface,
} from "../src/components/cinematic/rain-city-materials.ts";
import { cityArchitecture } from "../src/components/cinematic/rain-city-architecture.ts";
import { cityRouteAt, cityDamageAt } from "../src/components/cinematic/rain-city-scene.ts";

function loaderFixture() {
  const original = { fetch: globalThis.fetch, decode: globalThis.createImageBitmap };
  const closed = [],
    paths = [];
  globalThis.fetch = async (path) => {
    paths.push(path);
    return { ok: true, blob: async () => ({ path }) };
  };
  globalThis.createImageBitmap = async ({ path }, options) => {
    assert.deepEqual(options, { colorSpaceConversion: "none", imageOrientation: "flipY" });
    return {
      path,
      close() {
        closed.push(path);
      },
    };
  };
  return {
    closed,
    paths,
    restore() {
      globalThis.fetch = original.fetch;
      globalThis.createImageBitmap = original.decode;
    },
  };
}

test("six bounded city maps decode in semantic order and have explicit CPU ownership", async () => {
  const fixture = loaderFixture();
  try {
    const images = await loadCitySurfaceImages();
    assert.deepEqual(
      images.map((image) => image.path),
      CITY_MAPS.map((name) => `/rain-city-materials/${name}`),
    );
    assert.equal(fixture.closed.length, 0);
    closeCitySurfaceImages(images);
    assert.equal(new Set(fixture.closed).size, 6);
    closeCitySurfaceImages(null);
  } finally {
    fixture.restore();
  }
});

test("failed material request closes successes including decodes arriving after abort", async () => {
  const fixture = loaderFixture();
  try {
    let complete;
    globalThis.createImageBitmap = ({ path }) =>
      path.includes("asphalt-albedo")
        ? Promise.reject(new Error("decode"))
        : new Promise((resolve) => {
            const prior = complete;
            complete = () => {
              prior?.();
              resolve({
                path,
                close() {
                  fixture.closed.push(path);
                },
              });
            };
          });
    assert.equal(await loadCitySurfaceImages(), null);
    complete();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fixture.closed.length, 5);
    assert.equal(new Set(fixture.closed).size, 5, "no double-close");
  } finally {
    fixture.restore();
  }
});

test("stalled image decoding reaches its deadline and later bitmaps self-close", async () => {
  const fixture = loaderFixture();
  try {
    const delayed = [];
    globalThis.createImageBitmap = ({ path }) =>
      new Promise((resolve) =>
        delayed.push(() =>
          resolve({
            path,
            close() {
              fixture.closed.push(path);
            },
          }),
        ),
      );
    assert.equal(await loadCitySurfaceImages(5), null);
    delayed.forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fixture.closed.length, 6);
  } finally {
    fixture.restore();
  }
});

test("material textures repeat in linear data space, with only albedo sRGB", () => {
  const normal = cityTexture(undefined, [128, 128, 255, 255]);
  const albedo = cityTexture(undefined, [180, 180, 170, 255], true);
  assert.equal(normal.colorSpace, THREE.NoColorSpace);
  assert.equal(albedo.colorSpace, THREE.SRGBColorSpace);
  assert.equal(normal.wrapS, THREE.RepeatWrapping);
  assert.equal(normal.wrapT, THREE.RepeatWrapping);
  assert.equal(normal.generateMipmaps, true);
  const maps = [albedo, normal, normal];
  const material = applyCitySurface(new THREE.MeshStandardMaterial(), maps, 3);
  const shader = {
    uniforms: {},
    vertexShader: "#include <begin_vertex>",
    fragmentShader:
      "#include <map_fragment>\n#include <normal_fragment_maps>\n#include <roughnessmap_fragment>",
  };
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.cityPeriod.value, 3);
  assert.match(shader.vertexShader, /length\(instanceMatrix\[0\]/);
  assert.doesNotMatch(
    shader.vertexShader,
    /cameraPosition/,
    "fracture textures do not swim with camera",
  );
  assert.match(shader.fragmentShader, /dFdx\(-vViewPosition\)/);
  normal.dispose();
  albedo.dispose();
  material.dispose();
});

test("rigid street architecture has window wells, mullions, roofs and surviving lamp fixtures", () => {
  const build = () => {
    let seed = 73017;
    return cityArchitecture(cityRouteAt, cityDamageAt, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    });
  };
  const city = build();
  assert.deepEqual(city, build(), "geometry is deterministic across replay and capture");
  for (const [kind, blocks] of Object.entries(city)) {
    assert.ok(blocks.length > 0, kind);
    for (const block of blocks) {
      assert.ok(Object.values(block).every(Number.isFinite), kind);
      assert.ok(block.w > 0 && block.h > 0 && block.d > 0, kind);
    }
  }
  assert.ok(city.rooms.length > 80 && city.rooms.length < city.darkRooms.length / 3);
  assert.ok(city.poles.length > city.lamps.length, "ruined neighbourhood has broken poles");
  assert.ok(city.housings.length > city.lamps.length, "service equipment beyond lamp casings");
  assert.ok(city.concrete.length > 2000);
});
