// Decoded vertex/index bytes per primitive (what three uploads), from accessor counts and types.
const fs = require('fs');
const file = process.argv[2];
const raw = fs.readFileSync(file);
const json = file.endsWith('.glb') ? JSON.parse(raw.slice(20, 20 + raw.readUInt32LE(12)).toString()) : JSON.parse(raw.toString());
const comp = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
let vtx = 0, idx = 0, verts = 0, tris = 0; const types = {};
for (const m of json.meshes) for (const p of m.primitives) {
  for (const [k, a] of Object.entries(p.attributes)) { const acc = json.accessors[a]; let b = acc.count * comp[acc.componentType] * n[acc.type]; // three pads? no: keeps the typed array as is
    vtx += b; types[k + ':' + acc.componentType + ':' + acc.type + (acc.normalized ? ':norm' : '')] = 1; if (k === 'POSITION') verts += acc.count; }
  if (p.indices !== undefined) { const acc = json.accessors[p.indices]; idx += acc.count * comp[acc.componentType]; tris += acc.count / 3; }
}
console.log(file, { verts, tris, vertexMB: (vtx / 1e6).toFixed(1), indexMB: (idx / 1e6).toFixed(1), types: Object.keys(types) });
