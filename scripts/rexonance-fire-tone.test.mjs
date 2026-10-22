// The fire's end tone (owner, 2026-10-22, FAR FROM SAGA: 「炎は最終的に金色に
// なります」): the shared fire (src/lib/rexonance-fire, src/lib/rexonance-
// flame.js) takes a tone — 0 the clean cyan-blue combustion Rexonance ends
// in, 1 the gold Far From ends in — on the pose, the GLSL and every draw.
// These pin that Rexonance's fire is untouched: the CPU kernel's frames at
// tone 0 are byte for byte the frames captured before the tone existed
// (GOLDEN_HASHES / GOLDEN_SAMPLES, sha256 of both layers over both tiers, a
// sweep of phases, clocks and strengths), and that the gold tone turns the
// torch, the detonation, the sparks and the reactor's light gold.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NANITE_FIRE_PHASES,
  naniteFlameEnvelope,
  paintBodySilhouette,
} from "../src/lib/rexonance-ignition.js";
import {
  FIELD_BODY,
  FIELD_H,
  FIELD_W,
  FIRE_RECT,
  buildFireField,
} from "../src/lib/rexonance-fire/fire-field.js";
import { buildNoiseTable } from "../src/lib/rexonance-fire/fire-noise.js";
import {
  POSE_SLOTS,
  POSE_TEAR_GLOW,
  POSE_TONE,
  poseFire,
  poseView,
} from "../src/lib/rexonance-fire/fire-pose.js";
import {
  RASTER_H,
  RASTER_TOUCH_H,
  RASTER_TOUCH_W,
  RASTER_W,
  fireKernel,
  rasterFire,
} from "../src/lib/rexonance-fire/fire-raster.js";
import { FIRE_FRAGMENT, SPARK_FRAGMENT } from "../src/lib/rexonance-fire/fire-shaders.js";
import {
  FIRE_TONES,
  RAMP_CLEAN,
  RAMP_GOLD,
  RAMP_HEAT_GOLD,
  TONE_TINTS,
} from "../src/lib/rexonance-fire/fire-tuning.js";

