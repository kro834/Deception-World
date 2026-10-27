// Dream chapter GPU layer. Loaded only after src/lib/dream-gpu/dream-gpu-tier.ts
// has found WebGPU (and motion allowed), so none of this is in the startup bundle.
//
//   startLamplightOverlay(canvas, { getDeskRect })  Tier A + B: a full-viewport,
//     pointer-events:none canvas. Volumetric lamp shafts through drifting dust,
//     three parallax depths of motes, a slow projector breathe, the pointer's
//     lantern, gold filigree that traces every ticket / chip / button of the desk
//     as it scrolls into view, hover halation and press ripples on those
//     hotspots, brass comets round the desk frame, and a gold curtain sweep on
//     section changes (ticket, hash, reel turn).
//   startDeskStage(canvas, element)                   Tier A: the real desk DOM
//     (child of a <canvas layoutsubtree>) is copied into a texture with
//     GPUQueue.drawElementImageToTexture and redrawn in four passes: bright
//     extract (quarter res), separable gaussian bloom, then a composite with a
//     projector lens (barrel, gate weave, hairline scratches), plate
//     misregistration, halation, paper sheen and the click's gate slip + paper
//     tear. The DOM keeps hit testing and the accessibility tree.
//
// Photosensitivity: no full-area flash; the projector breathe is ≤ 6% and slower
// than 1 Hz; sweeps are thin bands that follow a user action (≥ 1 s apart);
// the click is a film-gate slip and a paper tear (geometry moves, luminance
// stays put); vermilion is only a slow ambient ramp.

import { gui } from "./dream-gui-physics.js";

const HOT_MAX = 16;
const INK_MAX = 12;
// floats: 28 scalars/vec4 slots, then HOT_MAX rects + HOT_MAX states (vec4 each),
// then INK_MAX ink splats (2 vec4 each), the lens and the turn (vec4 each).
const INK_AT = 28 + HOT_MAX * 8;
const LENS_AT = INK_AT + INK_MAX * 8;
const UNIFORM_FLOATS = LENS_AT + 8;
const UNIFORM_SIZE = UNIFORM_FLOATS * 4;

