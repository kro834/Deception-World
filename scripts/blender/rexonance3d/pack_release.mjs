// Pack the Blender release GLB for the web: dedup, prune, quantize and
// EXT_meshopt_compression (three.js decodes it with MeshoptDecoder, no wasm file).
//
//   RX_GLTF_DEPS=/path/to/node_modules node scripts/blender/rexonance3d/pack_release.mjs \
//     --input output/rexonance-3d/release/rexonance-raw.glb \
//     --output public/rexonance-3d-20261030/rexonance.glb
//
// RX_GLTF_DEPS is a separate work folder with @gltf-transform/core,
// @gltf-transform/extensions, @gltf-transform/functions (4.x) and meshoptimizer
// installed, so the site's own dependencies stay unchanged.
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
if (!deps || !args.input || !args.output) {
  console.error("usage: RX_GLTF_DEPS=<node_modules> node pack_release.mjs --input raw.glb --output out.glb");
  process.exit(2);
}
const require = createRequire(path.join(path.resolve(deps), "_.js"));
const load = (name) => import(pathToFileURL(require.resolve(name)).href);
const { NodeIO } = await load("@gltf-transform/core");
const { ALL_EXTENSIONS } = await load("@gltf-transform/extensions");
const { dedup, prune, meshopt, reorder } = await load("@gltf-transform/functions");
const { MeshoptEncoder, MeshoptDecoder } = await load("meshoptimizer");

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const document = await io.read(args.input);
await document.transform(
  dedup(),
  prune({ keepLeaves: true, keepExtras: true }),
  reorder({ encoder: MeshoptEncoder, target: "size" }),
  meshopt({
    encoder: MeshoptEncoder,
    level: "medium",
    quantizePosition: 14,
    quantizeNormal: 10,
    quantizeTexcoord: 12,
    quantizeColor: 8,
  }),
);
await io.write(args.output, document);
const bytes = (await stat(args.output)).size;
const sha = createHash("sha256")
  .update(await readFile(args.output))
  .digest("hex");
console.log(JSON.stringify({ output: args.output, bytes, sha256: sha }));