const GOLDEN_HASHES = [
  ["desktop 0.01 0.5 1", "f68cf3fdfdd32b20de8a15b7852ec34af576899e8080b76a579b2797e8fb4c7b"],
  ["desktop 0.01 0.5 0.8", "07a8a45ec77ddef557a34e504f1441e9d79d261eb3b8660feebe601f365e11fd"],
  ["desktop 0.01 1.7 1", "52289a88b65668ca070967293de5e530e3a9dcd30b6d69df743eaa7cc5c7ba09"],
  ["desktop 0.01 1.7 0.8", "1c658e782ede3c82deb8bccb09ce0203f89f7aba9f7cb7d3b83c1742af53b015"],
  ["desktop 0.05 0.5 1", "43a6f398ed5e2de7c2868853f222be592286c132617a324a639d91c527945f20"],
  ["desktop 0.05 0.5 0.8", "b538fb99e1dad2c44c38df78fd44e02ee7e73bfe0eee3cb756ced162863d6f54"],
  ["desktop 0.05 1.7 1", "c0f16edd8b764069f040e1f5637fa98a706f497f45c36aa9a0dd6aedff2e57a7"],
  ["desktop 0.05 1.7 0.8", "59f6f631f197a304a9d98bb3bb9649b41d5067267898c74d44472be1968518af"],
  ["desktop 0.1 0.5 1", "b95df5f2d4dca3446a00c4ce0bce5d7c24731156c25c7b3d6e543feff3a785be"],
  ["desktop 0.1 0.5 0.8", "5b0aee5a948a591b5b32909e7358047dd4b5a20131616e559925509c27e7d9a0"],
  ["desktop 0.1 1.7 1", "1c7764b60014f82251225b299cfe4272d6f4dba9bcafc25cdab0e1e66fd75494"],
  ["desktop 0.1 1.7 0.8", "be0fc4ee7b9d8fc883fab5e2884927b533495180751af344ca1de179f6e058f6"],
  ["desktop 0.14 0.5 1", "12dc210c64f05d214eacc029b51edf25dfcc584efa30a182221f2a81324346be"],
  ["desktop 0.14 0.5 0.8", "b9dbefe71f07da7a4f7ee8eec07f7e0aab70465ae3c6101afe831ab42035e85f"],
  ["desktop 0.14 1.7 1", "e5a4f8a8ed9e9eb85ecce964cba10d82774a632d943844dcbf371b1162a23ee9"],
  ["desktop 0.14 1.7 0.8", "d325ac2af5101eec2039090c49a3a16d8b93265b05455599e61170afa3c9497c"],
  ["desktop 0.17 0.5 1", "49ae689c97f8d65c6d09a65629b8cb1f4b825d8c2698803b5716b7557404efbb"],
  ["desktop 0.17 0.5 0.8", "de2b04d021476b592181be387de065a1c29e9d636b9375b8d79edacfe8c2728e"],
  ["desktop 0.17 1.7 1", "9e1fc09cce240312035562c66eb4ebdce5ae0b824231466f74ad9cfa0490c170"],
  ["desktop 0.17 1.7 0.8", "59dc21b8e0cd3ef1b2ccd84bbca5f1f45e615397aab9b1f75f7568e13e5c15dc"],
  ["desktop 0.18 0.5 1", "98215c2f0e65731bcd770fb028274f80750dce69007573235364e72de184b9be"],
  ["desktop 0.18 0.5 0.8", "9a594eb0ef0b0d40af55322e83c242066f8bca952114d0d0377103da4ff9f70e"],
  ["desktop 0.18 1.7 1", "2e660c085320056a49c9bdebeee55e9503cc32dcf10339bd159b1b234fb116dd"],
  ["desktop 0.18 1.7 0.8", "c5bdac9643ea25e0ce40894a76a5368d99e8abf9dc16d082a53697d5544724c0"],
  ["desktop 0.2 0.5 1", "9a39828316a03e8c5b8308cc291c2336d2595220bc8c3f4e99cba1e1c7337942"],
  ["desktop 0.2 0.5 0.8", "c8c4c7e2e9d532498794c6126ccbf0e6c7845918b72bf5257c09bced566f10c9"],
  ["desktop 0.2 1.7 1", "3bdf06da9b0a4958e8440cb1dc991794942aa2b1e11e8e8a795dfb3cf3f02b55"],
  ["desktop 0.2 1.7 0.8", "0a8d2d1356ede6a65eca983531647a531d08889f38177b9f282beb06b1f52db7"],
  ["desktop 0.23 0.5 1", "d8b443032200e143b1c49820b6d78c32d519553a3f63a38f48e8bc31da084f0a"],
  ["desktop 0.23 0.5 0.8", "d8b443032200e143b1c49820b6d78c32d519553a3f63a38f48e8bc31da084f0a"],
  ["desktop 0.23 1.7 1", "d8b443032200e143b1c49820b6d78c32d519553a3f63a38f48e8bc31da084f0a"],
  ["desktop 0.23 1.7 0.8", "d8b443032200e143b1c49820b6d78c32d519553a3f63a38f48e8bc31da084f0a"],
  ["touch 0.01 0.5 1", "fa5ee3d8d589b322371f40b186b97cf919bf0a52b7b041554af12f7dd51ecd88"],
  ["touch 0.01 0.5 0.8", "a0f8bd25387365a57ff64a763cc340eaa6fe86371fffe348cec44cdd9022a08f"],
  ["touch 0.01 1.7 1", "9b4e83b8ab00f719a5c541ad4f82f06096d80a8762a8bb514b02e5d145dfd911"],
  ["touch 0.01 1.7 0.8", "a449c96506e5050e0f50ec3467a053f519cfc05792f2bc02c90b8bd011e09718"],
  ["touch 0.05 0.5 1", "ea85ad30f6e5ce988f9fbc063e85dc5da7f84c05ccc39a53ebafcc88d966b3fc"],
  ["touch 0.05 0.5 0.8", "3a1e5fb5d5ba49c9734fa9a4288ea5150a47786694389cb08bd4b209e6d86b4e"],
  ["touch 0.05 1.7 1", "a4c6ef4c3a18ef4d8bf905a17d207149fb4df6c99eeb235ed9fcce02d24af80c"],
  ["touch 0.05 1.7 0.8", "77221eb3d4fecf1b3c2e13fea8cf17817e88b5750c9601be3473a30809b72a09"],
  ["touch 0.1 0.5 1", "9d697f727a6a7559f9e531b08a7810a9008a72e98457d23e7d5ec4ca5252906d"],
  ["touch 0.1 0.5 0.8", "52f6dac31e106ada24d01dc0fd9bcdd702fa815215a97c73249a341cdbc6a8a2"],
  ["touch 0.1 1.7 1", "77758b90cefe4bc1d5158e4e62b488d0bc6b2be4fa9777510e1997808ce9a5e0"],
  ["touch 0.1 1.7 0.8", "cdb7501c41d6a0c7a162e061c580d7d8bed259de58681deb50f24ef516c715d8"],
  ["touch 0.14 0.5 1", "8e1fb24b0ccb47383ca7c4021be0563f9cc122888d001beaa1fff5ddad744770"],
  ["touch 0.14 0.5 0.8", "2b64bb202d3d00d8a773f418d0f356f527a5b4a2020fd9ad5cce0f934584dc28"],
  ["touch 0.14 1.7 1", "84500ada223160c85d8a59e1e337585fb616dc24387dbdfc401185d6555bb3b1"],
  ["touch 0.14 1.7 0.8", "95a63a1765da092e04e08331ecd2bce112981243962b1b6873a1a980a3ef3fd1"],
  ["touch 0.17 0.5 1", "1696f23b4352b066b0ee103ad38536b11d2decf09f95ef6154821188e05909ec"],
  ["touch 0.17 0.5 0.8", "5ed3a5ee367b4283787ecbc15cc745c4b99f51b297f5a8a4ca5295dd30098ff9"],
  ["touch 0.17 1.7 1", "9d17849a0a79a5ef4976ea73632e4e445a437822e9c097da2e80484a8e7c62e3"],
  ["touch 0.17 1.7 0.8", "ea466285ec4602e0dedacc7d00e70c7a9dc3c0aa8d4b72ee767687b4b6816bbd"],
  ["touch 0.18 0.5 1", "7a849c1e767962b4d8091ff12edaeaa9f9fa7c580608c2b800697dcf810696c0"],
  ["touch 0.18 0.5 0.8", "a4a196fede876104ace052c92a510a5ef83ba592f00ffdc25ad2d6f56573241b"],
  ["touch 0.18 1.7 1", "60be6f16b5955306ed4ece46c7b6a4822bdafdb7846ac57bb55f85f317f27ea4"],
  ["touch 0.18 1.7 0.8", "e0bbb47233e3c73483625645e454bff0db8537f4b76c734dbb703da654596d48"],
  ["touch 0.2 0.5 1", "576d9b5fff8937effbac9d625fc6800ce08bd71277ace7c83e538b4db706dcf7"],
  ["touch 0.2 0.5 0.8", "90bffa457c43a2475bfc2f06dd9d3fd68fbcbaf3dd50b86aa00c98791fb4d3d5"],
  ["touch 0.2 1.7 1", "504f0dd37801e087b196f628f15b4170d5e1d52392e8037561b7cb3643bb181b"],
  ["touch 0.2 1.7 0.8", "119e5019cc1264d1a8dd23c727898327200cfcef8c981c6cc9d2bfcee6d82951"],
  ["touch 0.23 0.5 1", "16fa66a7dc98d93f2a4c5d20baf5177f59c4c37fc62face65690c11c15fe6ff9"],
  ["touch 0.23 0.5 0.8", "16fa66a7dc98d93f2a4c5d20baf5177f59c4c37fc62face65690c11c15fe6ff9"],
  ["touch 0.23 1.7 1", "16fa66a7dc98d93f2a4c5d20baf5177f59c4c37fc62face65690c11c15fe6ff9"],
  ["touch 0.23 1.7 0.8", "16fa66a7dc98d93f2a4c5d20baf5177f59c4c37fc62face65690c11c15fe6ff9"],
];
const GOLDEN_SAMPLES = [
  [0.08, 0.5, 0.5, [0, 0, 0, 0, 0, 0, 0, 0]],
  [0.08, 0.42, 0.3, [0, 0, 0, 0, 0, 0, 0, 0]],
  [
    0.08,
    0.6,
    0.7,
    [
      0.03371216219640763, 0.12977950982343586, 0.04412164330022534, 0.12977950982343586,
      0.06260830122189989, 0.2410190896720952, 0.0819401947004185, 0.2410190896720952,
    ],
  ],
  [0.08, 0.5, 0.95, [0, 0, 0, 0, 0, 0, 0, 0]],
  [
    0.16,
    0.5,
    0.5,
    [
      0.033662653871355294, 0.040051488713469405, 0.10438041213150319, 0.10438041213150319,
      0.06251635718965984, 0.07438133618215748, 0.1938493368156488, 0.1938493368156488,
    ],
  ],
  [
    0.16,
    0.42,
    0.3,
    [0.3260552679550866, 0.7335150532222482, 0.9791521686526082, 0.9791521686526082, 0, 0, 0, 0],
  ],
  [
    0.16,
    0.6,
    0.7,
    [
      0.04902413674039986, 0.14691761469933046, 0.22045717203443196, 0.22045717203443196,
      0.09104482537502832, 0.272846998727328, 0.4094204623496594, 0.4094204623496594,
    ],
  ],
  [0.16, 0.5, 0.95, [0, 0, 0, 0, 0, 0, 0, 0]],
  [
    0.19,
    0.5,
    0.5,
    [
      0.007326528323299889, 0.008987208076581198, 0.009768704431066519, 0.009768704431066519,
      0.17826091699453991, 0.21811077811394702, 0.23726394573969278, 0.23726394573969278,
    ],
  ],
  [
    0.19,
    0.42,
    0.3,
    [
      0.04636971170855209, 0.11729567609586562, 0.18260911381435113, 0.18260911381435113, 0, 0, 0,
      0,
    ],
  ],
  [
    0.19,
    0.6,
    0.7,
    [
      0.007326528323299889, 0.008987208076581198, 0.009768704431066519, 0.009768704431066519,
      0.024607939664593466, 0.04297180814221825, 0.05257852938188132, 0.05257852938188132,
    ],
  ],
  [
    0.19,
    0.5,
    0.95,
    [0.05262309038277421, 0.0696266846828758, 0.07957072963358272, 0.07957072963358272, 0, 0, 0, 0],
  ],
];