const COMMON_WGSL = /* wgsl */ `
struct U {
  res: vec2f, time: f32, dpr: f32,
  mouse: vec2f, click: f32, energy: f32,
  rect: vec4f,
  scroll: f32, small: f32, seed: f32, enter: f32,
  trans: vec4f,
  trect: vec4f,
  coarse: f32, hotN: f32, pad0: f32, pad1: f32,
  hot: array<vec4f, ${HOT_MAX * 2}>,
  ink: array<vec4f, ${INK_MAX * 2}>,
  lens: vec4f,
  turn: vec4f,
};
@group(0) @binding(0) var<uniform> u: U;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var p = array(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  var o: VO;
  o.pos = vec4f(p[i], 0., 1.);
  o.uv = vec2f(p[i].x * .5 + .5, .5 - p[i].y * .5);
  return o;
}
const TAU = 6.2831853;
fn hash21(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn hash22(p: vec2f) -> vec2f {
  return fract(sin(vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)))) * 43758.5453);
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3. - 2. * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1., 0.)), w.x),
             mix(hash21(i + vec2f(0., 1.)), hash21(i + vec2f(1., 1.)), w.x), w.y);
}
fn fbm(p: vec2f) -> f32 {
  var v = 0.; var a = .5; var q = p;
  for (var i = 0; i < 3; i++) { v += a * vnoise(q); q = q * 2.03 + vec2f(1.7, 9.2); a *= .5; }
  return v;
}
fn sdBox(p: vec2f, b: vec2f) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec2f(0.))) + min(max(d.x, d.y), 0.);
}
// The ink field: the pointer's wake as a handful of decaying vortex splats
// (ink dropped in water). Returns the displacement (device px) at px in xy and
// the ink density in z. Splat positions are in this pass's device px.
fn inkField(px: vec2f) -> vec3f {
  var v = vec2f(0.);
  var dens = 0.;
  for (var i = 0; i < ${INK_MAX}; i++) {
    let a = u.ink[i * 2];
    let b = u.ink[i * 2 + 1];
    if (b.y <= 0.) { continue; }
    let age = b.x;
    let r = (46. + age * 70.) * u.dpr;
    let d = px - a.xy;
    let f = exp(-dot(d, d) / (r * r)) * exp(-age * 1.5) * b.y;
    if (f < .002) { continue; }
    let vel = a.zw;
    let side = sign(vel.x * d.y - vel.y * d.x + 1e-4);
    let swirl = vec2f(-d.y, d.x) / r * side;
    v += (vel * .018 + swirl * 9. * u.dpr) * f;
    dens += f;
  }
  return vec3f(v, dens);
}
// The projector lens ring: graphic marks only (rings, ticks, aperture blades,
// corner brackets). Returns coverage 0..1.
fn lensRing(px: vec2f, t: f32) -> f32 {
  if (u.lens.w <= .002) { return 0.; }
  let d = px - u.lens.xy;
  let r = length(d);
  let R = u.lens.z;
  let aa = u.dpr * .9;
  let ang = atan2(d.y, d.x);
  let line = 1.1 * u.dpr;
  // outer ring
  var c = smoothstep(line + aa, line, abs(r - R)) * .75;
  // inner ring of ticks, turning slowly
  let rin = R * .78;
  let tk = fract((ang + t * .18) / TAU * 36.);
  let tick = smoothstep(.16, .06, abs(tk - .5) - .34) * step(abs(r - rin), 3.5 * u.dpr);
  c += tick * .6;
  // three aperture blade arcs counter-rotating just outside the ring
  let ba = fract((ang - t * .3) / TAU * 3.);
  let blade = smoothstep(.02, .0, abs(ba - .5) - .17) * smoothstep(line + aa, line, abs(r - R * 1.12));
  c += blade * .55;
  // corner brackets on the diagonals
  let q = abs(d) - vec2f(R * .9);
  let corner = step(0., q.x + 7. * u.dpr) * step(0., q.y + 7. * u.dpr) * step(q.x, 0.) * step(q.y, 0.);
  let edge = 1. - step(1.2 * u.dpr, min(-q.x, -q.y));
  c += corner * edge * .5 * step(R * 1.18, r);
  // a press closes the iris for a moment
  let pr = u.turn.w;
  c += smoothstep(line + aa, line, abs(r - R * (.45 + .3 * pr))) * (1. - pr) * step(.001, 1. - pr) * .6;
  return clamp(c, 0., 1.) * u.lens.w;
}
// 0..1 along the rectangle's perimeter (clockwise from the top-left corner).
fn perim(p: vec2f, h: vec2f) -> f32 {
  let q = p / h;
  var s = 0.;
  if (abs(q.y) >= abs(q.x)) {
    if (q.y < 0.) { s = p.x + h.x; } else { s = 2. * h.x + 2. * h.y + (h.x - p.x); }
  } else {
    if (q.x > 0.) { s = 2. * h.x + (p.y + h.y); } else { s = 4. * h.x + 2. * h.y + (h.y - p.y); }
  }
  return s / (4. * (h.x + h.y));
}
const GOLD = vec3f(1.0, .80, .47);
const LAMP = vec3f(1.0, .63, .34);
const VERMILION = vec3f(.86, .30, .20);
const CREAM = vec3f(1.0, .93, .80);
// The projector's breathe: a slow, small luminance drift (never a flash).
fn flicker(t: f32) -> f32 {
  return 1. + .05 * (vnoise(vec2f(t * .9, 11.)) - .5) * 2. + .015 * sin(t * .43);
}
// One depth layer of lamp dust. Cells of size s; motes rise, sway and twinkle.
fn dust(px: vec2f, s: f32, speed: f32, t: f32, seed: f32, rad: f32, soft: f32) -> f32 {
  let q = px / s + vec2f(0., t * speed + u.scroll / s * (.12 + seed * .18));
  let id = floor(q);
  let f = fract(q) - .5;
  let r = hash22(id + seed * 17.);
  if (r.x > .34 - seed * .05) { return 0.; }
  let off = (r - .5) * .62 + vec2f(sin(t * .5 + r.y * 6.28) * .14, cos(t * .37 + r.x * 6.28) * .05);
  let d = length(f - off);
  let tw = .5 + .5 * sin(t * (.9 + r.y * 2.2) + r.x * 40.);
  let rr = rad * (.6 + r.y * .8);
  return smoothstep(rr + soft, rr - soft * .4, d) * (.35 + .65 * tw);
}
// Light on the desk's hotspots (tickets, chips, buttons): the entrance trace,
// a filigree rim on hover, halation, a press ripple. Rects are in the pixel
// space of the canvas being drawn. Returns premultiplied-ish (rgb, alpha).
fn hotLight(px: vec2f, t: f32, dpr: f32) -> vec4f {
  var c = vec3f(0.);
  var a = 0.;
  let n = i32(u.hotN);
  for (var i = 0; i < ${HOT_MAX}; i++) {
    if (i >= n) { break; }
    let r = u.hot[i];
    if (r.z <= 0.) { continue; }
    let h = r.zw * .5;
    let p = px - r.xy - h;
    let d = sdBox(p, h);
    if (d > 150. * dpr) { continue; }
    let s = u.hot[${HOT_MAX} + i];
    let hover = s.x;
    let press = s.y;
    let kind = s.z;
    let enter = clamp((u.enter - s.w) / 1.1, 0., 1.);
    let per = perim(p, h);
    // entrance: a bright head draws the outline clockwise and leaves a faint line
    let drawn = step(per, enter);
    let head = exp(-abs(per - enter) * 36.) * step(enter, .999) * 1.2;
    let line = exp(-abs(d) / (1.1 * dpr));
    let arc = per * 4. * (h.x + h.y);
    let beads = pow(.5 + .5 * cos(arc / (11. * dpr) * TAU - t * 2.2), 4.);
    // a comet runs round each ticket (and, fainter, each chip) so the desk never sits still
    let f1 = fract(per - t * .07 - f32(i) * .23);
    let comet = exp(-f1 * 14.) * smoothstep(0., .02, f1) * drawn * select(.12, .32, kind < .5);
    let rim = line * (drawn * (.05 + hover * (.35 + .35 * beads)) + head + comet);
    c += mix(GOLD, CREAM, clamp(hover * .4 + head, 0., 1.)) * rim;
    a += rim * .85;
    // hover halation, outside the box only (the face stays legible)
    let out = step(0., d);
    let halo = exp(-max(d, 0.) / (24. * dpr)) * hover * .16 * out;
    c += LAMP * halo;
    a += halo;
    // press ripple: two rounded rings leave the box and fade in 0.9 s
    if (press < 1.) {
      let e = 1. - pow(1. - press, 2.);
      let rd = d - e * 110. * dpr;
      let ring = exp(-rd * rd / (16. * dpr * dpr)) * (1. - press);
      let ring2 = exp(-abs(d - e * 60. * dpr) / (2.5 * dpr)) * (1. - press) * .5;
      c += mix(GOLD, CREAM, ring) * (ring + ring2);
      a += (ring + ring2) * .8;
    }
    // corner glints of a hovered or newly drawn panel
    let q = abs(p) - h;
    let glint = exp(-length(q) / (2.5 * dpr)) * (hover * .6 + head * .4) + kind * 0.;
    c += CREAM * glint;
    a += glint;
  }
  return vec4f(c, a);
}
`;

