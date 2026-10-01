// RISING THE WORLD — the flames and the smoke, drawn at half resolution into a
// texture that the main pass (rising.frag.glsl) composites. Both are soft by
// nature, so a quarter of the pixels costs nothing visible, and the burn's
// heaviest work (finding the front straight below, burn holes included, the
// tongues, the billows) runs on a quarter of the pixels. GLSL ES 1.00.
//   r: flame opacity, from optical depth: thin edges and tips are dim and
//      see-through, only the thick roots saturate
//   g: flame temperature x opacity / 1.25 (premultiplied, so it filters right)
//   b: smoke cover
//   a: smoke light x cover (premultiplied): 1 = the side turned to the fire
// Every fetch sits in uniform control flow (the noise tile is mipmapped).
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

#ifndef OCTAVES
#define OCTAVES 4
#endif

uniform vec2 uRes;          // this pass's target size (px)
uniform float uTime;        // seconds since the sequence started
uniform float uBurn;        // 0..1 burn level (front climbs bottom -> top)
uniform float uFlame;       // 0..1 flame intensity
uniform sampler2D uNoise;   // r, g: fbm; b: cell edge distance; a: fine fbm (rising-noise.frag.glsl)

// GLSL ES 1.00 leaves smoothstep(e0, e1, x) undefined for e0 >= e1 (some mobile drivers
// return garbage), so falling edges use this instead.
float fall(float e0, float e1, float x) { return 1.0 - smoothstep(e1, e0, x); }
vec4 nz(vec2 q) { return texture2D(uNoise, q); }

// Burn holes (kept identical in rising.frag.glsl): embers carried ahead of the
// front land where the middle octave peaks and set the print alight there
// first, up to about half a screen height ahead, more and further as the
// fire builds. Only ever grows (uBurn only rises), so nothing un-burns.
float holeLead(float midN) {
  float site = smoothstep(0.52, 0.92, midN);
  return (0.2 * smoothstep(0.02, 0.2, uBurn) + 0.3 * smoothstep(0.15, 0.55, uBurn)) * site * site;
}

// The frame erodes from its margins too (kept identical in
// rising.frag.glsl): a print held over a fire chars first along its
// edges, the bottom corners curling in, the sides catching up to about a
// quarter screen height ahead of the front, less towards the top (so the top
// never catches earlier than the front alone would bring it). Ragged along
// the margin (the middle octave), and it only grows with uBurn.
float rimLead(vec2 bq, float midN) {
  float width = max(uRes.x / uRes.y, 0.7);
  float margin = fall(0.21, 0.0, min(bq.x, width - bq.x));
  float ragged = 0.5 + 1.0 * midN;
  return 0.3 * smoothstep(0.04, 0.42, uBurn) * margin * margin * ragged * (1.0 - 0.74 * bq.y);
}

