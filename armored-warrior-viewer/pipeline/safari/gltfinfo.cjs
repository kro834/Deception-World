// Lists images / textures / materials of a .glb or .gltf with their pixel sizes (reads headers only).
const fs = require('fs'), path = require('path');
function dims(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return [buf.readUInt32BE(16), buf.readUInt32BE(20), 'png'];
  if (buf[0] === 0xff && buf[1] === 0xd8) { let i = 2; while (i < buf.length) { if (buf[i] !== 0xff) { i++; continue; } const m = buf[i + 1]; const len = buf.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5), 'jpeg']; i += 2 + len; } }
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') {
    const c = buf.slice(12, 16).toString();
    if (c === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3), 'webp'];
    if (c === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff), 'webp-lossless']; }
    if (c === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff, 'webp-lossy'];
  }
  return [0, 0, '?'];
}
const file = process.argv[2];
let json, bin = null; const dir = path.dirname(file);
const raw = fs.readFileSync(file);
if (file.endsWith('.glb')) { const jl = raw.readUInt32LE(12); json = JSON.parse(raw.slice(20, 20 + jl).toString()); const bo = 20 + jl; bin = raw.slice(bo + 8, bo + 8 + raw.readUInt32LE(bo)); }
else json = JSON.parse(raw.toString());
console.log('extensionsUsed', json.extensionsUsed, 'required', json.extensionsRequired);
const bufs = (json.buffers || []).map((b) => b.uri ? fs.readFileSync(path.join(dir, b.uri)) : bin);
(json.images || []).forEach((im, i) => {
  let buf; if (im.uri) buf = fs.readFileSync(path.join(dir, decodeURIComponent(im.uri))); else { const bv = json.bufferViews[im.bufferView]; buf = bufs[bv.buffer].slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength); }
  const [w, h, t] = dims(buf);
  console.log(`image ${i} ${im.name || im.uri || ''} ${im.mimeType || ''} ${t} ${w}x${h} bytes=${buf.length}`);
});
(json.textures || []).forEach((t, i) => console.log(`texture ${i} source=${t.source} ext=${JSON.stringify(t.extensions || {})} sampler=${t.sampler}`));
(json.materials || []).forEach((m, i) => console.log(`material ${i} ${m.name} base=${m.pbrMetallicRoughness?.baseColorTexture?.index} mr=${m.pbrMetallicRoughness?.metallicRoughnessTexture?.index} n=${m.normalTexture?.index} e=${m.emissiveTexture?.index} o=${m.occlusionTexture?.index} alpha=${m.alphaMode || ''} ds=${m.doubleSided || false}`));
let tris = 0; (json.meshes || []).forEach((m) => m.primitives.forEach((p) => { const a = json.accessors[p.indices]; tris += a ? a.count / 3 : 0; }));
console.log('meshes', json.meshes.length, 'triangles', tris, 'samplers', JSON.stringify(json.samplers));