const OVERLAY_WGSL =
  COMMON_WGSL +
  /* wgsl */ `
// A stage lamp as a volume: a wedge from a point off-screen, broken into rays
// by angular noise, seen through a slow-drifting dust density (fbm) so the
// shafts thicken and thin as the air moves.
fn shafts(uv: vec2f, src: vec2f, theta: f32, width: f32, t: f32, dens: f32) -> f32 {
  let asp = u.res.x / u.res.y;
  let rel = (uv - src) * vec2f(asp, 1.);
  let r = length(rel);
  let ang = atan2(rel.y, rel.x);
  let wedge = exp(-pow((ang - theta) / width, 2.));
  let rays = vnoise(vec2f(ang * 34., r * 1.1 - t * .05)) * vnoise(vec2f(ang * 12. + t * .025, .7));
  let rays2 = vnoise(vec2f(ang * 66. - t * .012, r * .5 + t * .02));
  let fall = exp(-r * .7);
  return wedge * fall * (rays * .85 + rays2 * .45) * (.3 + .7 * dens);
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let px = in.uv * u.res;
  let t = u.time;
  let fl = flicker(t);
  let asp = u.res.x / u.res.y;
  var c = vec3f(0.);
  var a = 0.;
  // --- lamp dust, three depths with parallax from the pointer and the scroll -
  let par = (u.mouse - .5) * u.dpr;
  // the pointer's wake stirs the air: the dust is advected by the ink field
  let ink = inkField(px);
  let pxw = px - ink.xy * 1.6;
  let d1 = dust(pxw + par * vec2f(6., 3.), 36. * u.dpr, .045, t, 1., .055, .025);
  let d2 = dust(pxw + par * vec2f(20., 9.), 66. * u.dpr, .03, t, 2., .06, .04);
  var d3 = 0.;
  if (u.small < .5) { d3 = dust(pxw + par * vec2f(48., 22.), 128. * u.dpr, .02, t, 3., .11, .09); }
  // the desk's own lamp keeps the paper mostly clear of motes
  var deskIn = 0.;
  if (u.rect.z > 0.) {
    let dIn = sdBox(px - u.rect.xy - u.rect.zw * .5, u.rect.zw * .5);
    deskIn = smoothstep(20. * u.dpr, -20. * u.dpr, dIn) * .6;
  }
  let dk = 1. - deskIn;
  c += (CREAM * d1 * .6 + GOLD * d2 * .55 + LAMP * d3 * .38) * dk;
  a += (d1 * .5 + d2 * .42 + d3 * .3) * dk;

  // --- volumetric lamps: a swinging key light from above-left, a vermilion
  //     fill from above-right, both through the dust. Low amplitude, slow. ---
  let dens = fbm((in.uv + par * .02) * vec2f(asp, 1.) * 2.2 + vec2f(t * .02, -t * .035));
  // the key light comes through a lattice window: slow soft bars drift across it
  let gobo = .7 + .3 * pow(.5 + .5 * sin((in.uv.x * asp * 1.3 + in.uv.y * .7) * 20. + sin(t * .07) * 2.5), 2.);
  let key = shafts(in.uv, vec2f(-.08, -.22), 1.05 + .2 * sin(t * .09), .2, t, dens) * .44 * gobo;
  let fill = shafts(in.uv, vec2f(1.1, -.3), 2.25 + .16 * sin(t * .07 + 2.), .24, t, dens) * .2;
  let overDesk = 1. - deskIn * .9;
  c += (GOLD * key + mix(VERMILION, LAMP, .5 + .5 * sin(t * .05)) * fill) * fl * overDesk;
  a += (key * .55 + fill * .45) * fl * overDesk;
  // a warm vermilion breath pooling at the floor
  let floorAmb = pow(in.uv.y, 3.) * (.012 + .008 * sin(t * .11));
  c += VERMILION * floorAmb;
  a += floorAmb;

  // --- the pointer's lantern (drifts by itself on touch screens) -------------
  let m = u.mouse * u.res;
  let ld = length(px - m) / (240. * u.dpr);
  let lantern = exp(-ld * ld * 2.) * (.09 + .07 * u.energy) * fl;
  c += LAMP * lantern;
  a += lantern * .6;

  // --- click: two thin gold rings ride out, fade within 1.2s ---------------
  let ck = clamp(u.click, 0., 1.);
  if (ck > 0.) {
    let dist = length(px - m);
    let e = 1. - ck * ck;
    let r1 = abs(dist - e * 280. * u.dpr);
    let r2 = abs(dist - e * 180. * u.dpr - 20. * u.dpr);
    let rv = (exp(-r1 * r1 / (10. * u.dpr * u.dpr)) + exp(-r2 * r2 / (6. * u.dpr * u.dpr)) * .6) * ck * .55;
    c += GOLD * rv;
    a += rv * .5;
  }

  // --- the programme desk: a brass frame drawn in on entrance, filigree beads
  //     on an inner line, two comets of light, corner glints, a halo, and a
  //     gold sheen that crosses the paper as the curtain rises -------------
  if (u.rect.z > 0.) {
    let h = u.rect.zw * .5;
    let center = u.rect.xy + h;
    let p = px - center;
    let d = sdBox(p, h);
    let s = perim(p, h);
    let enter = clamp(u.enter / 1.6, 0., 1.);
    let drawn = step(s, enter);
    let head = exp(-abs(s - enter) * 60.) * step(enter, .999);
    let f1 = fract(s - t * .055);
    let f2 = fract(-s - t * .035 + .5);
    let c1 = exp(-f1 * 16.) * smoothstep(0., .02, f1);
    let c2 = exp(-f2 * 22.) * smoothstep(0., .015, f2) * .55;
    let run = (c1 + c2) * drawn + head * 1.4;
    let line = exp(-abs(d) / (1.6 * u.dpr));
    let soft = exp(-abs(d) / (9. * u.dpr));
    let halo = exp(-max(d, 0.) / (34. * u.dpr)) * step(0., d);
    let e = line * (.08 * drawn + run * .7) + soft * run * .25 + halo * (.03 + run * .09);
    c += mix(GOLD, CREAM, clamp(run * .5, 0., 1.)) * e;
    a += e * .7;
    // filigree: a bead line just inside the frame, beads rolling slowly
    let arc = s * 4. * (h.x + h.y);
    let beads = pow(.5 + .5 * cos(arc / (14. * u.dpr) * TAU - t * 1.1), 6.);
    let inner = exp(-abs(d + 7. * u.dpr) / (1.1 * u.dpr)) * drawn;
    let fil = inner * (.05 + beads * .22);
    c += GOLD * fil;
    a += fil * .8;
    // corner glints: four small brass stars, slowly breathing out of phase
    let q = abs(p) - h;
    let cornerD = length(q);
    let star = exp(-cornerD / (3. * u.dpr)) + exp(-abs(q.x) / (1.2 * u.dpr)) * exp(-abs(q.y) / (14. * u.dpr)) * .5
             + exp(-abs(q.y) / (1.2 * u.dpr)) * exp(-abs(q.x) / (14. * u.dpr)) * .5;
    let phase = select(0., 1.6, p.x > 0.) + select(0., 3.1, p.y > 0.);
    let breathe = .55 + .45 * sin(t * .8 + phase);
    let glint = star * breathe * .5 * drawn;
    c += CREAM * glint;
    a += glint * .6;
    // the curtain-rise sheen: one diagonal gold pass over the paper, 0.3–1.5 s
    let luv = (px - u.rect.xy) / u.rect.zw;
    let inDesk = step(0., luv.x) * step(luv.x, 1.) * step(0., luv.y) * step(luv.y, 1.);
    let sp = clamp((u.enter - .3) / 1.2, 0., 1.);
    let sheen = exp(-pow((luv.x * .7 + luv.y * .3 - (sp * 1.5 - .25)) * 6., 2.)) * (1. - sp) * .22 * inDesk;
    c += GOLD * sheen;
    a += sheen;
  }

  // --- hotspots: tickets, chips, buttons --------------------------------------
  let hl = hotLight(px, t, u.dpr);
  c += hl.rgb;
  a += hl.a;

  // --- section change: a gold curtain band sweeps the viewport (ticket, hash)
  //     or shutters the reel frame (prev / next / mode). Thin, 0.8 s, ≥ 1 s apart.
  let tt = u.trans.x;
  if (tt < 1.) {
    let kind = u.trans.y;
    let dir = u.trans.z;
    let e = tt * tt * (3. - 2. * tt);
    var q = 0.;
    var pos = 0.;
    var w = .07;
    var mask = 1.;
    if (kind < 1.5) {
      q = in.uv.x * .85 + in.uv.y * .3;
      if (dir < 0.) { q = 1.15 - q; }
      pos = -.25 + 1.65 * e;
    } else {
      let lr = (px - u.trect.xy) / u.trect.zw;
      mask = step(0., lr.x) * step(lr.x, 1.) * step(0., lr.y) * step(lr.y, 1.);
      q = select(1. - lr.x, lr.x, dir >= 0.) * .9 + lr.y * .1;
      pos = -.2 + 1.4 * e;
      w = .12;
    }
    let rag = (hash21(vec2f(floor(px.y / (3. * u.dpr)), floor(tt * 30.))) - .5) * .02;
    let band = exp(-pow((q - pos + rag) / w, 2.));
    let wake = exp(-(pos - q) * 9.) * step(q, pos) * .3;
    let sw = (band + wake) * (1. - tt * tt) * mask * select(.5, .8, kind > 1.5);
    c += mix(GOLD, CREAM, band) * sw;
    a += sw * .9;
  }

  // ink in the lamp beam: filaments where the wake is dense
  if (ink.z > .01) {
    let fil = smoothstep(.42, .78, fbm(pxw / (24. * u.dpr) + vec2f(t * .12, -t * .08)));
    let k = min(ink.z, 1.) * fil * .2;
    c += mix(LAMP, CREAM, .35) * k;
    a += k * .8;
  }
  // the projector lens ring (graphic marks only)
  let lr = lensRing(px, t);
  c += mix(GOLD, CREAM, .25) * lr * .85;
  a += lr * .6;
  // film grain (very low) and a hair of halation on everything bright
  let g = hash21(floor(px / u.dpr) + fract(t * 23.) * 91.) - .5;
  c += vec3f(g * .014) + c * c * .25 * vec3f(1., .7, .5);
  a = clamp(a, 0., .7);
  return vec4f(c, a);
}
`;