const file = (path) => new URL(`../${path}`, import.meta.url);
const read = (path) => readFileSync(file(path), "utf8");
let serial = 0;
const fresh = () => import(`../src/lib/rexonance-flame.js?tone=${serial++}`);
const SIZE = { width: 571, height: 1040 };

// The authored silhouette's field and the shared noise: the same tables the
// goldens were captured with.
const noise = buildNoiseTable();
const field = (() => {
  const alpha = new Uint8Array(FIELD_W * FIELD_H);
  paintBodySilhouette(
    alpha,
    FIELD_W,
    FIELD_H,
    FIELD_BODY.x,
    FIELD_BODY.y,
    FIELD_BODY.width,
    FIELD_BODY.height,
  );
  const bytes = new Uint8Array(FIELD_W * FIELD_H * 4);
  assert.equal(buildFireField(alpha, FIELD_W, FIELD_H, bytes), true);
  return bytes;
})();
const pose = new Float64Array(POSE_SLOTS);

const frameHash = (tier, phase, clock, strength, tone) => {
  const w = tier === "desktop" ? RASTER_W : RASTER_TOUCH_W;
  const h = tier === "desktop" ? RASTER_H : RASTER_TOUCH_H;
  const back = new Uint8ClampedArray(w * h * 4);
  const front = new Uint8ClampedArray(w * h * 4);
  if (tone === undefined) poseFire(phase, strength, clock, tier === "desktop" ? 1 : 0, pose);
  else poseFire(phase, strength, clock, tier === "desktop" ? 1 : 0, pose, tone);
  poseView(pose, 0.1, 0, 0.9, 1);
  rasterFire(pose, field, noise, w, h, back, front);
  return createHash("sha256").update(back).update(front).digest("hex");
};

