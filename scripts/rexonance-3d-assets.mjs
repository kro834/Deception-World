// Assets for /rexonance-3d (public/rexonance-3d-20261030/).
//
//   node scripts/rexonance-3d-assets.mjs [manifest] [textures] [references]
//
// manifest    model-manifest.json from the shipped GLB itself (nodes, materials, glints,
//             triangles, bytes, sha256), plus the build stamp of the Blender export's
//             model-manifest.raw.json when it is there. Run it after every GLB swap:
//               RX_RAW_MANIFEST=output/rexonance-3d/release/model-manifest.raw.json (default)
// textures    textures/scale-normal.webp: a tileable normal map of overlapping, elongated
//             dragon scales (RGB tangent normal, OpenGL +Y; A = cavity) that the viewer
//             projects triplanar in object space onto RX_Suit.
// references  reference/<view>.webp: the owner's four main sheets at 640 x 960 for the
//             viewer's 参照画像 panel (originals stay in design/rexonance-3d-20261030/).
//
// With no argument, all three run.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "public/rexonance-3d-20261030");
const tasks = process.argv.slice(2);
const run = (name) => tasks.length === 0 || tasks.includes(name);

export const REXONANCE_REFERENCE_VIEWS = ["front-10", "right-07", "back-09", "left-08"];

/** The shipped GLB's own JSON chunk. */
export function readGlbJson(bytes) {
  if (bytes.toString("ascii", 0, 4) !== "glTF") throw new Error("not a GLB");
  const length = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error("first GLB chunk is not JSON");
  return JSON.parse(bytes.toString("utf8", 20, 20 + length));
}

/** model-manifest.json for a packed GLB (pure: bytes in, object out). */
export function buildRexonanceManifest(bytes, raw = null, file = "rexonance.glb") {
  const gltf = readGlbJson(bytes);
  const parents = new Map();
  (gltf.nodes ?? []).forEach((node, index) =>
    (node.children ?? []).forEach((child) => parents.set(child, index)),
  );
  const nodes = [];
  const glints = [];
  let triangles = 0;
  const materials = new Set();
  (gltf.nodes ?? []).forEach((node, index) => {
    const name = node.name ?? `node${index}`;
    const parent = parents.has(index) ? (gltf.nodes[parents.get(index)].name ?? null) : null;
    if (/^RX_Glint_/u.test(name)) {
      glints.push({
        name,
        size: Number(node.extras?.rx_glint_size ?? 0.03),
        hue: Number(node.extras?.rx_glint_hue ?? 0.5),
      });
      return;
    }
    const entry = { name, type: node.mesh === undefined ? "EMPTY" : "MESH", parent };
    if (node.extras && Object.keys(node.extras).length) entry.extras = node.extras;
    if (node.mesh !== undefined) {
      let count = 0;
      const names = [];
      let tint = false;
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        const indices = primitive.indices === undefined ? null : gltf.accessors[primitive.indices];
        const vertices = gltf.accessors[primitive.attributes.POSITION].count;
        count += Math.round((indices ? indices.count : vertices) / 3);
        const material = gltf.materials?.[primitive.material]?.name;
        if (material) {
          names.push(material);
          materials.add(material);
        }
        tint ||= primitive.attributes.COLOR_0 !== undefined;
      }
      triangles += count;
      Object.assign(entry, { triangles: count, materials: [...new Set(names)], tint });
    }
    nodes.push(entry);
  });
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  glints.sort((a, b) => a.name.localeCompare(b.name));
  return {
    model: file,
    assetBytes: bytes.length,
    assetSha256: createHash("sha256").update(bytes).digest("hex"),
    units: raw?.units ?? "metres; glTF +Y up, the suit faces +Z, its left hand is +X",
    built: raw?.built ?? null,
    blender: raw?.blender ?? null,
    extensions: gltf.extensionsUsed ?? [],
    triangles,
    materials: [...materials].sort(),
    tailPivots: nodes.filter((node) => /^RX_Tail_Pivot\d+$/u.test(node.name)).length,
    nodes,
    glints,
  };
}