// Tier A pass 1: the lamp-coloured part of the DOM, quarter res.
const BRIGHT_WGSL =
  COMMON_WGSL +
  /* wgsl */ `
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var dom: texture_2d<f32>;
fn bright(c: vec3f) -> vec3f {
  let sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  return c * smoothstep(.22, .5, sat) * smoothstep(.4, .8, max(c.r, c.g));
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let o = vec2f(1.) / u.res;   // u.res = the bright texture's size here
  var s = bright(textureSampleLevel(dom, samp, in.uv + o * vec2f(-.5, -.5), 0.).rgb);
  s += bright(textureSampleLevel(dom, samp, in.uv + o * vec2f(.5, -.5), 0.).rgb);
  s += bright(textureSampleLevel(dom, samp, in.uv + o * vec2f(-.5, .5), 0.).rgb);
  s += bright(textureSampleLevel(dom, samp, in.uv + o * vec2f(.5, .5), 0.).rgb);
  return vec4f(s * .25, 1.);
}
`;

// Tier A passes 2 + 3: a 9-tap gaussian, horizontal then vertical, plus a long
// anamorphic streak on the horizontal pass (brass rails and seals catch the lamp).
const BLUR_WGSL = /* wgsl */ `
struct B { dir: vec2f, streak: f32, pad: f32 };
@group(0) @binding(0) var<uniform> b: B;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var src: texture_2d<f32>;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var p = array(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  var o: VO;
  o.pos = vec4f(p[i], 0., 1.);
  o.uv = vec2f(p[i].x * .5 + .5, .5 - p[i].y * .5);
  return o;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  var w = array(.227, .194, .121, .054, .016);
  var c = textureSampleLevel(src, samp, in.uv, 0.).rgb * w[0];
  for (var k = 1; k < 5; k++) {
    let o = b.dir * f32(k) * 1.5;
    c += (textureSampleLevel(src, samp, in.uv + o, 0.).rgb + textureSampleLevel(src, samp, in.uv - o, 0.).rgb) * w[k];
  }
  if (b.streak > 0.) {
    var s = vec3f(0.);
    for (var k = 1; k <= 6; k++) {
      let o = b.dir * f32(k) * 5.;
      s += (textureSampleLevel(src, samp, in.uv + o, 0.).rgb + textureSampleLevel(src, samp, in.uv - o, 0.).rgb) / (f32(k) + 1.);
    }
    c += s * b.streak * vec3f(1., .86, .6);
  }
  return vec4f(c, 1.);
}
`;

