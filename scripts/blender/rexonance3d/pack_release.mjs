// Pack the Blender release GLB for the web: dedup, prune, then compress.
//
//   RX_GLTF_DEPS=/path/to/node_modules node scripts/blender/rexonance3d/pack_release.mjs \
//     --input output/rexonance-3d/release/rexonance-raw-release.glb \
//     --output public/rexonance-3d-20261030/rexonance.glb [--codec draco|meshopt]
//
// draco (default): KHR_draco_mesh_compression, edgebreaker, positions 14 bit,
//   normals 10, UV 12, colour 8. The viewer decodes it with the Draco decoders the
//   site serves for DOGS ARCHIVE (WebAssembly, or the plain-JS build where
//   WebAssembly cannot compile). About 1.9 MB for the full suit.
// meshopt: EXT_meshopt_compression level high with the same quantization
//   (MeshoptDecoder, no decoder files). About 4.4 MB.
//
// RX_GLTF_DEPS is a separate work folder with @gltf-transform/core,
// @gltf-transform/extensions, @gltf-transform/functions (4.x), meshoptimizer and
// draco3dgltf installed, so the site's own dependencies stay unchanged.
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
    return pairs;
  }, []),
);
const deps = process.env.RX_GLTF_DEPS;
const codec = args.codec ?? "draco";
if (!deps || !args.input || !args.output || !["draco", "meshopt"].includes(codec)) {
  console.error(
    "usage: RX_GLTF_DEPS=<node_modules> node pack_release.mjs --input raw.glb --output out.glb [--codec draco|meshopt]",
  );
  process.exit(2);
}
const require = createRequire(path.join(path.resolve(deps), "_.js"));
const load = (name) => import(pathToFileURL(require.resolve(name)).href);
const { NodeIO } = await load("@gltf-transform/core");
const { ALL_EXTENSIONS } = await load("@gltf-transform/extensions");
const { dedup, prune, meshopt, reorder, draco } = await load("@gltf-transform/functions");
const { MeshoptEncoder, MeshoptDecoder } = await load("meshoptimizer");

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const quantize = {
  quantizePosition: 14,
  quantizeNormal: 10,
  quantizeTexcoord: 12,
  quantizeColor: 8,
};
const compress = [];
if (codec === "draco") {
  const draco3d = (await load("draco3dgltf")).default;
  io.registerDependencies({
    "draco3d.encoder": await draco3d.createEncoderModule(),
    "draco3d.decoder": await draco3d.createDecoderModule(),
  });
  compress.push(
    draco({
      method: "edgebreaker",
      encodeSpeed: 3,
      decodeSpeed: 5,
      quantizeGeneric: 12,
      ...quantize,
    }),
  );
} else {
  compress.push(
    reorder({ encoder: MeshoptEncoder, target: "size" }),
    meshopt({ encoder: MeshoptEncoder, level: "high", ...quantize }),
  );
}
const document = await io.read(args.input);
await document.transform(
  dedup(),
  prune({ keepLeaves: true, keepExtras: true, keepAttributes: true }),
  ...compress,
);
await io.write(args.output, document);
const bytes = (await stat(args.output)).size;
const sha = createHash("sha256")
  .update(await readFile(args.output))
  .digest("hex");
console.log(JSON.stringify({ output: args.output, codec, bytes, sha256: sha }));