function writeManifest() {
  const glb = resolve(out, "rexonance.glb");
  const bytes = readFileSync(glb);
  const rawPath = resolve(
    root,
    process.env.RX_RAW_MANIFEST ?? "output/rexonance-3d/release/model-manifest.raw.json",
  );
  const raw = existsSync(rawPath) ? JSON.parse(readFileSync(rawPath, "utf8")) : null;
  const manifest = buildRexonanceManifest(bytes, raw);
  writeFileSync(resolve(out, "model-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `manifest: ${manifest.assetBytes} bytes, ${manifest.triangles} triangles, ` +
      `${manifest.nodes.length} nodes, ${manifest.glints.length} glints, sha256 ${manifest.assetSha256}`,
  );
}

// ------------------------------------------------------------------ scale normal map
// Pointy-top hexagons, stretched tall, tile exactly: COLUMNS per tile across (half-width A),
// ROWS per tile up (half-height C, rows every 1.5 C), odd rows offset by half a column
// (ROWS even, so the stagger repeats). Each plate is a shallow, slightly crowned facet pair:
// a keel down its middle, tilted so its lower tip stands proud of the plates below (the
// overlap), a rounded bevel and a dark seam at its rim, and its own random lean so
// neighbouring plates catch the light apart, as the sheet's leg and chest plates do.
const SIZE = 512;
const COLUMNS = 5;
const ROWS = 4;
const A = 0.5 / COLUMNS;
const C = 1 / (1.5 * ROWS);
const SUPER = 3;

function hash2(i, j, salt) {
  let h = (i * 374761393 + j * 668265263 + salt * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const hexNorm = (xn, yn) => Math.max(Math.abs(xn), Math.abs(xn) / 2 + Math.abs(yn));

function plateAt(u, v) {
  // Nearest plate by the hexagon norm, with wrap-around in both directions.
  const row = v * ROWS;
  let best = null;
  for (let j = Math.floor(row) - 1; j <= Math.floor(row) + 2; j++) {
    const jj = ((j % ROWS) + ROWS) % ROWS;
    const offset = (jj % 2) * 0.5;
    const col = u * COLUMNS - offset;
    for (let i = Math.floor(col) - 1; i <= Math.floor(col) + 2; i++) {
      const ii = ((i % COLUMNS) + COLUMNS) % COLUMNS;
      const cx = (i + 0.5 + offset) / COLUMNS;
      const cy = (j + 0.5) / ROWS;
      const xn = (u - cx) / A;
      const yn = (v - cy) / C;
      const norm = hexNorm(xn, yn);
      if (!best || norm < best.norm) best = { i: ii, j: jj, xn, yn, norm };
    }
  }
  return best;
}

function plateHeight(plate, xn, yn) {
  // Heights in tile units (one tile is about 20 cm on the suit).
  const n = hexNorm(xn, yn);
  const leanX = (hash2(plate.i, plate.j, 1) - 0.5) * 0.42;
  const leanY = (hash2(plate.i, plate.j, 2) - 0.5) * 0.24;
  const keel = 0.07 + hash2(plate.i, plate.j, 3) * 0.1;
  let h = 0;
  h += -yn * C * 0.2; // the lower tip stands proud: roof-tile overlap
  h += -Math.abs(xn) * A * keel; // two facets meeting on a keel
  h += leanX * xn * A + leanY * yn * C;
  h += (1 - Math.min(1, n) ** 2) * A * 0.1; // a little crown
  const bevel = Math.min(1, Math.max(0, (n - 0.8) / 0.2));
  h -= bevel * bevel * A * 0.24; // rounded rim into the seam
  return h;
}

function scaleTexel(u, v) {
  const plate = plateAt(u, v);
  const eps = 0.25 / SIZE;
  const h = (x, y) => plateHeight(plate, x, y);
  const gx = (h(plate.xn + eps / A, plate.yn) - h(plate.xn - eps / A, plate.yn)) / (2 * eps);
  const gy = (h(plate.xn, plate.yn + eps / C) - h(plate.xn, plate.yn - eps / C)) / (2 * eps);
  const length = Math.hypot(gx, gy, 1);
  const seam = Math.min(1, Math.max(0, (plate.norm - 0.9) / 0.1));
  return { nx: -gx / length, ny: -gy / length, nz: 1 / length, cavity: 1 - seam * seam * 0.85 };
}

async function writeScaleNormal() {
  const data = Buffer.alloc(SIZE * SIZE * 4);
  for (let py = 0; py < SIZE; py++)
    for (let px = 0; px < SIZE; px++) {
      let nx = 0,
        ny = 0,
        nz = 0,
        cavity = 0;
      for (let sy = 0; sy < SUPER; sy++)
        for (let sx = 0; sx < SUPER; sx++) {
          const u = (px + (sx + 0.5) / SUPER) / SIZE;
          // Image row 0 is the top; three.js flips Y on upload, so v runs bottom-up.
          const v = 1 - (py + (sy + 0.5) / SUPER) / SIZE;
          const texel = scaleTexel(u, v);
          nx += texel.nx;
          ny += texel.ny;
          nz += texel.nz;
          cavity += texel.cavity;
        }
      const length = Math.hypot(nx, ny, nz) || 1;
      const offset = (py * SIZE + px) * 4;
      data[offset] = Math.round((nx / length) * 127.5 + 127.5);
      data[offset + 1] = Math.round((ny / length) * 127.5 + 127.5);
      data[offset + 2] = Math.round((nz / length) * 127.5 + 127.5);
      data[offset + 3] = Math.round((cavity / SUPER ** 2) * 255);
    }
  mkdirSync(resolve(out, "textures"), { recursive: true });
  const file = resolve(out, "textures/scale-normal.webp");
  await sharp(data, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .webp({ lossless: true, effort: 6 })
    .toFile(file);
  console.log(`textures: ${file}`);
}

async function writeReferences() {
  mkdirSync(resolve(out, "reference"), { recursive: true });
  for (const view of REXONANCE_REFERENCE_VIEWS) {
    const source = resolve(root, `design/rexonance-3d-20261030/reference/${view}.webp`);
    const file = resolve(out, `reference/${view}.webp`);
    await sharp(source)
      .resize({ width: 640, height: 960, fit: "inside" })
      .webp({ quality: 82, effort: 6 })
      .toFile(file);
    console.log(`references: ${file}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (run("textures")) await writeScaleNormal();
  if (run("references")) await writeReferences();
  if (run("manifest")) writeManifest();
}