// Tier A pass 4: the composite.
const DESK_WGSL =
  COMMON_WGSL +
  /* wgsl */ `
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var dom: texture_2d<f32>;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;
@group(0) @binding(4) var prevTex: texture_2d<f32>;
fn tap(uv: vec2f) -> vec4f { return textureSampleLevel(dom, samp, uv, 0.); }
@fragment fn fs(in: VO) -> @location(0) vec4f {
  // The element sits at u.rect (device px) inside the canvas; its texture covers just that box.
  let luv = (in.pos.xy - u.rect.xy) / u.rect.zw;
  if (any(luv < vec2f(0.)) || any(luv > vec2f(1.))) { return vec4f(0.); }
  let t = u.time;
  let m = u.mouse;
  let fl = flicker(t);
  let pxs = u.dpr / u.rect.zw;   // one device pixel in local uv
  let asp = u.rect.z / u.rect.w;
  var uv = luv;
  // --- projector lens: a touch of barrel, and the gate's slow weave (sub-pixel)
  let cc = (luv - .5) * vec2f(1., 1. / asp);
  let r2 = dot(cc, cc);
  uv += (luv - .5) * r2 * .02;
  uv += vec2f(sin(t * 1.9) * .3, cos(t * 1.3) * .4) * pxs;
  // --- click: film-gate slip + a paper tear. The gate slips a few pixels and
  //     settles in ~0.35s; the paper below a ragged seam shears sideways, a
  //     fibrous white edge shows and a shadow falls under the lip. ----------
  let g = clamp(u.click, 0., 1.);
  let jit = pow(g, 7.);
  uv.y += jit * sin(g * 110.) * 9. * pxs.y;
  uv.x += jit * sin(g * 73. + 1.) * 2.5 * pxs.x;
  let seamY = .28 + .44 * u.seed;
  let rag = (hash21(vec2f(floor(luv.x * 90.), u.seed * 7.)) - .5) * 4. * pxs.y;
  let seam = seamY + rag + sin(luv.x * 9. + u.seed * 20.) * .006;
  let below = step(seam, luv.y);
  let tearDir = select(-1., 1., u.seed > .5);
  uv.x += below * jit * (tearDir * 14. + (luv.y - seam) * 30.) * pxs.x;
  uv.y -= below * jit * 2. * pxs.y;
  let lip = exp(-(luv.y - seam) / (7. * pxs.y)) * below * jit;
  let fibre = exp(-abs(luv.y - seam) / (1.4 * pxs.y)) * jit * (.5 + .5 * hash21(vec2f(floor(luv.x * 300.), 1.)));
  // --- ink in water: the pointer's wake bends the print (capped, transient) --
  let ink = inkField(in.pos.xy);
  var idisp = ink.xy;
  let il = length(idisp);
  if (il > 8. * u.dpr) { idisp *= 8. * u.dpr / il; }
  uv -= idisp / u.rect.zw;
  // --- a lamp bulge under the pointer (hit testing stays aligned) -----------
  let dm = uv - m;
  let dpx = dm * u.rect.zw;
  let pull = exp(-dot(dpx, dpx) / (120000. * u.dpr * u.dpr)) * (.002 + .004 * u.energy);
  uv -= dm * pull * 6.;
  // --- plate misregistration: two printing plates, warm and cool, slipping
  //     more at the edges, briefly at the tear ------------------------------
  let ca = (r2 * 1.6 + jit * 1.4 + lip * 1.2) * 1.3;
  let dir = normalize(luv - .5 + vec2f(1e-4));
  let cr = tap(uv + dir * ca * pxs);
  let cg = tap(uv + dir * ca * pxs * .35);
  let cb = tap(uv - dir * ca * pxs);
  var col = vec4f(cr.r, cg.g, cb.b, cg.a);
  // --- bloom + halation from the blurred bright pass -------------------------
  let bl = textureSampleLevel(bloomTex, samp, uv, 0.).rgb;
  let bloom = bl * (.5 + .3 * u.energy) * vec3f(1., .9, .7) * fl;
  let halation = pow(bl, vec3f(1.5)) * .7 * vec3f(1., .62, .4);
  // --- the paper: a faint weave, the projector breathe, a gold sheen that
  //     crosses the desk every ~9s like a lamp swung past it ----------------
  let px = in.pos.xy;
  let weave = .984 + .016 * sin(px.y * 3.14159 / (1.5 * u.dpr));
  let breath = mix(1., fl, .5);
  let sheenPos = fract(t / 9.) * 1.9 - .45;
  let sheen = exp(-pow((luv.x * .6 + luv.y * .4 - sheenPos) * 7., 2.)) * .045 * col.a;
  var rgb = col.rgb * weave * breath + bloom + halation + GOLD * sheen;
  // --- hovered or pressed hotspots lift a little under the lamp --------------
  let n = i32(u.hotN);
  for (var i = 0; i < ${HOT_MAX}; i++) {
    if (i >= n) { break; }
    let r = u.hot[i];
    if (r.z <= 0.) { continue; }
    let s = u.hot[${HOT_MAX} + i];
    let h = r.zw * .5;
    let d = sdBox(px - r.xy - h, h);
    if (d > 0.) { continue; }
    let edge = exp(-abs(d) / (10. * u.dpr));
    rgb *= 1. + s.x * (.05 + .06 * edge);
    rgb += GOLD * s.x * edge * .06;
  }
  // --- lamplight from the pointer: a warm pool ------------------------------
  let ld = length((luv - m) * u.rect.zw) / (320. * u.dpr);
  let pool = exp(-ld * ld) * (.03 + .03 * u.energy) * col.a;
  rgb += LAMP * pool;
  // the tear: a fibrous paper edge and its shadow
  rgb = mix(rgb, CREAM, fibre * .8 * col.a);
  rgb *= 1. - lip * .4;
  // --- a hairline scratch on the print, now and then ------------------------
  let sc = hash21(vec2f(floor(t * 1.7), 3.));
  let scOn = step(hash21(vec2f(floor(t * 1.7), 9.)), .3);
  let scratch = exp(-abs(luv.x - sc) / (.7 * pxs.x)) * scOn * (.5 + .5 * sin(luv.y * 50. + t * 21.)) * .1;
  rgb *= 1. - scratch * col.a;
  // sumi in the paper where the wake is dense
  if (ink.z > .01) {
    let fil = smoothstep(.45, .8, fbm((in.pos.xy - ink.xy * 2.) / (22. * u.dpr) + t * .1));
    rgb *= 1. - min(ink.z, 1.) * fil * .1 * col.a;
  }
  // --- section / reel change: the previous frame leaves in glitched slats ---
  let tt = u.trans.x;
  if (u.turn.y > .5 && tt < 1.) {
    var inR = 1.;
    if (u.trans.y > 1.5) {
      let lr = (px - u.trect.xy) / max(u.trect.zw, vec2f(1.));
      inR = step(0., lr.x) * step(lr.x, 1.) * step(0., lr.y) * step(lr.y, 1.);
    }
    let slat = floor(px.y / (9. * u.dpr));
    let thr = hash21(vec2f(slat, floor(u.seed * 97.))) * .55;
    let e = clamp((tt - thr) / .45, 0., 1.);
    if (inR > .5 && e < 1.) {
      let shift = e * e * u.trans.z * 36. * u.dpr / u.rect.z;
      let pv = textureSampleLevel(prevTex, samp, uv - vec2f(shift, 0.), 0.);
      // a hair of plate slip on the slat's leading edge, luminance held
      let edgeK = exp(-abs(fract(px.y / (9. * u.dpr)) - .5) * 8.) * (1. - e) * .15;
      let prgb = pv.rgb * weave * breath * (1. - edgeK) + GOLD * edgeK * .2;
      rgb = mix(rgb, prgb, (1. - smoothstep(.0, 1., e)) * pv.a);
    }
  }
  // --- lens vignette (the paper stays cream, the dark wood goes amber) -------
  let v = smoothstep(.95, .3, length((luv - .5) * vec2f(1., .8)));
  rgb *= mix(vec3f(.84, .78, .74), vec3f(1.), v);
  let a = max(col.a, clamp(max(bloom.r, bloom.g) * 1.2, 0., 1.));
  return vec4f(rgb, a);
}
`;

async function getDevice() {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "low-power" });
  if (!adapter) throw new Error("no adapter");
  const device = await adapter.requestDevice();
  device.addEventListener?.("uncapturederror", (event) =>
    console.warn("dream-gpu", event.error?.message),
  );
  return device;
}

const isCoarse = () => matchMedia("(pointer: coarse)").matches;
const isSmall = () => isCoarse() || Math.min(innerWidth, innerHeight) < 700;