test("Rexonance's fire is untouched: every pinned frame of the CPU kernel at the default tone is byte-identical to the frames captured before the tone existed", () => {
  assert.equal(GOLDEN_HASHES.length, 64);
  for (const [key, hash] of GOLDEN_HASHES) {
    const [tier, phase, clock, strength] = key.split(" ");
    assert.equal(
      frameHash(tier, Number(phase), Number(clock), Number(strength)),
      hash,
      `frame ${key} (tone omitted)`,
    );
    assert.equal(
      frameHash(tier, Number(phase), Number(clock), Number(strength), FIRE_TONES.clean),
      hash,
      `frame ${key} (tone 0)`,
    );
  }
  const px = new Float64Array(8);
  for (const [phase, u, v, expected] of GOLDEN_SAMPLES) {
    poseFire(phase, 1, 1.1, 1, pose);
    fireKernel(u, v, pose, field, noise, px);
    assert.deepEqual(Array.from(px), expected, `kernel sample ${phase} ${u} ${v}`);
  }
});

test("the tone rides the pose: clamped, 0 by default, invalid as 0, and the clean tone is 0", () => {
  assert.deepEqual({ ...FIRE_TONES }, { clean: 0, gold: 1 });
  assert.equal(POSE_TONE, POSE_SLOTS - 1);
  poseFire(0.1, 1, 0.5, 1, pose);
  assert.equal(pose[POSE_TONE], 0);
  poseFire(0.1, 1, 0.5, 1, pose, 1.7);
  assert.equal(pose[POSE_TONE], 1);
  poseFire(0.1, 1, 0.5, 1, pose, -2);
  assert.equal(pose[POSE_TONE], 0);
  poseFire(0.1, 1, 0.5, 1, pose, NaN);
  assert.equal(pose[POSE_TONE], 0);
  poseFire(0.1, 1, 0.5, 1, pose, 0.35);
  assert.equal(pose[POSE_TONE], 0.35);
  // The gold ramp is a visible flame colour at every stop, warm throughout,
  // and its fringe is as deep as the clean fire's pink-violet fringe.
  for (const [, r, g, b] of RAMP_GOLD) {
    assert.ok(r >= g && g >= b, `gold over green over blue at ${[r, g, b]}`);
    assert.ok(r >= 0.5, "never black");
  }
  assert.ok(RAMP_GOLD[0][2] <= RAMP_CLEAN[0][3] - 0.3, "a deep amber fringe");
  for (const [, r, g, b] of RAMP_HEAT_GOLD) assert.ok(r >= g && g >= b);
  for (const [clean, gold] of Object.values(TONE_TINTS)) {
    assert.equal(clean.length, 3);
    assert.equal(gold.length, 3);
  }
  for (const name of ["flash", "tearWhite", "tearHalo"]) {
    const gold = TONE_TINTS[name][1];
    assert.ok(gold[0] >= gold[2], `a gold ${name} is never bluer than red: ${gold}`);
  }
  // The ring: base + slope × ring, both ends of it gold.
  const [base, slope] = [TONE_TINTS.ringBase[1], TONE_TINTS.ringSlope[1]];
  assert.ok(base[0] >= base[2] && base[0] + slope[0] >= base[2] + slope[2]);
});