// The main pass's burn field without its fine octave: the low octave tears
// the front into tongues and islands, the middle one frays it and opens the
// holes ahead of it; the margins char ahead of it as well.
float coarseField(vec2 bq) {
  float midN = nz(bq * 1.3 + vec2(0.61, 0.07)).g;
  float field = bq.y * 0.8 + (nz(bq * 0.36 + vec2(0.17, 0.53)).r - 0.5) * 0.5
       + (midN - 0.5) * 0.2 - holeLead(midN);
  return field - rimLead(bq, midN);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;                 // 0..1, y up
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float T = uTime;
  // Flame space: tongue density follows the screen width, so a portrait phone
  // gets as many tongues across as a desktop instead of two giant blobs.
  float kx = max(1.0, 0.75 / aspect);
  vec2 fq = vec2(p.x * kx, uv.y);
  vec2 bq = uv * vec2(max(aspect, 0.7), 1.0);
  float level = mix(-0.27, 1.12, uBurn);

  // The burn field here, with the fine octave (so the roots sit on the main
  // pass's lip), and the coarse field 0.035, 0.08, 0.2 and 0.36 screen
  // heights below (and 0.07 above, for the island test further down).
  float edgeFine = nz(bq * 5.2 + vec2(0.23, 0.91)).a;
  float fibre = abs(edgeFine - 0.5) * 2.0;
  float d = coarseField(bq) + (fibre - 0.4) * 0.028 + (edgeFine - 0.5) * 0.02 - level;
  float f0 = coarseField(bq - vec2(0.0, 0.035)) - level;
  float f1 = coarseField(bq - vec2(0.0, 0.08)) - level;
  float f2 = coarseField(bq - vec2(0.0, 0.2)) - level;
  float f3 = coarseField(bq - vec2(0.0, 0.36)) - level;
  float hy = d / 0.8;                               // field distance (screen heights): the smoke
  // Flames rise straight up from the front: their height is measured down to
  // the nearest crossing of the front below (interpolated between the
  // samples), never across the field. Nothing hangs under an overhang, hugs
  // the side of a burnt hole or rings an island. From a burnt pixel the
  // search looks for print below instead: an island of print burning there
  // sends its flames up over the char above it, rather than filling its own
  // outline like a cut-out.
  float sgn = d > 0.0 ? 1.0 : -1.0;
  float g0 = f0 * sgn;
  float g1 = f1 * sgn;
  float g2 = f2 * sgn;
  float g3 = f3 * sgn;
  float h0 = 0.035 * clamp(d * sgn / max((d - f0) * sgn, 0.0001), 0.0, 1.0);
  float h1 = 0.035 + 0.045 * clamp(g0 / max(g0 - g1, 0.0001), 0.0, 1.0);
  float h2 = 0.08 + 0.12 * clamp(g1 / max(g1 - g2, 0.0001), 0.0, 1.0);
  float h3 = 0.2 + 0.16 * clamp(g2 / max(g2 - g3, 0.0001), 0.0, 1.0);
  float hv = g1 <= 0.0 ? h1 : (g2 <= 0.0 ? h2 : (g3 <= 0.0 ? h3 : 1.0));
  // The closest sample first: the rim of a burn hole just below is the
  // crossing, so its flames stand on it instead of floating above it.
  hv = g0 <= 0.0 ? h0 : hv;
  // A young hole below (char within 0.08, print again by 0.2) has burnt
  // little yet, so its flames stay low, and a tiny one's (print again by
  // 0.08) lower still; they grow with the hole.
  float young = d > 0.0 && g1 <= 0.0 && g2 > 0.0 ? 1.0 : 0.0;
  float tiny = d > 0.0 && g0 <= 0.0 && g1 > 0.0 ? 1.0 : 0.0;
  // Burnt, and no print below within reach: the fresh char just under the
  // lip, where the roots of the lip's own flames reach down a little.
  float under = d <= 0.0 && hv > 0.99 ? 1.0 : 0.0;
  // Print below a burnt hole burns downwards, slowly, with short flames.
  float downwards = d <= 0.0 && hv <= 0.99 ? 1.0 : 0.0;
  hv = mix(hv, 0.0, under);
  // Only the freshest char still feeds the flames. A thin island of print
  // (char above it as well as below) is little fuel: it smoulders along its
  // lips with low flames instead of filling its outline with a solid blaze.
  float fu = coarseField(bq + vec2(0.0, 0.07)) - level;
  float island = d > 0.0 && fu <= 0.0 ? 1.0 : 0.0;
  // (hy <= 0 wherever under is 1. Clamped for every pixel anyway: mix()
  // evaluates both sides, and at FP16 (no highp) the unclamped exponential
  // overflows to inf over intact print, where inf x 0 makes the flame NaN.)
  float fuel = mix((1.0 - 0.6 * island) * (1.0 - 0.45 * downwards), exp(min(hy, 0.0) / 0.035), under);

  // ---- Flames: domain-warped, upward-advected turbulence rising off the
  // front. The sway bends the tips far more than the roots; small eddies,
  // stretched upright, split the body into tongues that streak upwards.
  vec2 sway = nz(fq * vec2(0.42, 0.3) + vec2(0.13, -fract(T * 0.17))).rg - 0.5;
  float tall = nz(vec2(fq.x * 0.31 + 0.71, 0.37 + fract(T * 0.043))).g;   // tongue height along the front
  // Each tongue swells and sinks on its own slow beat (about once a second),
  // never all together: no global brightness pulse.
  float pulse = nz(vec2(fq.x * 0.83 + 0.33, 0.61 + fract(T * 0.21))).r;
  // Some stretches of the front burn low, with no sheet of flame at the lip,
  // so the browning and the blisters ahead of it show there.
  float lively = smoothstep(0.22, 0.5, tall);
  // The fire builds from a slow catch to a roar: its flames grow taller and
  // fuller as the burn gathers pace (uBurn only rises; the settle takes them
  // down again through uFlame).
  float roar = smoothstep(0.02, 0.45, uBurn);
  // About 0.07 to 0.19 screen heights at the catch, 0.12 to 0.40 at the
  // roar, a fifth lower on portrait screens.
  float H = (0.12 + 0.18 * smoothstep(0.25, 0.8, tall)) * (0.6 + 0.4 * uFlame) * (0.85 + 0.3 * pulse)
          * (0.55 + 0.6 * roar)
          * (1.0 - 0.2 * smoothstep(1.0, 1.8, kx)) * (1.0 - 0.55 * downwards)
          * (1.0 - 0.4 * young - 0.65 * tiny);
  float h = hv / H;
  float bend = 0.1 + 0.4 * min(h, 1.4) * min(h, 1.4);
  // Stretched upright, and more so as the gas rises and speeds up.
  vec2 q = fq * vec2(1.9, 0.62 / (1.0 + 0.35 * min(h, 1.5))) + sway * vec2(0.32, 0.12) * bend;
#if OCTAVES >= 3
  // Small eddies, upright but rounder than streaks: they curl the tongues'
  // edges instead of combing them into lines.
  vec4 eddy = nz(q * vec2(2.4, 2.8) + vec2(0.37, -fract(T * 2.2)));
  float n2 = eddy.g;
  // The small eddies warp the large ones sideways, more towards the tips:
  // the tongues lick, fork and pinch off instead of rounding off.
  vec4 swirl = nz(q + vec2((n2 - 0.5) * 0.42 * min(h, 1.5), -fract(T * 0.5)));
  float n1 = swirl.r;
  float turb = 0.5 + (n1 * 0.6 + n2 * 0.4 - 0.5) * 1.35;
  // The same fetches' other channels: an independent sheet of flame behind.
  float turbB = 0.5 + (swirl.g * 0.6 + eddy.r * 0.4 - 0.5) * 1.35;
  // The swirl fetch's fine channel: filaments that split the tongues' upper
  // halves into licks that fray and detach, so the tips are never smooth.
  turb += (swirl.a - 0.5) * 0.16 * smoothstep(0.25, 1.1, h);
#else
  float n1 = nz(q + vec2(0.0, -fract(T * 0.5))).r;
  float n2 = n1;
  float turb = n1;
#endif
  // A threshold that climbs with the height: a sheet at the lip (where the
  // front burns lively), tongues of mixed height above it, flamelets pinched
  // off near the tips, and nothing past 1.3 H: no stray puffs higher up.
  // (Kept off zero: some drivers evaluate pow as exp2(y * log2(x)).)
  float th = 0.12 + 0.48 * pow(max(h, 0.0001), 1.2);
  // Tongues: above the sheet at the lip the flame parts into fingers that
  // narrow to points. Their lanes are irregular (the spacing drifts along
  // the front) and lean and lick with the sway.
  float lanePhase = fq.x * 6.0 + tall * 2.6 + pulse * 0.8 + sway.x * 1.6 * bend;
  float lane = 0.5 - 0.5 * cos(6.2831853 * fract(lanePhase));
  th += lane * 0.26 * smoothstep(0.12, 0.9, h);
  float dens = (turb - th + 0.18 * fall(0.35, 0.06, h) * lively * (1.0 - downwards) * (1.0 - island))
             * fuel * fall(1.3, 0.95, h)
             - (1.0 - fuel) * 0.3;
  // Defined edges: the optical depth rises quickly into a tongue's body.
  dens *= 1.5;
  // After the image is gone, low fire keeps licking along the bottom edge,
  // patchy: only where the last fuel lies.
  float resH = uv.y / (0.04 + 0.07 * tall);
  float resDens = (turb - min(0.36 + 0.6 * resH, 0.95)) * smoothstep(0.72, 0.97, uBurn)
                * smoothstep(0.3, 0.6, tall) * fall(1.3, 0.9, resH);
  dens = max(dens, resDens);
  float flame = 1.0 - exp(-6.0 * max(dens, 0.0));
  // Blackbody: the soot is hottest in the thick roots and cools as it rises:
  // yellow-white at the base, orange in the body. A dying flamelet shrinks
  // and stays orange; only its thin rim runs dull red, and dim (it is thin).
  float core = smoothstep(0.06, 0.6, dens) * (0.8 + 0.4 * n2);
  float temp = (0.43 + 0.32 * core) * (1.0 - 0.26 * smoothstep(0.0, 1.2, h)) + 0.2 * exp(-h * 6.0) * fuel;
  temp = max(temp, 0.47) - 0.07 * fall(0.1, 0.0, dens);

#if OCTAVES >= 3
  // Depth: a second sheet behind the first, taller, thinner and cooler, so
  // the gaps between the tongues fill with dim, see-through orange and the
  // fire reads as a volume, not a cut-out. It grows with the roar.
  float hB = h / 1.3;
  // Its fingers stand between the front ones (half a lane over).
  float laneB = 0.5 + 0.5 * cos(6.2831853 * fract(lanePhase));
  float densB = (turbB - 0.16 - 0.5 * pow(max(hB, 0.0001), 1.2) - laneB * 0.22 * smoothstep(0.12, 0.9, hB)
                + 0.1 * fall(0.3, 0.05, hB) * lively * (1.0 - downwards) * (1.0 - island))
              * fuel * fall(1.3, 0.95, hB) - (1.0 - fuel) * 0.3;
  float flameB = (1.0 - exp(-5.0 * max(densB, 0.0))) * (0.26 + 0.36 * roar);
  float tempB = 0.46 + 0.14 * smoothstep(0.0, 0.3, densB) - 0.05 * smoothstep(0.4, 1.2, hB);
  // Front over back: opacity and opacity-weighted temperature.
  float behind = flameB * (1.0 - flame);
  temp = (flame * temp + behind * tempB) / max(flame + behind, 0.004);
  flame += behind;
#endif

  // ---- Smoke: a lit medium in a few plumes that rise off the tallest
  // stretches of the fire, drift up faster than the front climbs and widen
  // as they go, merging only near the top. Denser towards each core, thin
  // at the edges; lit from below by the fire (one more fetch towards the
  // fire gives the self-shadow).
  float smoke = 0.0;
  float shade = 0.5;
#if OCTAVES >= 3
  float sh = hy - 0.12;
  float widen = 1.0 / (1.0 + 0.9 * max(sh, 0.0));
  vec2 sq = vec2(p.x * kx * 0.8 * widen, uv.y * 0.7);
  vec2 sw = nz(sq * 0.6 + vec2(0.71, -fract(T * 0.11))).gr - 0.5;
  vec2 sp0 = sq + sw * 0.3 + vec2(0.29, -fract(T * 0.3));
  float s1 = nz(sp0).r;
  // Where this billow rose from: the tongue height there, a moment ago.
  float source = nz(vec2(fq.x * widen * 0.31 + 0.71, 0.37 + fract(T * 0.043 - 0.03))).g;
#if OCTAVES >= 4
  float s2 = nz(sq * 2.3 + sw * 0.2 + vec2(0.55, -fract(T * 0.5))).g;
  float below = nz(sp0 - vec2(0.0, 0.04)).r;
  float sn = s1 * 0.72 + s2 * 0.28;
#else
  float below = s1 - 0.02;
  float sn = s1;
#endif
  sn += 0.04 * roar;
  // More of the fire smokes, and more thickly, as it builds to its roar.
  float plume = mix(smoothstep(0.3 - 0.12 * roar, 0.65 - 0.1 * roar, source), 0.7, smoothstep(0.25, 0.8, sh));
  float envelope = smoothstep(0.0, 0.15, sh) * plume * uFlame * (0.75 + 0.65 * roar);
  float body = smoothstep(0.5, 0.58, sn);
  float thick = smoothstep(0.58, 0.7, sn);
  smoke = body * (0.45 + 0.55 * thick) * envelope;
  // The side turned to the fire is lit, the top and the dense cores shadowed.
  shade = clamp(0.5 + (s1 - below) * 9.0, 0.0, 1.0) * (1.0 - 0.35 * thick);
#endif

  gl_FragColor = vec4(flame, flame * clamp(temp, 0.0, 1.25) / 1.25, smoke, smoke * shade);
}