function makePointer() {
  const coarse = isCoarse();
  const state = { x: 0.5, y: 0.35, tx: 0.5, ty: 0.35, cx: -1, cy: -1, click: 0, energy: 0, seed: 0.5 };
  let touchedAt = -1e9;
  const move = (e) => {
    state.tx = e.clientX / Math.max(1, innerWidth);
    state.ty = e.clientY / Math.max(1, innerHeight);
    state.cx = e.clientX;
    state.cy = e.clientY;
    state.energy = Math.min(1, state.energy + 0.06);
    touchedAt = performance.now();
  };
  const down = (e) => {
    move(e);
    state.click = 1;
    state.seed = Math.random();
  };
  const touch = (e) => {
    const p = e.touches?.[0];
    if (p) move(p);
  };
  addEventListener("pointermove", move, { passive: true });
  addEventListener("pointerdown", down, { passive: true });
  if (coarse) addEventListener("touchmove", touch, { passive: true });
  return {
    state,
    step(dt, t) {
      // On touch screens the lantern wanders by itself between touches.
      if (coarse && performance.now() - touchedAt > 2500) {
        state.tx = 0.5 + 0.2 * Math.sin(t * 0.13);
        state.ty = 0.42 + 0.14 * Math.cos(t * 0.09);
        state.energy = Math.max(state.energy, 0.25);
      }
      const k = 1 - Math.exp(-dt * 6);
      state.x += (state.tx - state.x) * k;
      state.y += (state.ty - state.y) * k;
      state.click = Math.max(0, state.click - dt / 1.2);
      state.energy = Math.max(0, state.energy - dt * 0.6);
    },
    dispose() {
      removeEventListener("pointermove", move);
      removeEventListener("pointerdown", down);
      if (coarse) removeEventListener("touchmove", touch);
    },
  };
}

function loop(frame) {
  let raf = 0;
  let last = performance.now();
  let running = true;
  const tick = (now) => {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frame(now / 1000, dt);
    raf = requestAnimationFrame(tick);
  };
  const onVis = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else if (running) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };
  document.addEventListener("visibilitychange", onVis);
  raf = requestAnimationFrame(tick);
  return () => {
    running = false;
    cancelAnimationFrame(raf);
    document.removeEventListener("visibilitychange", onVis);
  };
}

// ---------------------------------------------------------------------------
// The theatre: shared state for both tiers. Which desk elements are lit, which
// is hovered or pressed, when the desk came into view, and the last section
// change. One instance, reference counted by the engines that use it.
const DESK = ".dream-programme-desk";
const HOT_SELECTOR = [
  ".dream-programme-ticket",
  ".dream-programme-dossier-chip",
  ".dream-programme-spotlight-modes button",
  ".dream-programme-spotlight-controls button",
].join(",");
const KIND = (el) =>
  el.matches(".dream-programme-ticket") ? 0 : el.matches(".dream-programme-dossier-chip") ? 1 : 2;

let theatre = null;
let theatreUsers = 0;

function makeTheatre() {
  const coarse = isCoarse();
  const items = []; // { el, kind, stagger, hover, hoverTo, press }
  const byEl = new Map();
  let hovered = null;
  const refresh = () => {
    const desk = document.querySelector(DESK);
    items.length = 0;
    if (!desk) return;
    const els = desk.querySelectorAll(HOT_SELECTOR);
    let i = 0;
    for (const el of els) {
      if (i >= HOT_MAX) break;
      let it = byEl.get(el);
      if (!it) {
        it = { el, kind: KIND(el), stagger: 0, hover: 0, hoverTo: 0, press: 1 };
        byEl.set(el, it);
      }
      it.stagger = 0.25 + i * 0.07;
      items.push(it);
      i += 1;
    }
    for (const el of [...byEl.keys()]) if (!el.isConnected) byEl.delete(el);
  };
  const setHover = (el) => {
    if (hovered && hovered !== el) {
      const it = byEl.get(hovered);
      if (it) it.hoverTo = 0;
    }
    hovered = el;
    const it = el && byEl.get(el);
    if (it) it.hoverTo = 1;
  };
  const onOver = (e) => {
    if (coarse) return;
    setHover(e.target.closest?.(HOT_SELECTOR) ?? null);
  };
  const onDown = (e) => {
    const el = e.target.closest?.(HOT_SELECTOR);
    const it = el && byEl.get(el);
    if (it) it.press = 0;
    if (coarse) setHover(el ?? null);
  };
  const onUp = () => {
    if (coarse) setTimeout(() => setHover(null), 350);
  };
  // entrance
  let enterAt = -1;
  let outSince = -1e9;
  let visible = false;
  let firstEntrance = true;
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        const now = performance.now();
        const vis = en.intersectionRatio >= 0.25;
        if (vis && !visible && now - outSince > 1500) {
          // The overlay itself fades in over 1.6 s; let the first trace wait for it.
          enterAt = now + (firstEntrance ? 700 : 0);
          firstEntrance = false;
        }
        if (!vis && visible) outSince = now;
        visible = vis;
      }
    },
    { threshold: [0, 0.25, 0.5] },
  );
  // transitions
  const trans = { at: -1e9, kind: 1, dir: 1, el: null };
  const listeners = new Set();
  const fire = (kind, dir, el) => {
    const now = performance.now();
    if (now - trans.at < 1000) return; // never two sweeps within a second
    trans.at = now;
    trans.kind = kind;
    trans.dir = dir;
    trans.el = el;
    for (const fn of listeners) fn(trans);
  };
  const onClick = (e) => {
    const t = e.target;
    const ticket = t.closest?.(".dream-programme-ticket");
    if (ticket) {
      const all = [...document.querySelectorAll(".dream-programme-ticket")];
      fire(1, all.indexOf(ticket) === 0 ? -1 : 1, null);
      return;
    }
    const ctl = t.closest?.(
      ".dream-programme-spotlight-controls button, .dream-programme-spotlight-modes button",
    );
    if (ctl) {
      const frame = document.querySelector(".dream-programme-reel-frame");
      const prev = /前/.test(ctl.getAttribute("aria-label") ?? "");
      fire(2, prev ? -1 : 1, frame);
    }
  };
  const onHash = () => fire(1, 1, null);
  const mo = new MutationObserver(() => {
    clearTimeout(moTimer);
    moTimer = setTimeout(refresh, 80);
  });
  let moTimer = 0;
  let observed = null;
  const observeDesk = () => {
    const desk = document.querySelector(DESK);
    if (desk === observed) return;
    if (observed) {
      io.unobserve(observed);
      mo.disconnect();
    }
    observed = desk;
    if (!desk) return;
    io.observe(desk);
    mo.observe(desk, { childList: true, subtree: true });
    refresh();
  };
  // The desk may remount (tier A carries it into the canvas); re-observe when it does.
  observeDesk();
  const watch = setInterval(observeDesk, 800);
  document.addEventListener("pointerover", onOver, { passive: true });
  document.addEventListener("pointerdown", onDown, { passive: true });
  document.addEventListener("pointerup", onUp, { passive: true });
  document.addEventListener("pointercancel", onUp, { passive: true });
  document.addEventListener("click", onClick, { passive: true });
  addEventListener("hashchange", onHash);
  return {
    items,
    listeners,
    step(dt) {
      const k = 1 - Math.exp(-dt * 9);
      for (const it of items) {
        it.hover += (it.hoverTo - it.hover) * k;
        if (it.press < 1) it.press = Math.min(1, it.press + dt / 0.9);
      }
    },
    /** Seconds since the desk entered the view (−1 = not yet). */
    enter() {
      const e = enterAt < 0 ? -1 : (performance.now() - enterAt) / 1000;
      return e < 0 ? -1 : e;
    },
    trans() {
      const tt = (performance.now() - trans.at) / 800;
      return { t: Math.min(1, tt), kind: trans.kind, dir: trans.dir, el: trans.el };
    },
    /** Writes hot rects + states into `u` at float offset 28 using `map(rect)`. */
    fill(u, map) {
      let n = 0;
      for (const it of items) {
        const r = it.el.getBoundingClientRect();
        if (r.width <= 0) continue;
        const m = map(r);
        if (!m) continue;
        u.set(m, 28 + n * 4);
        u.set([it.hover, it.press, it.kind, it.stagger], 28 + (HOT_MAX + n) * 4);
        n += 1;
      }
      return n;
    },
    dispose() {
      clearInterval(watch);
      io.disconnect();
      mo.disconnect();
      clearTimeout(moTimer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.removeEventListener("click", onClick);
      removeEventListener("hashchange", onHash);
    },
  };
}