// Mean emission over the lit skin of the undersuit's bands at a phase and
// tone, from the CPU oracle.
function torchColour(phase, tone) {
  poseFire(phase, naniteFlameEnvelope(phase), 0.5, 1, pose, tone);
  const px = new Float64Array(8);
  const colour = [0, 0, 0];
  let lit = 0;
  for (let yy = 0.1; yy < 0.95; yy += 0.01)
    for (let xx = 0.2; xx < 0.8; xx += 0.02) {
      fireKernel(
        (xx - FIRE_RECT.x) / FIRE_RECT.width,
        (yy - FIRE_RECT.y) / FIRE_RECT.height,
        pose,
        field,
        noise,
        px,
      );
      const alpha = px[3] + px[7];
      if (alpha <= 0.12) continue;
      lit += 1;
      colour[0] += px[0] + px[4];
      colour[1] += px[1] + px[5];
      colour[2] += px[2] + px[6];
    }
  assert.ok(lit > 200, `${lit} lit samples at ${phase}`);
  return colour.map((c) => c / lit);
}

test("the gold tone turns the complete combustion gold while the kindling stays the same sooty green; the clean tone is Rexonance's cyan-blue", () => {
  const torch = NANITE_FIRE_PHASES.cover + 0.005;
  const [cr, cg, cb] = torchColour(torch, FIRE_TONES.clean);
  const [gr, gg, gb] = torchColour(torch, FIRE_TONES.gold);
  assert.ok(cb > cr * 1.3, `the clean torch is blue: ${[cr, cg, cb]}`);
  assert.ok(gr > gb * 1.6 && gr > gg, `the gold torch is gold: ${[gr, gg, gb]}`);
  assert.ok(gg > gb * 1.2, "gold, not red");
  // Before the colour shift (cleanFrom) the fire is the same green in both.
  const early = NANITE_FIRE_PHASES.cleanFrom - 0.01;
  assert.deepEqual(torchColour(early, FIRE_TONES.gold), torchColour(early, FIRE_TONES.clean));
  // Between the tones, between the colours (a mix, not a switch).
  const [mr, , mb] = torchColour(torch, 0.5);
  assert.ok(mr > cr && mr < gr && mb < cb && mb > gb, `a mix: ${[mr, mb]}`);
  // The detonation, its tears and its ring are gold too: the frames differ.
  for (const phase of [0.18, 0.2]) {
    for (const tier of ["desktop", "touch"]) {
      assert.notEqual(frameHash(tier, phase, 0.5, 1, 0), frameHash(tier, phase, 0.5, 1, 1));
      poseFire(phase, 1, 0.5, 1, pose, 1);
      assert.ok(pose[POSE_TEAR_GLOW] >= 0);
    }
  }
});

