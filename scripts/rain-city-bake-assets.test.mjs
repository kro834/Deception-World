import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const runtime = JSON.parse(await read("public/rain-city-materials/manifest.json"));
const provenance = JSON.parse(await read("design/rain-city-materials/manifest.json"));
const expectedPaths = ["concrete", "asphalt"].flatMap((material) =>
  ["albedo.webp", "normal.png", "roughness.png"].map(
    (channel) => `/rain-city-materials/${material}-${channel}`,
  ),
);

test("rain-city bake manifests cover exactly the six public material maps", async () => {
  assert.equal(runtime.schemaVersion, 1);
  assert.deepEqual(runtime.assets.map((asset) => asset.path).sort(), [...expectedPaths].sort());
  assert.deepEqual(
    await readdir(new URL("public/rain-city-materials/", root)),
    [...expectedPaths.map((path) => path.split("/").at(-1)), "manifest.json"].sort(),
  );
  assert.deepEqual(
    runtime.assets,
    provenance.assets.map(({ cyclesBakeSha256, ...asset }) => {
      assert.match(cyclesBakeSha256, /^[a-f0-9]{64}$/);
      return asset;
    }),
  );
  assert.equal(runtime.normalConvention, "Tangent OpenGL +X +Y +Z");
  assert.equal(provenance.normalConvention, runtime.normalConvention);
  assert.equal(provenance.engine, "CYCLES");
  assert.equal(provenance.seed, 73017);
});

test("rain-city generator checksum matches both provenance and runtime manifests", async () => {
  assert.equal(runtime.generator, "scripts/build-rain-city-materials.py");
  assert.equal(provenance.generator, runtime.generator);
  const digest = hash(await read(runtime.generator));
  assert.equal(runtime.generatorSha256, digest);
  assert.equal(provenance.generatorSha256, digest);
});

for (const asset of runtime.assets) {
  test(`rain-city asset integrity and texture interpretation: ${asset.path}`, async () => {
    assert.ok(
      expectedPaths.includes(asset.path),
      "only explicitly allowed public paths may be read",
    );
    const bytes = await read(`public${asset.path}`);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(hash(bytes), asset.sha256);
    const image = sharp(bytes);
    const metadata = await image.metadata();
    const isColor = asset.channel === "albedo";
    const resolution = isColor ? 1024 : 512;
    assert.equal(asset.runtimeResolution, resolution);
    assert.equal(metadata.width, resolution);
    assert.equal(metadata.height, resolution);
    assert.equal(metadata.format, isColor ? "webp" : "png");
    assert.equal(metadata.hasAlpha, false);
    assert.equal(asset.colorSpace, isColor ? "sRGB" : "Non-Color");
    assert.equal(asset.repeatMeters, asset.material === "concrete" ? 3 : 4);
    const stats = await image.stats();
    assert.ok(stats.channels[0].stdev > 1, "texture must not be a flat placeholder");
    if (asset.channel === "normal") {
      assert.equal(metadata.channels, 3);
      assert.ok(stats.channels[2].mean > 180, "tangent normals should point outward (+Z)");
      for (const channel of stats.channels.slice(0, 2)) {
        assert.ok(
          channel.mean > 110 && channel.mean < 145,
          "XY normals should be centered around neutral",
        );
      }
    }
    if (asset.channel === "roughness") {
      const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
      for (let pixel = 0; pixel < data.length; pixel += info.channels) {
        for (let component = 1; component < info.channels; component++) {
          assert.equal(
            data[pixel + component],
            data[pixel],
            "roughness must remain grayscale data",
          );
        }
      }
    }
  });
}

test("rain-city textures and public manifest stay within the 3 MB delivery budget", async () => {
  const bytes = runtime.assets.reduce((sum, asset) => sum + asset.bytes, 0);
  assert.equal(runtime.runtimeTotalBytes, bytes);
  assert.equal(provenance.runtimeTotalBytes, bytes);
  const manifestSize = (await read("public/rain-city-materials/manifest.json")).length;
  assert.ok(bytes + manifestSize < 3_000_000, `${bytes + manifestSize} bytes exceeds budget`);
  assert.ok(
    !JSON.stringify(runtime).includes(fileURLToPath(root)),
    "public manifest must not leak local paths",
  );
});