function acquireTheatre() {
  theatreUsers += 1;
  theatre ??= makeTheatre();
  const th = theatre;
  return {
    th,
    release() {
      theatreUsers -= 1;
      if (theatreUsers <= 0) {
        theatreUsers = 0;
        th.dispose();
        theatre = null;
      }
    },
  };
}

// The dynamic GUI's feed into the uniforms: the ink splats and the lens.
// `map(x, y)` turns viewport CSS px into this pass's device px.
function makeGuiFeed() {
  const lens = { x: -1, y: -1, r: 34, a: 0 };
  return (u, dt, map, scale, extra = 0) => {
    const now = performance.now();
    let n = 0;
    for (const sp of gui.ink) {
      const age = (now - sp.at) / 1000;
      if (age > 2.2 || n >= INK_MAX) continue;
      const [x, y] = map(sp.x, sp.y);
      u.set([x, y, sp.vx * scale, sp.vy * scale, age, sp.s, 0, 0], INK_AT + n * 8);
      n += 1;
    }
    for (; n < INK_MAX; n++) u.fill(0, INK_AT + n * 8, INK_AT + n * 8 + 8);
    const g = gui.lens;
    const to = gui.active && g.on ? 1 : 0;
    if (lens.a < 0.02 && to) {
      lens.x = g.x;
      lens.y = g.y;
    }
    const k = 1 - Math.exp(-dt * (g.focus ? 10 : 16));
    lens.x += (g.x - lens.x) * k;
    lens.y += (g.y - lens.y) * k;
    lens.r += ((g.focus ? Math.min(g.r, 160) : 34) - lens.r) * k;
    lens.a += (to - lens.a) * (1 - Math.exp(-dt * 7));
    const [lx, ly] = map(lens.x, lens.y);
    const press = Math.min(1, Math.max(0, (now - g.pressed) / 450));
    u.set([lx, ly, lens.r * scale, lens.a * 0.9, 0, extra, 0, press], LENS_AT);
  };
}

function makeUniformBuffer(device) {
  return device.createBuffer({
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}

function fullscreenPass(device, encoder, view, pipeline, bind) {
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bind);
  pass.draw(3);
  pass.end();
}

/** Tier A + B: the lamplight layer over the page. Returns a stop function. */
export async function startLamplightOverlay(canvas, { getDeskRect } = {}) {
  const device = await getDevice();
  const ctx = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "premultiplied" });
  const module = device.createShaderModule({ code: OVERLAY_WGSL });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });
  const ubuf = makeUniformBuffer(device);
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: ubuf } }],
  });
  const u = new Float32Array(UNIFORM_FLOATS);
  const pointer = makePointer();
  const { th, release } = acquireTheatre();
  const small = isSmall();
  const coarse = isCoarse();
  const feed = makeGuiFeed();
  // Phones and tablets render at ≤ 1 device px per CSS px (memory + fill rate).
  const scale = () => Math.min(devicePixelRatio || 1, small ? 1 : 1.5) * (small ? 0.75 : 1);
  let start = 0;
  const stopLoop = loop((t, dt) => {
    if (!start) start = t;
    pointer.step(dt, t);
    th.step(dt);
    const s = scale();
    const w = Math.max(1, Math.round(innerWidth * s));
    const h = Math.max(1, Math.round(innerHeight * s));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const r = getDeskRect?.();
    const deskVisible = r && r.bottom > -80 && r.top < innerHeight + 80;
    u.set([w, h, t - start, s, pointer.state.x, pointer.state.y, pointer.state.click, pointer.state.energy]);
    if (deskVisible) u.set([r.left * s, r.top * s, r.width * s, r.height * s], 8);
    else u.set([0, 0, 0, 0], 8);
    const enter = th.enter();
    u.set([scrollY * s, small ? 1 : 0, pointer.state.seed, enter < 0 ? 0 : enter], 12);
    const tr = th.trans();
    u.set([tr.t, tr.kind, tr.dir, 0], 16);
    const tre = tr.el && tr.t < 1 ? tr.el.getBoundingClientRect() : null;
    u.set(tre ? [tre.left * s, tre.top * s, tre.width * s, tre.height * s] : [0, 0, 0, 0], 20);
    const n = deskVisible
      ? th.fill(u, (b) =>
          b.bottom < 0 || b.top > innerHeight ? null : [b.left * s, b.top * s, b.width * s, b.height * s],
        )
      : 0;
    u.set([coarse ? 1 : 0, n, 0, 0], 24);
    feed(u, dt, (x, y) => [x * s, y * s], s);
    device.queue.writeBuffer(ubuf, 0, u);
    const enc = device.createCommandEncoder();
    fullscreenPass(device, enc, ctx.getCurrentTexture().createView(), pipeline, bind);
    device.queue.submit([enc.finish()]);
  });
  return () => {
    stopLoop();
    pointer.dispose();
    release();
    try {
      ctx.unconfigure();
    } catch {
      /* already gone */
    }
    ubuf.destroy();
    device.destroy();
  };
}