test("the GLSL carries the tone as the CPU kernel does: a gold ramp and gold tints mixed by uTone, and gold spark heat by uSparkTone", () => {
  assert.match(FIRE_FRAGMENT, /uniform vec2 uTone;/);
  assert.match(FIRE_FRAGMENT, /vec3 rampGold\(float t\)/);
  assert.match(
    FIRE_FRAGMENT,
    /vec3 colour = mix\(rampSooty\(temp\), mix\(rampClean\(temp\), rampGold\(temp\), uTone\.x\), mLocal\);/,
  );
  const tints = FIRE_FRAGMENT.match(/mix\(vec3\([^)]*\), vec3\([^)]*\), uTone\.x\)/g) ?? [];
  assert.equal(tints.length, 5, "flash, ring base, ring slope, tear white, tear halo");
  assert.match(
    FIRE_FRAGMENT,
    /E \+= mix\(vec3\(0\.75, 0\.92, 1\.0\), vec3\(1\.0, 0\.86, 0\.52\), uTone\.x\) \* bloom;/,
  );
  assert.match(SPARK_FRAGMENT, /uniform mediump vec2 uSparkTone;/);
  assert.match(SPARK_FRAGMENT, /vec3 rampHeatGold\(float t\)/);
  assert.match(SPARK_FRAGMENT, /mix\(rampHeat\(vHeat\), rampHeatGold\(vHeat\), uSparkTone\.x\)/);
  const renderer = read("src/lib/rexonance-fire/fire-renderer.js");
  assert.match(renderer, /gl\.uniform2f\(state\.uTone, pose\[POSE_TONE\], 0\);/);
  assert.match(renderer, /gl\.uniform2f\(state\.uSparkTone, pose\[POSE_TONE\], 0\);/);
  // The CPU kernel's mixes are written clean + (gold − clean) × tone, so
  // tone 0 is the single expression it replaced, bit for bit.
  const raster = read("src/lib/rexonance-fire/fire-raster.js");
  assert.match(raster, /const er0 = C\[3\] \+ \(C\[6\] - C\[3\]\) \* tone;/);
  assert.match(raster, /const cr = C\[0\] \+ \(er0 - C\[0\]\) \* mLocal;/);
  assert.match(raster, /er \+= \(FLASH\[0\] \+ FLASH_D\[0\] \* tone\) \* bloom;/);
  assert.doesNotMatch(raster, /tone \? /, "no branch on the tone: one expression for every tone");
});

