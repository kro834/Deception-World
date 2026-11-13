/* REXONANCE FORM BURST, the stage (see rexonance-form-burst.ts for the play).

   One WebGL1 pass draws the figure through the change — the old armour
   charring under the fire and breaking up in hexagonal cells, the fire
   itself, the blast, the new form in its heat or under the liquid front —
   and a 2D canvas over it carries the particles (sheet sprites only).

   The fire is the suit-up's own medium, not a picture of a flame (owner,
   2026-10-21: flames that sway as rigid images read as solid): two layers
   of turbulence flow up through the body's field at different speeds, so a
   tongue never moves as one piece; it narrows, tears and vanishes as it
   rises; the sheet seen edge-on lights the silhouette; every drift is
   wrapped into the noise's period on the CPU. The noise table is that
   fire's (rexonance-fire/fire-noise.js); the field here is baked from the
   art on screen (its alpha, or the panel painting's capsules).

   This chunk is fetched on demand, by Rexonance's pages only, once a form
   change may play in full motion (rexonance-form-burst-loader.ts). */

import { buildNoiseTable, NOISE_SIZE } from "./rexonance-fire/fire-noise.js";
import { SKIN_CELL_SHEET, buildSkinCellSheet } from "./rexonance-suit-skin";
import {
  FORM_BURST_BAND,
  FORM_BURST_FIELD,
  FORM_BURST_QUALITY,
  FORM_BURST_SHARE,
  FORM_BURST_WHOLE,
  FormBurstGovernor,
  FormBurstParticles,
  bakeFormBurstField,
  buildFormBurstSheet,
  capsuleCover,
  createFormBurstFrame,
  formBurstBudget,
  formBurstFrame,
  type FormBurstCells,
  type FormBurstField,
  type FormBurstFrame,
  type FormBurstKind,
} from "./rexonance-form-burst";

export { FORM_BURST_MS } from "./rexonance-form-burst";
export type { FormBurstKind } from "./rexonance-form-burst";

/* ---------------- the shader ---------------- */