/** Tier A: HTML-in-Canvas. `canvas` has the layoutsubtree attribute and `element` is its child. */
export async function startDeskStage(canvas, element, { onFail } = {}) {
  const device = await getDevice();
  const queue = device.queue;
  if (typeof queue.drawElementImageToTexture !== "function")
    throw new Error("no drawElementImageToTexture");
  const ctx = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "premultiplied" });
  const mk = (code, targetFormat) => {
    const module = device.createShaderModule({ code });
    return device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format: targetFormat }] },
    });
  };
  const BLOOM_FORMAT = "rgba8unorm";
  const brightPipe = mk(BRIGHT_WGSL, BLOOM_FORMAT);
  const blurPipe = mk(BLUR_WGSL, BLOOM_FORMAT);
  const compPipe = mk(DESK_WGSL, format);
  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });
  const ubuf = makeUniformBuffer(device);
  const ubright = makeUniformBuffer(device);
  const blurH = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const blurV = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const u = new Float32Array(UNIFORM_FLOATS);
  const ub = new Float32Array(UNIFORM_FLOATS);
  let tex = null;
  let prev = null;
  let prevValid = false;
  let bright = null;
  let blurA = null;
  let blurB = null;
  let binds = null;
  let captured = false;
  let dpr = Math.min(devicePixelRatio || 1, 2);

  const ensureTexture = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ew = Math.max(1, Math.round(element.offsetWidth * dpr));
    const eh = Math.max(1, Math.round(element.offsetHeight * dpr));
    if (tex && tex.width === ew && tex.height === eh) return;
    for (const t of [tex, prev, bright, blurA, blurB]) t?.destroy();
    tex = device.createTexture({
      size: [ew, eh],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // the previous frame, kept for section / reel transitions
    prev = device.createTexture({
      size: [ew, eh],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    prevValid = false;
    const bw = Math.max(1, Math.round(ew / 4));
    const bh = Math.max(1, Math.round(eh / 4));
    const small = () =>
      device.createTexture({
        size: [bw, bh],
        format: BLOOM_FORMAT,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
      });
    bright = small();
    blurA = small();
    blurB = small();
    ub.set([bw, bh]);
    queue.writeBuffer(ubright, 0, ub);
    queue.writeBuffer(blurH, 0, new Float32Array([1 / bw, 0, 0.12, 0]));
    queue.writeBuffer(blurV, 0, new Float32Array([0, 1 / bh, 0, 0]));
    const bg = (pipe, entries) =>
      device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries });
    binds = {
      bright: bg(brightPipe, [
        { binding: 0, resource: { buffer: ubright } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: tex.createView() },
      ]),
      blurH: bg(blurPipe, [
        { binding: 0, resource: { buffer: blurH } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: bright.createView() },
      ]),
      blurV: bg(blurPipe, [
        { binding: 0, resource: { buffer: blurV } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: blurA.createView() },
      ]),
      comp: bg(compPipe, [
        { binding: 0, resource: { buffer: ubuf } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: tex.createView() },
        { binding: 3, resource: blurB.createView() },
        { binding: 4, resource: prev.createView() },
      ]),
    };
    captured = false;
  };

  let bloomDirty = true;
  const capture = () => {
    ensureTexture();
    try {
      queue.drawElementImageToTexture({ source: element }, { texture: tex });
      captured = true;
      bloomDirty = true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "InvalidStateError"))
        console.warn(error);
    }
  };
  const onPaint = () => capture();
  canvas.addEventListener("paint", onPaint);
  const ro = new ResizeObserver(() => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.requestPaint?.();
  });
  ro.observe(canvas);
  canvas.requestPaint?.();

  // The desk's own pointer: positions relative to the canvas.
  const pointer = makePointer();
  const { th, release } = acquireTheatre();
  const feed = makeGuiFeed();
  // A transition is starting: the desk's texture still holds the frame before
  // the DOM changed (the next paint event has not come yet). Keep it.
  const keepPrev = () => {
    if (!tex || !prev || !captured) return;
    const enc = device.createCommandEncoder();
    enc.copyTextureToTexture({ texture: tex }, { texture: prev }, [tex.width, tex.height]);
    queue.submit([enc.finish()]);
    prevValid = true;
  };
  th.listeners.add(keepPrev);
  let start = 0;
  let firstAt = 0;
  const stopLoop = loop((t, dt) => {
    if (!start) start = firstAt = t;
    pointer.step(dt, t);
    th.step(dt);
    try {
      canvas.updateElementGeometry?.(element);
    } catch {
      /* geometry sync is best-effort */
    }
    if (!captured) {
      // No paint event yet: ask again; give up after 2.5s so the desk never stays blank.
      canvas.requestPaint?.();
      if (t - firstAt > 2.5) onFail?.(new Error("no paint"));
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.bottom < -40 || rect.top > innerHeight + 40) return;
    const er = element.getBoundingClientRect();
    const mx = (pointer.state.cx - er.left) / Math.max(1, er.width);
    const my = (pointer.state.cy - er.top) / Math.max(1, er.height);
    u.set([canvas.width, canvas.height, t - start, dpr, mx, my, pointer.state.click, pointer.state.energy]);
    const sx = canvas.width / Math.max(1, rect.width);
    u.set([(er.left - rect.left) * sx, (er.top - rect.top) * sx, er.width * sx, er.height * sx], 8);
    const enter = th.enter();
    u.set([0, 0, pointer.state.seed, enter < 0 ? 0 : enter], 12);
    const n = th.fill(u, (b) => [
      (b.left - rect.left) * sx,
      (b.top - rect.top) * sx,
      b.width * sx,
      b.height * sx,
    ]);
    u.set([0, n, 0, 0], 24);
    const tr = th.trans();
    u.set([tr.t, tr.kind, tr.dir, 0], 16);
    const tre = tr.el && tr.t < 1 ? tr.el.getBoundingClientRect() : null;
    u.set(
      tre
        ? [(tre.left - rect.left) * sx, (tre.top - rect.top) * sx, tre.width * sx, tre.height * sx]
        : [0, 0, 0, 0],
      20,
    );
    feed(u, dt, (x, y) => [(x - rect.left) * sx, (y - rect.top) * sx], sx, prevValid ? 1 : 0);
    queue.writeBuffer(ubuf, 0, u);
    const enc = device.createCommandEncoder();
    if (bloomDirty || pointer.state.energy > 0) {
      // The bloom chain is quarter-res; refresh it when the DOM changed or the lamp moves.
      fullscreenPass(device, enc, bright.createView(), brightPipe, binds.bright);
      fullscreenPass(device, enc, blurA.createView(), blurPipe, binds.blurH);
      fullscreenPass(device, enc, blurB.createView(), blurPipe, binds.blurV);
      bloomDirty = false;
    }
    fullscreenPass(device, enc, ctx.getCurrentTexture().createView(), compPipe, binds.comp);
    queue.submit([enc.finish()]);
  });
  return () => {
    stopLoop();
    pointer.dispose();
    release();
    ro.disconnect();
    canvas.removeEventListener("paint", onPaint);
    th.listeners.delete(keepPrev);
    for (const t of [tex, prev, bright, blurA, blurB]) t?.destroy();
    for (const b of [ubuf, ubright, blurH, blurV]) b.destroy();
    device.destroy();
  };
}