// A recording 2D context and a document that hands out canvases with it.
function painter() {
  const operations = [];
  const context = {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000",
    save() {},
    restore() {},
    scale() {},
    clearRect() {},
    drawImage(image, ...args) {
      operations.push([
        "image",
        image.dataset?.rexonanceFire || "other",
        ...args,
        this.globalAlpha,
      ]);
    },
    fillRect(...args) {
      operations.push(["rect", ...args, this.globalAlpha, this.fillStyle]);
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() {},
    getImageData(x, y, width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
  };
  return { context, operations };
}
function environment() {
  const document = {
    hidden: false,
    documentElement: { dataset: {} },
    createElement(tag) {
      assert.equal(tag, "canvas");
      return {
        width: 0,
        height: 0,
        dataset: {},
        getContext: (type) => (type === "2d" ? painter().context : null),
      };
    },
  };
  return {
    document,
    navigator: { connection: {} },
    matchMedia: () => ({ matches: false }),
    performance: { now: () => 1000 },
    location: { pathname: "/far-from-saga" },
    // The warm-up's deferred build (0 ms) runs at once; the retention's
    // later checks are left queued.
    setTimeout(fn, ms) {
      if (!ms) fn();
      return 1;
    },
    clearTimeout() {},
    addEventListener() {},
  };
}
async function warmed() {
  const module = await fresh();
  const env = environment();
  assert.equal(await module.warmNaniteFlame(env), true);
  return module;
}

test("the flame module takes the tone on every draw: a changed tone re-renders the frame, the reactor's light and a firebrand's halo turn gold, the CPU sparks take the gold bands", async () => {
  const module = await warmed();
  const torch = NANITE_FIRE_PHASES.cover + 0.005;
  const p = painter();
  module.drawBodyFlame(p.context, SIZE, 1, 0.5, 1, "back", torch);
  assert.equal(module.inspectBodyFlame().tone, 0, "clean by default");
  module.drawBodyFlame(p.context, SIZE, 1, 0.5, 1, "back", torch, FIRE_TONES.gold);
  assert.equal(module.inspectBodyFlame().tone, 1, "re-rendered in gold");
  module.drawBodyFlame(p.context, SIZE, 1, 0.5, 1, "front", torch, 0.25);
  assert.equal(module.inspectBodyFlame().tone, 0.25);
  module.drawBodyFlame(p.context, SIZE, 1, 0.5, 1, "all", torch, 7);
  assert.equal(module.inspectBodyFlame().tone, 1, "clamped");
  // The reactor's light at the clean torch: blue at tone 0 (sprite 1), gold
  // at tone 1 (sprite 4), both between; the green glow is the same.
  const glow = (tone) => {
    const q = painter();
    module.drawBodyFlame(painter().context, SIZE, 1, 0.5, 1, "back", 0.172, tone);
    if (tone === undefined) module.drawNaniteFlame(q.context, [284, 275], 1, 0.5);
    else module.drawNaniteFlame(q.context, [284, 275], 1, 0.5, 1, tone);
    return q.operations.filter((row) => row[0] === "image").map((row) => [row[2], row[10]]);
  };
  const clean = glow(undefined);
  assert.equal(clean.length, 1);
  assert.equal(clean[0][0], 64, "the blue glow");
  assert.deepEqual(glow(FIRE_TONES.clean), clean, "tone 0 is the default, alpha and all");
  const gold = glow(FIRE_TONES.gold);
  assert.equal(gold.length, 1);
  assert.equal(gold[0][0], 256, "the gold glow");
  assert.equal(gold[0][1], clean[0][1], "at the same strength");
  const mixed = glow(0.5);
  assert.deepEqual(
    mixed.map(([x]) => x),
    [64, 256],
  );
  // A firebrand's halo: pink (sprite 3) at tone 0, amber (sprite 5) at 1,
  // its white-cyan core (sprite 2) in both.
  const brand = (tone) => {
    const q = painter();
    module.drawNaniteFirebrand(q.context, 200, 300, 0.8, 0.5, 1, tone);
    return q.operations.map((row) => row[2]);
  };
  assert.deepEqual(brand(0), [192, 128]);
  assert.deepEqual(brand(1), [320, 128]);
  assert.deepEqual(brand(0.5), [192, 320, 128]);
  // The CPU fallback's sparks: the clean bands at tone 0, gold from a half.
  const sparks = (tone) => {
    const q = painter();
    module.drawBodyFlame(q.context, SIZE, 1, 0.5, 1, "front", 0.2, tone);
    return q.operations.filter((row) => row[0] === "rect").map((row) => row[6]);
  };
  const cleanSparks = sparks(0);
  const goldSparks = sparks(1);
  assert.ok(cleanSparks.length > 60);
  assert.equal(goldSparks.length, cleanSparks.length);
  assert.ok(
    cleanSparks.every((fill) =>
      /^rgb\((?:205 110 182|255 143 216|230 190 240|150 236 255|190 245 255|240 250 255)\)$/.test(
        fill,
      ),
    ),
  );
  assert.ok(
    goldSparks.every((fill) =>
      /^rgb\((?:196 92 28|255 150 40|255 190 70|255 215 110|255 236 170|255 250 230)\)$/.test(fill),
    ),
  );
  assert.deepEqual(sparks(0.49), cleanSparks);
  assert.deepEqual(sparks(0.5), goldSparks);
});