const VERTEX = `attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = vec2(aPosition.x * 0.5 + 0.5, 0.5 - aPosition.y * 0.5);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const f = (x: number) => x.toFixed(4);

// uRect: the art's box in the canvas (uv). uShape: the art's width a
// height, the figure's width in the art's heights, the body's reach from
// the reactor (heights), 1 where the art is a whole painting (no alpha).
// uFire: front, strength, char, white heat. uBlast: the old armour's
// break-up, the blast's reach and gain, the flash. uForm: the new form's
// front, its heat, the emitters' lighting, their bloom. uLate: the glint,
// the unbuilt body, the aura, the settle. uFlow / uDrift: the clock's
// drifts, wrapped. uClock: flicker, seconds (wrapped), the mode.
const FRAGMENT = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform sampler2D uField;
uniform sampler2D uNoise;
uniform vec4 uRect;
uniform vec4 uShape;
uniform vec2 uOrigin;
uniform vec4 uFire;
uniform vec4 uBlast;
uniform vec4 uForm;
uniform vec4 uLate;
uniform vec4 uFlow;
uniform vec4 uDrift;
uniform vec3 uClock;
uniform vec2 uHex;
const float BAND = ${f(FORM_BURST_BAND)};
const float WHOLE = ${f(FORM_BURST_WHOLE)};
const vec3 ICE = vec3(0.59, 0.925, 1.0);
const vec3 PINK = vec3(1.0, 0.56, 0.85);
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// The armour's emitters: its coloured light (never its gold).
float emitter(vec3 c) {
  float hi = max(c.r, max(c.g, c.b));
  float lo = min(c.r, min(c.g, c.b));
  float gold = step(c.b, c.g) * step(c.g, c.r);
  return smoothstep(0.16, 0.42, hi - lo) * (1.0 - gold) * smoothstep(0.3, 0.6, hi);
}
// The armour with its lights held: they stand cold and dim.
vec3 held(vec3 c, float lit) {
  vec3 cold = vec3(luma(c)) * vec3(0.5, 0.56, 0.66);
  return mix(c, cold, lit * 0.86);
}
// The green fire, from its dark emerald edge to its white heart (the
// suit-up fire's forest green: rexonance-fire/fire-tuning.js RAMP_SOOTY).
vec3 ramp(float t) {
  vec3 c = vec3(0.03, 0.26, 0.09);
  c = mix(c, vec3(0.05, 0.4, 0.13), smoothstep(0.0, 0.3, t));
  c = mix(c, vec3(0.2, 0.7, 0.24), smoothstep(0.3, 0.6, t));
  c = mix(c, vec3(0.56, 0.94, 0.44), smoothstep(0.6, 0.85, t));
  c = mix(c, vec3(0.9, 1.0, 0.8), smoothstep(0.85, 1.0, t));
  return c;
}
vec4 inArt(vec4 texel, vec2 a) {
  vec2 q = step(vec2(0.0), a) * step(a, vec2(1.0));
  return texel * q.x * q.y;
}
// A hexagonal cell (pointy top) of width w about p: xy its middle's id.
vec2 hexCell(vec2 p, float w) {
  vec2 hs = vec2(1.0, 1.7320508);
  vec2 hp = p / w;
  vec4 hc = floor(vec4(hp, hp - vec2(0.5, 1.0)) / hs.xyxy) + 0.5;
  vec4 hh = vec4(hp - hc.xy * hs, hp - (hc.zw + 0.5) * hs);
  return dot(hh.xy, hh.xy) < dot(hh.zw, hh.zw) ? hc.xy : hc.zw + 0.5;
}
void main() {
  vec2 a = (vUv - uRect.xy) / uRect.zw;
  vec2 P = vec2(a.x * uShape.x, a.y);
  vec2 O = vec2(uOrigin.x * uShape.x, uOrigin.y);
  vec2 pw = P / uShape.y;
  vec2 fromCore = P - O;
  float fn = length(fromCore) / uShape.z;
  float mode = uClock.z;
  float opaque = uShape.w;
  // The body's field; beyond the art it runs on from the art's edge.
  vec2 over = max(abs(a - 0.5) - 0.5, 0.0) * vec2(uShape.x, 1.0) / uShape.y;
  float beyond = length(over);
  vec4 fld = texture2D(uField, clamp(a, 0.0, 1.0));
  float dOut = fld.r * ${f(FORM_BURST_FIELD.D)} + beyond;
  float lift = fld.g * ${f(FORM_BURST_FIELD.LIFT)} + over.y * step(a.y, 0.0) + over.x * 4.0 + over.y * 4.0 * step(1.0, a.y);
  float din = fld.b * ${f(FORM_BURST_FIELD.IN)};
  float skin = smoothstep(0.35, 0.65, fld.a) * step(beyond, 0.0);
  float air = 1.0 - skin;
  // A whole painting: only its figure burns, breaks and is built.
  float body = mix(1.0, smoothstep(0.25, 0.7, fld.a) * step(beyond, 0.0), opaque);
  // The canvas's own edge never shows: what is in the air fades before it.
  vec2 margin = min(vUv, 1.0 - vUv);
  float window = mix(smoothstep(0.0, 0.07, margin.x) * smoothstep(0.0, 0.07, margin.y), 1.0, opaque);
  vec4 nw = texture2D(uNoise, vec2(pw.x * 0.9, pw.y * 0.45 + uFlow.z));
  // Fixed on the body: the char's seams, the fronts' lobes.
  vec4 ns = texture2D(uNoise, pw * 1.6 + 0.37);
  vec3 rgb = vec3(0.0);
  float alpha = 0.0;
  vec4 settled = inArt(texture2D(uTo, clamp(a, 0.0, 1.0)), a);
  if (mode < 0.5) {
    // ---- MAX: burned by green fire, and it explodes apart. ----
    vec4 nr = texture2D(uNoise, vec2(pw.x * 0.6, pw.y * 0.3 + uFlow.w));
    float reach = (0.14 + 0.38 * nr.r) * (1.0 - 0.3 * opaque);
    float surface = min(lift, dOut * 3.5);
    float rag = (nw.b * 0.55 + nw.g * 0.3 + nw.a * 0.15 - 0.5) * 0.65 * smoothstep(0.0, 0.06, surface)
      * (1.0 - smoothstep(0.45, 1.0, surface / reach));
    float height = max(0.0, surface + rag) * air;
    float fall = clamp(height / reach, 0.0, 1.0);
    float flutter = (nw.r - 0.5 + (nw.b - 0.5) * 0.7) * 0.16 * (0.25 + fall);
    float rise = pw.y + height - log(1.0 + 4.0 * height) * 0.25 + (nw.g - 0.5) * 0.05;
    vec4 sa = texture2D(uNoise, vec2((pw.x + flutter) * 1.25, rise * 0.5208 + uFlow.x));
    vec4 sb = texture2D(uNoise, vec2((pw.x + flutter * 1.4) * 2.3 + 0.31, rise * 1.353 + uFlow.y));
    float n = ((sa.r * 0.62 + sa.g * 0.38) * 0.68 + (sb.g * 0.55 + sb.b * 0.45) * 0.32 - 0.5) * 2.4 + 0.5;
    vec4 ss = texture2D(uNoise, vec2(pw.x * 2.1 + 0.53, pw.y * 0.6176 + uDrift.w));
    float nS = ((ss.g * 0.6 + ss.b * 0.4) * 0.8 + (sa.r * 0.62 + sa.g * 0.38) * 0.2 - 0.5) * 2.4 + 0.5;
    // The front: ragged, and the tongues below lick up past it.
    vec4 ne = texture2D(uNoise, vec2(pw.x * 1.3, pw.y * 0.585 + uDrift.x));
    float edge = ne.r * 0.5 + ne.g * 0.3 + ne.b * 0.2 - 0.5;
    float aEff = fn + edge * 0.34 - max(0.0, n - 0.5) * 0.2 - max(0.0, nS - 0.5) * 0.12 + height * 0.15;
    float fresh = clamp((uFire.x - aEff) / 0.1, 0.0, 1.0);
    float lit = fresh * fresh * (3.0 - 2.0 * fresh);
    float flare = 1.0 + 2.5 * lit * (1.0 - lit);
    float kindling = (1.0 - fresh) * (1.0 - fresh) * 0.6;
    vec4 nf = texture2D(uNoise, pw * 1.1 + vec2(0.0, uDrift.y));
    float flick = (1.0 + uClock.x) * (0.85 + 0.3 * nf.g);
    float thr = mix(0.2, 1.0, pow(fall, 1.25)) + kindling;
    float core = smoothstep(thr, thr + 0.1, n);
    float halo = smoothstep(thr - 0.16, thr + 0.1, n);
    float plume = (core * 0.7 + halo * 0.3) * air * (1.0 - smoothstep(0.7, 1.0, fall));
    float plumeHeat = (0.4 + 0.6 * clamp((n - thr) / 0.35, 0.0, 1.0)) * (1.0 - 0.75 * fall);
    float rim = exp(-din / 0.028) * skin * (0.3 + 0.7 * smoothstep(0.3, 0.75, n));
    // Over the armour the fire is thin: the char shows through it.
    float sheet = (0.06 + 0.94 * smoothstep(0.5 + kindling, 0.84 + kindling, nS)) * skin;
    float dens = min(1.0, plume + rim * 0.5 + sheet * 0.5) * lit * uFire.y;
    float np = texture2D(uNoise, pw * 0.9 + vec2(0.0, uDrift.z)).r;
    float temp = clamp((plume * plumeHeat + rim * 0.8 + sheet * 0.62) * lit * flare * flick * (0.68 + 0.32 * np), 0.0, 1.0);
    temp = min(1.0, temp + uFire.w * 0.4 * dens);
    vec3 E = ramp(temp) * clamp(dens * flick, 0.0, 1.0);
    float absorb = dens * (1.0 - 0.5 * temp) * 0.3;
    // The blast: the fire thrown out from the reactor, hollowing as it goes.
    if (uBlast.z > 0.0) {
      float far = length(fromCore);
      vec2 dir = fromCore / max(far, 0.0001);
      float rb = uShape.z * (0.14 + 0.9 * (1.0 - pow(1.0 - uBlast.y, 2.2)));
      vec4 nb = texture2D(uNoise, (pw - dir * uBlast.y * 0.55) * 1.4 + vec2(0.11, uFlow.x));
      float nbv = nb.r * 0.5 + nb.g * 0.32 + nb.b * 0.18;
      float shell = 1.0 - smoothstep(rb * 0.45, rb, far + (nbv - 0.5) * 0.6 * uShape.z);
      float hollow = smoothstep(rb * 0.2, rb * 0.85, far + (nb.a - 0.5) * 0.2 * uShape.z);
      float bd = shell * mix(1.0, hollow, smoothstep(0.15, 0.7, uBlast.y)) * uBlast.z
        * smoothstep(0.3, 0.62, nbv + 0.34 * (1.0 - uBlast.y));
      bd *= mix(smoothstep(0.0, 0.2, margin.x) * smoothstep(0.0, 0.32, margin.y), 1.0, opaque);
      E += ramp(clamp(bd * (0.84 - 0.44 * uBlast.y), 0.0, 1.0)) * bd;
      absorb += bd * 0.2;
    }
    // Heat shimmer: the picture swims a little where the fire stands.
    float haze = uFire.y * lit * (1.0 - smoothstep(0.0, 0.3, dOut)) * 0.006;
    vec2 swim = (nw.rg - 0.5) * haze / vec2(uShape.x, 1.0);
    vec4 from = inArt(texture2D(uFrom, clamp(a + swim, 0.0, 1.0)), a);
    vec4 to = settled;
    // The old armour: charred, its seams glowing, white at the last.
    vec3 fc = from.rgb / max(from.a, 0.001);
    float heat = uFire.z * lit;
    float ridge = 1.0 - abs(ns.g * 2.0 - 1.0);
    // What was bright on it glows on as the rest goes dark: its trims and
    // its lights, like embers in the char; and a few cracks.
    float trim = smoothstep(0.4, 0.8, luma(fc));
    float seam = smoothstep(0.9, 0.99, ridge) * smoothstep(0.5, 0.68, ns.b) * 0.8;
    vec3 charred = mix(fc, vec3(luma(fc)) * vec3(0.17, 0.2, 0.17) + vec3(0.0, 0.012, 0.004), heat * 0.92 * body);
    charred += vec3(0.3, 1.0, 0.46) * (trim * 0.75 + seam) * heat * body * (0.6 + 0.7 * nf.g) * (1.0 + uFire.w * 1.2);
    charred += ramp(0.62) * 0.26 * lit * uFire.y * (1.0 - heat * 0.55) * mix(1.0, 0.5 + 0.5 * body, opaque);
    charred = mix(charred, vec3(0.72, 1.0, 0.76), uFire.w * 0.5 * body * (0.4 + 0.6 * trim));
    // It breaks up in cells, from the reactor out.
    vec2 id = hexCell(pw, uHex.y);
    float goes = hash(id) * 0.3 + fn * 0.62;
    float gone = step(goes, uBlast.x);
    float oldA = from.a * (1.0 - gone);
    // MAX, from the blast's middle out, still white with the fire's heat.
    vec3 tc = to.rgb / max(to.a, 0.001);
    float fnR = fn + (ns.r - 0.5) * 0.3;
    float shown = max(opaque, smoothstep(0.0, 0.12, uForm.x - fnR));
    float lip = exp(-pow((uForm.x - fnR - 0.05) / 0.07, 2.0)) * step(0.001, uForm.x) * step(uForm.x, WHOLE - 0.01);
    float glowing = emitter(tc);
    float litE = uForm.z < 0.0 ? 0.0 : smoothstep(0.0, 0.12, uForm.z - fn);
    float wave = uForm.z < 0.0 ? 0.0 : exp(-pow((uForm.z - fn) / 0.16, 2.0));
    vec3 nc = held(tc, glowing * (1.0 - litE) * 0.6) + tc * glowing * wave * 0.9;
    vec3 hot = nc * 1.18 + vec3(0.24, 0.8, 0.4) * (0.16 + 0.34 * luma(tc));
    nc = mix(nc, hot, uForm.y * (0.5 + 0.25 * ns.g) * body);
    nc += vec3(0.7, 1.0, 0.75) * lip * 0.8;
    float glint = uLate.x < -0.5 ? 0.0 : exp(-pow((a.x * 0.4 + a.y - uLate.x) / 0.05, 2.0));
    nc += vec3(0.9, 1.0, 0.94) * glint * 0.55 * (0.25 + luma(tc));
    float newA = to.a * shown;
    rgb = charred * oldA + nc * newA * (1.0 - oldA);
    alpha = oldA + newA * (1.0 - oldA);
    E *= window;
    rgb = rgb * (1.0 - min(1.0, absorb)) + E;
    alpha = alpha + (1.0 - alpha) * min(1.0, max(max(E.r, max(E.g, E.b)), absorb * window));
    float flash = uBlast.w * exp(-dot(fromCore, fromCore) / (uShape.y * uShape.y) * 6.0) * window;
    rgb += vec3(0.8, 1.0, 0.86) * flash;
    alpha = max(alpha, flash);
  } else if (mode < 1.5) {
    // ---- ULTRA: it explodes apart, and takes the cells in. ----
    vec4 from = inArt(texture2D(uFrom, clamp(a, 0.0, 1.0)), a);
    vec4 to = settled;
    vec3 fc = from.rgb / max(from.a, 0.001);
    vec2 id = hexCell(pw, uHex.y);
    float goes = hash(id) * 0.34 + fn * 0.6;
    float gone = step(goes, uBlast.x);
    float flare = smoothstep(goes - 0.16, goes, uBlast.x) * (1.0 - gone);
    vec3 oc = fc + vec3(0.82, 0.92, 1.0) * flare * (0.12 + 0.4 * body) + ICE * uFire.w * exp(-fn * fn * 9.0) * 0.6;
    float oldA = from.a * (1.0 - gone);
    vec3 tc = to.rgb / max(to.a, 0.001);
    float light = luma(tc);
    float glowing = emitter(tc);
    float litE = step(0.0, uForm.z);
    vec3 armour = held(tc, glowing * (1.0 - litE)) + tc * glowing * uForm.w * 0.5 + vec3(0.9, 0.86, 1.0) * uForm.w * 0.1 * light;
    // The unbuilt body: a dark glass of itself.
    vec3 ghost = vec3(light) * vec3(0.2, 0.19, 0.32) + vec3(0.016, 0.016, 0.04) + ICE * 0.1 * exp(-din / 0.012);
    float fnL = fn + (ns.r - 0.5) * 0.24 + (ns.b - 0.5) * 0.08;
    float af = (uForm.x - fnL) / BAND;
    vec3 nc = ghost;
    float newA = to.a * mix(uLate.y * 0.9, 1.0, opaque);
    if (af >= 0.0) {
      // Liquid chrome (the suit-up's skin): a raised bead at the lip, the
      // room sliding over it, then cells that click solid one by one and
      // take the art's colour.
      vec2 p = pw * 571.0;
      vec2 flow = fromCore / max(length(fromCore), 0.0001);
      float bead = cos(clamp(af, 0.0, 1.0) * 3.14159);
      float facing = 0.5 + 0.5 * bead * dot(flow, normalize(vec2(-0.5, -0.8)));
      float room = 0.5 + 0.5 * sin(p.y * 0.11 + p.x * 0.05 + uClock.y * 2.6 + fnL * 40.0);
      vec3 chrome = mix(vec3(0.085, 0.095, 0.115), vec3(0.6, 0.64, 0.68), facing * (0.55 + 0.45 * room));
      chrome = mix(chrome, chrome * (0.6 + 0.9 * light), 0.5);
      float stripe = smoothstep(0.4, 0.5, abs(fract(dot(p, vec2(-flow.y, flow.x)) * 0.33) - 0.5) * 2.0);
      vec3 fibre = mix(vec3(0.1, 0.11, 0.13), vec3(light) * vec3(0.8, 0.87, 0.95), 0.42) * (0.66 + 0.5 * stripe);
      vec3 metal = mix(chrome, fibre, smoothstep(0.8, 1.5, af));
      vec2 hs = vec2(1.0, 1.7320508);
      vec2 hp = p / uHex.x;
      vec4 hc = floor(vec4(hp, hp - vec2(0.5, 1.0)) / hs.xyxy) + 0.5;
      vec4 hh = vec4(hp - hc.xy * hs, hp - (hc.zw + 0.5) * hs);
      vec4 cell = dot(hh.xy, hh.xy) < dot(hh.zw, hh.zw) ? vec4(hh.xy, hc.xy) : vec4(hh.zw, hc.zw + 0.5);
      vec2 q = abs(cell.xy);
      float seamAt = max(dot(q, hs * 0.5), q.x);
      float threshold = hash(cell.zw);
      float age = ((af - 2.4) / 2.5 - threshold * 0.82) / 0.18;
      float solid = step(0.0, age);
      float paint = smoothstep(0.0, 1.0, age);
      float tilt = hash(cell.zw + 7.31) - 0.5;
      vec3 facet = metal * (0.9 + 0.7 * tilt) + vec3(0.07, 0.09, 0.11);
      float tess = smoothstep(1.7, 2.4, af);
      float cut = smoothstep(0.4, 0.5, seamAt);
      vec3 liquid = mix(metal, facet, 0.5 * tess);
      liquid = mix(liquid, liquid * 0.5, cut * tess * 0.7);
      vec3 celled = mix(facet, armour * (1.0 + 0.1 * tilt * (1.0 - smoothstep(1.0, 3.0, age))), paint);
      celled += (0.35 * exp(-max(age, 0.0) * 2.6)) * mix(vec3(0.8, 0.9, 1.0), armour, 0.4);
      celled = mix(celled, celled * 0.42 + ICE * 0.12, cut * (1.0 - smoothstep(0.6, 2.4, age)));
      nc = mix(liquid, celled, solid);
      float lip = 1.0 - smoothstep(0.0, 0.2, af);
      nc += vec3(0.91, 0.95, 1.0) * lip * 0.95;
      nc += mix(ICE, PINK, hash(floor(p / 9.0))) * lip * 0.22;
      newA = to.a * mix(mix(uLate.y * 0.9, 1.0, smoothstep(0.0, 0.06, af)), 1.0, opaque);
    } else {
      // The lip's shadow, just ahead of it.
      nc *= 1.0 - 0.45 * smoothstep(-0.6, 0.0, af);
    }
    // A whole painting: only its figure is built; the rest simply stands.
    float figure = mix(1.0, smoothstep(0.3, 0.62, fld.a), opaque);
    nc = mix(armour, nc, figure);
    float glint = uLate.x < -0.5 ? 0.0 : exp(-pow((a.x * 0.4 + a.y - uLate.x) / 0.05, 2.0));
    nc += vec3(0.94, 0.94, 1.0) * glint * 0.55 * (0.25 + light) * figure;
    rgb = oc * oldA + nc * newA * (1.0 - oldA);
    alpha = oldA + newA * (1.0 - oldA);
    // The completion's light about the figure, and the local flash.
    float aura = uLate.z * exp(-dOut / 0.1) * mix(air, 0.35, opaque) * window;
    rgb += mix(ICE, PINK, ns.g) * aura * 0.5;
    alpha = max(alpha, aura * 0.6);
    float flash = uBlast.w * exp(-dot(fromCore, fromCore) / (uShape.y * uShape.y) * 5.0) * window;
    rgb += vec3(0.9, 0.9, 1.0) * flash * 0.8;
    alpha = max(alpha, flash);
  } else {
    // ---- RELEASE: the front draws back into the reactor. ----
    vec4 from = inArt(texture2D(uFrom, clamp(a, 0.0, 1.0)), a);
    vec4 to = settled;
    vec3 fc = from.rgb / max(from.a, 0.001);
    float fnL = fn + (ns.r - 0.5) * 0.2;
    float keep = smoothstep(0.0, 0.05, uForm.x - fnL);
    float lip = exp(-pow((uForm.x - fnL) / 0.04, 2.0)) * step(0.001, uForm.x) * step(uForm.x, WHOLE - 0.01);
    vec3 oc = held(fc, emitter(fc) * uForm.y);
    rgb = mix(to.rgb, oc * from.a, keep);
    alpha = mix(to.a, from.a, keep);
    rgb += mix(vec3(0.91, 0.95, 1.0), ICE, 0.4) * lip * 0.85 * max(from.a, to.a);
    rgb += ICE * uFire.w * exp(-fn * fn * 42.0) * 0.55 * to.a;
  }
  // The last moments: the new form's art, exactly.
  rgb = mix(rgb, settled.rgb, uLate.w);
  alpha = mix(alpha, settled.a, uLate.w);
  gl_FragColor = vec4(rgb, alpha);
}`;

