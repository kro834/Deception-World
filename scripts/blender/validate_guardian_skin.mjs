import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Matrix4, Quaternion, Vector3 } from 'three';

const input = process.argv[2] || 'output/dogs-archive/rebuild-v2/finish-study/guardian-v2-browser.glb';
const raw = fs.readFileSync(input);
const jsonLength = raw.readUInt32LE(12);
const g = JSON.parse(raw.subarray(20, 20 + jsonLength));
const bin = raw.subarray(28 + jsonLength);
const sizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function values(index) {
  const a = g.accessors[index], v = g.bufferViews[a.bufferView], n = sizes[a.type];
  const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
  const read = { 5121: 'readUInt8', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' }[a.componentType];
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: n }, (_, k) => {
    let x = bin[read]((v.byteOffset || 0) + (a.byteOffset || 0) + i * (v.byteStride || n * bytes) + k * bytes);
    if (a.normalized) x /= a.componentType === 5121 ? 255 : 65535;
    return x;
  }));
}
const parents = new Map();
g.nodes.forEach((n, i) => (n.children || []).forEach(c => parents.set(c, i)));
const clips = Object.fromEntries(g.animations.map(a => [a.name, new Map(a.channels.map(c => [`${c.target.node}:${c.target.path}`, values(a.samplers[c.sampler].output)[0]]))]));
function worlds(t) {
  const out = [];
  function world(i) {
    if (out[i]) return out[i];
    const n = g.nodes[i];
    let p = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1];
    const rp = clips.Rest.get(`${i}:translation`), ep = clips.Exhale.get(`${i}:translation`);
    const rq = clips.Rest.get(`${i}:rotation`), eq = clips.Exhale.get(`${i}:rotation`);
    if (rp && ep) p = rp.map((v, k) => v + (ep[k] - v) * t);
    const qr = rq && eq ? new Quaternion().fromArray(rq).slerp(new Quaternion().fromArray(eq), t) : new Quaternion().fromArray(q);
    const local = new Matrix4().compose(new Vector3().fromArray(p), qr, new Vector3().fromArray(n.scale || [1, 1, 1]));
    out[i] = parents.has(i) ? world(parents.get(i)).clone().multiply(local) : local;
    return out[i];
  }
  g.nodes.forEach((_, i) => world(i));
  return out;
}
const bodyIndex = g.nodes.findIndex(n => n.name === 'BodyPivot');
const rest = worlds(0), headIndex = g.nodes.findIndex(n => n.name === 'HeadPivot');
const report = { input, sha256: crypto.createHash('sha256').update(raw).digest('hex'), phases: [] };
for (const t of [0, .25, .5, .75, 1]) {
  const world = worlds(t), headDelta = world[headIndex].clone().multiply(rest[headIndex].clone().invert());
  const bodyDelta = world[bodyIndex].clone().multiply(rest[bodyIndex].clone().invert());
  const phase = { fraction: t, meshes: [] };
  g.nodes.forEach((node, ni) => {
    if (node.skin === undefined) return;
    const skin = g.skins[node.skin], binds = values(skin.inverseBindMatrices).map(a => new Matrix4().fromArray(a));
    let restError = 0, headError = 0, bodyError = 0, headVertices = 0, bodyVertices = 0;
    for (const prim of g.meshes[node.mesh].primitives) {
      const p = values(prim.attributes.POSITION), js = values(prim.attributes.JOINTS_0), ws = values(prim.attributes.WEIGHTS_0);
      for (let i = 0; i < p.length; i++) {
        const actual = new Vector3(); let hw = 0, bw = 0;
        for (let k = 0; k < 4; k++) {
          const joint = skin.joints[js[i][k]], weight = ws[i][k];
          if (!weight) continue;
          actual.addScaledVector(new Vector3().fromArray(p[i]).applyMatrix4(binds[js[i][k]]).applyMatrix4(world[joint]), weight);
          if (g.nodes[joint].name === 'NeckHeadJoint') hw += weight;
          if (g.nodes[joint].name === 'NeckBaseJoint') bw += weight;
        }
        const r = new Vector3().fromArray(p[i]).applyMatrix4(rest[ni]);
        if (t === 0) restError = Math.max(restError, actual.distanceTo(r));
        if (hw > .99999) { headError = Math.max(headError, actual.distanceTo(r.clone().applyMatrix4(headDelta))); headVertices++; }
        if (bw > .99999) { bodyError = Math.max(bodyError, actual.distanceTo(r.clone().applyMatrix4(bodyDelta))); bodyVertices++; }
      }
    }
    phase.meshes.push({ name: node.name, restError, headError, bodyError, headVertices, bodyVertices });
    if (restError > 2e-4 || headError > 2e-4 || bodyError > 2e-4) throw new Error(`Skin mismatch ${node.name} fraction ${t}: ${restError}/${headError}`);
  });
  report.phases.push(phase);
}
const output = path.join(path.dirname(input), 'skin-runtime-validation.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