/* ---------------- the renderer ---------------- */

const UNIFORMS = [
  "uFrom",
  "uTo",
  "uField",
  "uNoise",
  "uRect",
  "uShape",
  "uOrigin",
  "uFire",
  "uBlast",
  "uForm",
  "uLate",
  "uFlow",
  "uDrift",
  "uClock",
  "uHex",
] as const;

const wrap = (x: number) => x - Math.floor(x);
let noiseTable: Uint8Array | null = null;

/** The figure's canvas: the program, the noise, and a play's own pictures. */
class FormBurstRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private textures: (WebGLTexture | null)[] = [null, null, null, null];
  lost = false;
  private onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
  };

  static create() {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "low-power",
      });
      return gl ? new FormBurstRenderer(canvas, gl) : null;
    } catch {
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("shader");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader) ?? "compile");
      return shader;
    };
    const program = gl.createProgram();
    if (!program) throw new Error("program");
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? "link");
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    for (const name of UNIFORMS) this.uniforms[name] = gl.getUniformLocation(program, name);
    UNIFORMS.slice(0, 4).forEach((name, unit) => gl.uniform1i(this.uniforms[name], unit));
    noiseTable ??= buildNoiseTable(NOISE_SIZE);
    this.texture(3, false, true, () =>
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        NOISE_SIZE,
        NOISE_SIZE,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        noiseTable,
      ),
    );
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    canvas.addEventListener("webglcontextlost", this.onLost);
  }

  private texture(unit: number, premultiply: boolean, repeat: boolean, upload: () => void) {
    const gl = this.gl;
    if (this.textures[unit]) gl.deleteTexture(this.textures[unit]);
    const made = gl.createTexture();
    if (!made) throw new Error("texture");
    this.textures[unit] = made;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, made);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply ? 1 : 0);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    upload();
    const wrapMode = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
  }

  /** A play's pictures: the two forms' art and the body's field. */
  load(from: TexImageSource, to: TexImageSource, field: FormBurstField) {
    const gl = this.gl;
    const picture = (unit: number, source: TexImageSource) =>
      this.texture(unit, true, false, () =>
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source),
      );
    picture(0, from);
    picture(1, to);
    this.texture(2, false, false, () =>
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        field.w,
        field.h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        field.bytes,
      ),
    );
  }

  resize(width: number, height: number) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  render(
    frame: FormBurstFrame,
    seconds: number,
    rect: readonly [number, number, number, number],
    shape: readonly [number, number, number, number],
    origin: readonly [number, number],
    hex: readonly [number, number],
  ) {
    const gl = this.gl;
    if (this.lost) return;
    const u = this.uniforms;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform4f(u.uRect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform4f(u.uShape, shape[0], shape[1], shape[2], shape[3]);
    gl.uniform2f(u.uOrigin, origin[0], origin[1]);
    gl.uniform4f(u.uFire, frame.cover, frame.fire, frame.char, frame.swell);
    gl.uniform4f(u.uBlast, frame.shatter, frame.blast, frame.blastGain, frame.flash);
    gl.uniform4f(u.uForm, frame.front, frame.cool, frame.emit, frame.bloom);
    gl.uniform4f(u.uLate, frame.glint, frame.ghost, frame.aura, frame.settle);
    // The clock's drifts, each wrapped into the noise's period (the
    // suit-up fire's own speeds: rexonance-fire/fire-pose.js).
    const t = seconds;
    gl.uniform4f(u.uFlow, wrap(t * 0.651), wrap(t * 2.841), wrap(t * 0.55), wrap(t * 0.35));
    gl.uniform4f(u.uDrift, wrap(t * 0.25), wrap(t * 2.4), wrap(t * 0.8), wrap(t * 1.482));
    gl.uniform3f(
      u.uClock,
      0.07 * (Math.sin(t * 60.9) + 0.6 * Math.sin(t * 83.6 + 1.7)),
      t % 1000,
      frame.mode,
    );
    gl.uniform2f(u.uHex, hex[0], hex[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    try {
      for (const texture of this.textures) if (texture) this.gl.deleteTexture(texture);
      this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      // (A context already gone.)
    }
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}

/* One renderer is kept between plays (a re-pick, the next form) and let go
   once none has played for a while: a page holds at most one idle context
   of this layer's, and none for long. */
const IDLE_MS = 20000;
let spare: FormBurstRenderer | null = null;
let spareTimer = 0;
const takeRenderer = () => {
  globalThis.clearTimeout(spareTimer);
  const kept = spare;
  spare = null;
  if (kept && !kept.lost) return kept;
  kept?.dispose();
  return FormBurstRenderer.create();
};
const giveRenderer = (renderer: FormBurstRenderer) => {
  globalThis.clearTimeout(spareTimer);
  if (spare || renderer.lost) {
    renderer.dispose();
    return;
  }
  renderer.canvas.remove();
  renderer.resize(1, 1);
  spare = renderer;
  spareTimer = globalThis.setTimeout(() => {
    spare?.dispose();
    spare = null;
  }, IDLE_MS) as unknown as number;
};

/** Whether a play is to be had here at all: full motion and WebGL. (It
 * compiles the program once, ahead of the first play.) */
export function warmFormBurst() {
  if (!formBurstBudget()) return false;
  if (spare && !spare.lost) return true;
  const renderer = takeRenderer();
  if (!renderer) return false;
  giveRenderer(renderer);
  return true;
}

/* ---------------- the sheets ---------------- */

let ownSheet: HTMLCanvasElement | null = null;
let cellSheet: HTMLCanvasElement | null = null;
const makeCanvas = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};
const CELLS: FormBurstCells = {
  plate: SKIN_CELL_SHEET.plate,
  plates: 4,
  speckY: SKIN_CELL_SHEET.plate + SKIN_CELL_SHEET.flash,
  speck: SKIN_CELL_SHEET.speck,
  tones: 3,
  turns: SKIN_CELL_SHEET.turns,
};

/* ---------------- a play ---------------- */

type Box = { left: number; top: number; width: number; height: number };

export type FormBurstOptions = {
  kind: FormBurstKind;
  /** The canvases are laid in this element (it is positioned). */
  host: HTMLElement;
  /** They follow this element in it (default: last). */
  after?: Element | null;
  /** The layer's own box in the host (default: all of it), CSS px. */
  frame?: () => Box;
  /** In the layer's CSS px: the art's box; how far the figure's canvas may
   * reach past it (shares of the art's box); and the particles' box
   * (default: the figure's canvas's). All are kept inside `clip`. */
  art: () => Box;
  bleed?: { x: number; top: number; bottom: number };
  air?: () => Box;
  clip?: () => Box;
  /** The two forms' art, decoded. */
  from: HTMLImageElement;
  to: HTMLImageElement;
  /** The body: the art's own alpha (a cut-out figure), or capsules over a
   * whole painting ([x0, y0, x1, y1, r]). */
  body: "alpha" | readonly (readonly number[])[];
  /** The reactor in the art, and the figure's width in the art's heights. */
  origin: readonly [number, number];
  unit: number;
  /** The play starts this long after it is mounted (ms). */
  delay?: number;
  zIndex?: number;
  /** Each drawn frame (the caller may move the layer with what is under it). */
  onFrame?: (layer: HTMLElement) => void;
  /** The first frame is on screen: what stands under it may be hidden. */
  onShown?: () => void;
  /** The new form is the one on screen from here on. */
  onSwap?: () => void;
  /** The play is over: the new form's art stands on the layer, exactly,
   * until the caller ends it (`cancel`). */
  onDone?: () => void;
};

export type FormBurstPlay = {
  /** Ends the play wherever it is and removes everything of it. */
  cancel(): void;
  readonly swapped: boolean;
  readonly done: boolean;
  /** The governor's level (0: the device's full budget). */
  readonly level: number;
  /** Drawn in the last frame. */
  readonly live: number;
};

const FIELD_H = 104;
/** A play left out of view (or in a hidden tab) this long is not resumed. */
const AWAY_MS = 1200;

/** Starts a play. Null where it cannot be had (reduced motion, no WebGL,
 * the art not decoded): the caller changes form its plain way. */
export function playFormBurst(options: FormBurstOptions): FormBurstPlay | null {
  const budget = formBurstBudget();
  const { from, to, kind, host } = options;
  if (!budget || !from.naturalWidth || !to.naturalWidth) return null;
  const renderer = takeRenderer();
  if (!renderer) return null;
  const aspect = to.naturalWidth / to.naturalHeight;
  // The body's field, from the art's alpha or the painting's capsules.
  const fw = Math.max(8, Math.round(FIELD_H * aspect));
  let cover: Float32Array | null = null;
  if (options.body === "alpha") {
    const scratch = makeCanvas(fw, FIELD_H);
    const context = scratch.getContext("2d", { willReadFrequently: true });
    if (context) {
      // (Either form's: a point on one is on the other, near enough.)
      context.drawImage(from, 0, 0, fw, FIELD_H);
      context.globalAlpha = 0.5;
      context.drawImage(to, 0, 0, fw, FIELD_H);
      const pixels = context.getImageData(0, 0, fw, FIELD_H).data;
      cover = new Float32Array(fw * FIELD_H);
      for (let n = 0; n < cover.length; n += 1) cover[n] = pixels[n * 4 + 3] / 255;
    }
    scratch.width = scratch.height = 0;
  } else cover = capsuleCover(fw, FIELD_H, options.body);
  if (!cover) {
    giveRenderer(renderer);
    return null;
  }
  const field = bakeFormBurstField(cover, fw, FIELD_H, FIELD_H * options.unit);
  let reach = 0.2;
  for (let n = 0; n < field.points.length; n += 2)
    reach = Math.max(
      reach,
      Math.hypot((field.points[n] - options.origin[0]) * aspect, field.points[n + 1] - options.origin[1]),
    );
  try {
    renderer.load(from, to, field);
  } catch {
    renderer.dispose();
    return null;
  }
  ownSheet ??= buildFormBurstSheet(makeCanvas);
  cellSheet ??= buildSkinCellSheet(makeCanvas);
  const particles = new FormBurstParticles(budget, field.points, aspect, options.origin, reach);
  const governor = new FormBurstGovernor();
  const frame = createFormBurstFrame();

  const layer = document.createElement("i");
  layer.className = "rxf-burst";
  layer.setAttribute("aria-hidden", "true");
  layer.dataset.kind = kind;
  Object.assign(layer.style, {
    position: "absolute",
    inset: "0",
    zIndex: String(options.zIndex ?? 1),
    pointerEvents: "none",
    display: "block",
  });
  const figure = renderer.canvas;
  const air = document.createElement("canvas");
  for (const canvas of [figure, air])
    Object.assign(canvas.style, { position: "absolute", display: "block", pointerEvents: "none" });
  layer.append(figure, air);
  if (options.after) options.after.after(layer);
  else host.append(layer);
  const context = air.getContext("2d");

  // The boxes (CSS px in the host), measured when the play starts and when
  // the host's size changes.
  let measured = false;
  let quality = -1;
  const figureBox: Box = { left: 0, top: 0, width: 0, height: 0 };
  const airBox: Box = { left: 0, top: 0, width: 0, height: 0 };
  let artBox: Box = { left: 0, top: 0, width: 0, height: 0 };
  let figureRatio = 1;
  let airRatio = 1;
  const within = (box: Box, clip: Box | null, out: Box) => {
    const left = clip ? Math.max(box.left, clip.left) : box.left;
    const top = clip ? Math.max(box.top, clip.top) : box.top;
    const right = clip ? Math.min(box.left + box.width, clip.left + clip.width) : box.left + box.width;
    const bottom = clip ? Math.min(box.top + box.height, clip.top + clip.height) : box.top + box.height;
    out.left = Math.floor(left);
    out.top = Math.floor(top);
    out.width = Math.max(1, Math.ceil(right) - out.left);
    out.height = Math.max(1, Math.ceil(bottom) - out.top);
  };
  const measure = () => {
    artBox = options.art();
    if (!artBox.width || !artBox.height) return false;
    const own = options.frame?.();
    if (own)
      Object.assign(layer.style, {
        inset: "auto",
        left: `${own.left}px`,
        top: `${own.top}px`,
        width: `${own.width}px`,
        height: `${own.height}px`,
      });
    const clip = options.clip?.() ?? null;
    const bleed = options.bleed ?? { x: 0, top: 0, bottom: 0 };
    within(
      {
        left: artBox.left - artBox.width * bleed.x,
        top: artBox.top - artBox.height * bleed.top,
        width: artBox.width * (1 + 2 * bleed.x),
        height: artBox.height * (1 + bleed.top + bleed.bottom),
      },
      clip,
      figureBox,
    );
    within(options.air?.() ?? figureBox, clip, airBox);
    for (const [canvas, box] of [
      [figure, figureBox],
      [air, airBox],
    ] as const)
      Object.assign(canvas.style, {
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      });
    measured = true;
    quality = -1;
    return true;
  };
  const size = (level: number) => {
    if (quality === level) return;
    quality = level;
    const device = globalThis.devicePixelRatio || 1;
    // Never past the art's own pixels; less when frames run long.
    figureRatio =
      Math.min(device, budget.ratio, to.naturalHeight / Math.max(1, artBox.height)) *
      FORM_BURST_QUALITY[level];
    renderer.resize(
      Math.max(1, Math.round(figureBox.width * figureRatio)),
      Math.max(1, Math.round(figureBox.height * figureRatio)),
    );
    airRatio = Math.min(device, budget.air);
    const width = Math.max(1, Math.round(airBox.width * airRatio));
    const height = Math.max(1, Math.round(airBox.height * airRatio));
    if (air.width !== width) air.width = width;
    if (air.height !== height) air.height = height;
  };

  let raf = 0;
  let last = 0;
  let elapsed = -(options.delay ?? 0);
  let shown = false;
  let swapped = false;
  let done = false;
  let ended = false;
  let visible = true;
  let away = 0;
  let awayTimer = 0;
  const rect: [number, number, number, number] = [0, 0, 1, 1];
  const shape: [number, number, number, number] = [
    aspect,
    options.unit,
    reach,
    options.body === "alpha" ? 0 : 1,
  ];
  const hex: [number, number] = [8.5, 0.052];
  const view = { x: 0, y: 0, w: 0, h: 0, px: 1, origin: options.origin };
  const draw = (wall: number) => {
    if (!measured && !measure()) return false;
    const ms = elapsed > 0 ? elapsed : 0;
    formBurstFrame(frame, kind, ms);
    size(governor.level);
    rect[0] = (artBox.left - figureBox.left) / figureBox.width;
    rect[1] = (artBox.top - figureBox.top) / figureBox.height;
    rect[2] = artBox.width / figureBox.width;
    rect[3] = artBox.height / figureBox.height;
    // The liquid's cells: the suit-up skin's (8.5 figure px, or 4 on screen).
    hex[0] = Math.max(8.5, (4 * 571 * options.unit) / Math.max(1, artBox.height * figureRatio));
    renderer.render(frame, wall / 1000, rect, shape, options.origin, hex);
    if (context) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, air.width, air.height);
      view.x = (artBox.left - airBox.left) * airRatio;
      view.y = (artBox.top - airBox.top) * airRatio;
      view.w = artBox.width * airRatio;
      view.h = artBox.height * airRatio;
      view.px = airRatio;
      particles.draw(
        context,
        kind,
        ms,
        wall,
        view,
        ownSheet,
        cellSheet,
        CELLS,
        FORM_BURST_SHARE[governor.level],
      );
    }
    options.onFrame?.(layer);
    return true;
  };
  const tick = (now: number) => {
    raf = 0;
    if (ended || done) return;
    if (document.hidden || !visible) {
      // Paused: the clock stands until the layer is seen again.
      last = 0;
      away ||= now;
      // Left away, it ends there: its context and layer are not kept for
      // a reader who may never come back (the new form stands).
      if (!awayTimer && elapsed > 0)
        awayTimer = globalThis.setTimeout(() => {
          awayTimer = 0;
          if (document.hidden || !visible) finish();
        }, AWAY_MS) as unknown as number;
      return;
    }
    // Seen again after a while away: the reader finds the new form.
    if (away && now - away > AWAY_MS && elapsed > 0) {
      finish();
      return;
    }
    away = 0;
    globalThis.clearTimeout(awayTimer);
    awayTimer = 0;
    if (renderer.lost) {
      // The context is gone: the play is over, the new form stands.
      finish();
      return;
    }
    const dt = last ? Math.min(50, Math.max(0, now - last)) : 0;
    last = now;
    elapsed += dt;
    if (elapsed > 0) governor.sample(dt);
    if (draw(now)) {
      if (!shown) {
        shown = true;
        options.onShown?.();
      }
      if (frame.swapped && !swapped) {
        swapped = true;
        options.onSwap?.();
      }
      if (frame.done) {
        finish();
        return;
      }
    }
    raf = requestAnimationFrame(tick);
  };
  /** The new form's art on the 2D canvas (a WebGL canvas may be cleared
   * behind our back); nothing of the play is left in the air. */
  const hold = () => {
    if (!context || !measured) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, air.width, air.height);
    context.drawImage(
      to,
      (artBox.left - airBox.left) * airRatio,
      (artBox.top - airBox.top) * airRatio,
      artBox.width * airRatio,
      artBox.height * airRatio,
    );
    figure.style.visibility = "hidden";
  };
  const finish = () => {
    if (done || ended) return;
    done = true;
    if (!swapped) {
      swapped = true;
      options.onSwap?.();
    }
    hold();
    options.onDone?.();
  };
  const wake = () => {
    if (raf || ended || done) return;
    // (One more frame as it goes out of view: it notes when it left.)
    raf = requestAnimationFrame(tick);
  };
  const intersection =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          visible = entries.some((entry) => entry.isIntersecting);
          wake();
        })
      : null;
  intersection?.observe(layer);
  const resize =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          measured = false;
          // The held picture follows the host's new size.
          if (done && !ended && measure()) {
            size(governor.level);
            hold();
          }
        })
      : null;
  resize?.observe(host);
  document.addEventListener("visibilitychange", wake);
  // The first frame now, before anything under the layer is hidden.
  if (draw(performance.now())) {
    shown = true;
    options.onShown?.();
  }
  wake();
  return {
    cancel() {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      globalThis.clearTimeout(awayTimer);
      raf = 0;
      intersection?.disconnect();
      resize?.disconnect();
      document.removeEventListener("visibilitychange", wake);
      figure.style.visibility = "";
      layer.remove();
      air.width = air.height = 0;
      giveRenderer(renderer);
    },
    get swapped() {
      return swapped;
    },
    get done() {
      return done;
    },
    get level() {
      return governor.level;
    },
    get live() {
      return particles.live;
    },
  };
}
