// Renders サーガ's route-dive fire (2026-11-24, owner: 「サーガの緑の炎はチープなので
// 修正して」) into one WebP sheet: a ring of the owner's forest-green fire that
// catches at its foot, races up both sides to the crown, roars, and dies to
// embers and smoke. The cover plays it once by stepping a transform over the
// sheet (styles-transition-cinema.css, "The eight riders"), so the dive costs
// no shader, no canvas and no frame loop at run time.
//
// The flame is the opening trace's (src/components/cinematic/opening-burn.frag.glsl):
// the same noise, sparks and forest-green ramp (opening-noise.glsl's fireRamp,
// docs/forest-green-fire-20261019.md), seated on a ring instead of a torn
// front. Drawn in headless Chrome's WebGL and encoded by Chrome's WebP encoder
// (encoded by sharp), so the sheet can be regenerated from this file alone:
//   PW_BROWSER_CHANNEL=chrome node scripts/render-saga-dive-fire.mjs [preview.png]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

// Keep in step with the CSS (--rds-fire-frames, its keyframes and the box).
export const SAGA_FIRE = {
  path: "/saga-dive-fire-20261124.webp",
  frames: 20,
  cols: 5,
  rows: 4,
  width: 400,
  height: 500,
  // The ring's radius in the frame's half-width (the box is the ring's
  // diameter / ringR wide) and its centre from the frame's top (a fraction
  // of the height): room above the crown for the tongues, little below.
  ringR: 0.68,
  ringY: 0.58,
};

const noise = readFileSync(
  new URL("../src/components/cinematic/opening-noise.glsl", import.meta.url),
  "utf8",
);

const SHADER = `#define OCTAVES 5
${noise}
uniform vec2 uRes;
uniform vec2 uGrid;
uniform float uFrames;
uniform float uRingR;
uniform float uRingY;

// The opening trace's near embers (opening-burn.frag.glsl).
float bokehLayer(vec2 q, float t, float scale, float speed, float seed) {
  vec2 g = q * scale;
  g.y -= t * speed;
  g.x += sin(g.y * 0.5 + seed + t * 0.5) * 0.25;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id + seed);
  vec2 o = (vec2(hash12(id + seed + 3.1), hash12(id + seed + 7.7)) - 0.5) * 0.5;
  float r = length(f - o);
  float disc = fall(0.2, 0.04, r) * 0.55 + fall(0.08, 0.0, r) * 0.45;
  return disc * step(0.86, h) * (h - 0.86) * 7.0;
}

void main() {
  // The sheet is read top-down: frame 0 is the top-left cell.
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cellSize = uRes / uGrid;
  vec2 cell = floor(px / cellSize);
  float index = cell.y * uGrid.x + cell.x;
  if (index >= uFrames) { gl_FragColor = vec4(0.0); return; }
  vec2 local = (px - cell * cellSize) / cellSize;   // 0..1, y down
  // Half-widths, y up, from the ring's centre.
  vec2 p = vec2(local.x * 2.0 - 1.0, (uRingY - local.y) * 2.0 * cellSize.y / cellSize.x);
  float t = index / (uFrames - 1.0);   // the one-shot, 0..1
  float T = t * 1.0 + 3.7;             // seconds (offset: a mature noise field)
  float R = uRingR;

  // Life: the ring catches at its foot as the lit ring lands (t 0.14), the
  // fire runs up both sides and meets at the crown (0.38), roars, then sinks
  // from 0.6 and is embers and smoke by the end.
  float catchAt = smoothstep(0.12, 0.4, t);
  float grow = smoothstep(0.12, 0.42, t);
  float die = 1.0 - smoothstep(0.58, 0.97, t);
  float amp = grow * (0.35 + 0.65 * die);

  // Sway first, so the tongues bend off the ring instead of standing on it.
  float sway = (vnoise(vec2(p.x * 2.2 + 3.0, p.y * 1.8 - T * 0.9)) - 0.5) * 0.2;
  // The column widens as it rises (the heat spreads), so the flanks flare
  // into a crown instead of standing as straight walls.
  // Both grow with the height over the ring, so on the ring's own line the
  // fuel sits exactly on the hoop.
  float px0 = clamp(p.x, -R, R);
  float over = max(p.y - sqrt(max(R * R - px0 * px0, 0.0)), 0.0);
  float x = (p.x + sway * smoothstep(0.0, 0.25, over)) / (1.0 + 0.5 * over);
  // The ring is the fuel. Each pixel takes fire from the arc straight below
  // it on the far side (the lower arc, rising through the ring) and on the
  // near side (the upper arc, rising over the crown); past the ring's width
  // the flanks' tongues taper outwards instead of ending on a straight edge.
  float lat = max(abs(x) - R, 0.0);
  float xc = clamp(x, -R, R);
  float s = sqrt(max(R * R - xc * xc, 0.0));
  float hU = p.y - s + 2.4 * lat;
  float hL = p.y + s + 2.4 * lat;
  float angU = acos(clamp(-s / R, -1.0, 1.0));
  float angL = acos(clamp(s / R, -1.0, 1.0));
  float latFade = fall(0.12, 0.0, lat);
  // Beside the flanks (outside the hoop, under the upper arc's line) the
  // vertical has no fuel below on the near side: there the flank's tongues
  // stand off the hoop by their distance from it.
  float r = length(p);
  float beside = r > R && hU < 0.0 ? 1.0 : 0.0;
  hU = mix(hU, (r - R) * 1.6, beside);
  angU = mix(angU, acos(clamp(-p.y / max(r, 0.001), -1.0, 1.0)), beside);

  // The front of the catch runs from the foot (0) to the crown (PI); the
  // foot burns hardest. Tongue reach in frame half-widths, taller up top.
  float front = catchAt * 3.7 - 0.25;
  float litU = fall(front + 0.25, front - 0.25, angU) * step(0.001, catchAt);
  float litL = fall(front + 0.25, front - 0.25, angL) * step(0.001, catchAt);
  float wU = mix(1.0, 0.7, angU / 3.14159) * litU * latFade;
  float wL = mix(1.0, 0.7, angL / 3.14159) * litL * latFade;
  float life = (0.35 + 0.65 * grow) * (0.4 + 0.6 * die);
  float HU = (0.3 + 0.24 * smoothstep(0.5, 2.6, angU)) * life;
  float HL = (0.3 + 0.24 * smoothstep(0.5, 2.6, angL)) * life;

  // ---- Flames: the opening trace's domain-warped, vertically stretched fbm.
  float hNear = mix(max(hL, 0.0), hU, smoothstep(-0.1, 0.0, hU));
  float hh = clamp(hNear / max(HU, 0.001), 0.0, 1.5);
  vec2 fq = vec2(p.x * 4.6, p.y * 2.1 - T * 1.8);
  fq.x += (vnoise(vec2(p.x * 2.0, p.y * 1.4 - T * 0.7)) - 0.5) * (1.0 + 1.4 * hh);
  float turb = fbm(fq) * 0.68 + vnoise(vec2(p.x * 16.0, p.y * 6.0 - T * 3.0)) * 0.32;
  float tongues = clamp((turb - 0.5) * 2.2 + 0.5, 0.0, 1.0);
  float fine = 0.8 + 0.4 * vnoise(vec2(p.x * 28.0, p.y * 12.0 - T * 3.4));
  // Back sheet: other noise, taller and thinner, half a tongue over.
  vec2 bq = vec2(p.x * 3.2 + 4.1, p.y * 1.6 - T * 1.4);
  bq.x += (vnoise(vec2(p.x * 1.3 + 7.0, p.y * 1.1 - T * 0.6)) - 0.5) * (1.2 + 1.4 * hh);
  float tb = clamp((fbm(bq) - 0.5) * 2.0 + 0.5, 0.0, 1.0);

  // Front heat from one arc: the tongue body above it, a burning band on it.
  #define FRONT(hA, HA) ((hA) >= 0.0 ? clamp(1.0 - (hA) / max((HA) * (0.12 + 1.12 * tongues), 0.001), 0.0, 1.0) * (0.36 + 0.9 * tongues) : fall(0.04, 0.0, -(hA)) * 0.5)
  #define BACK(hA, HA) ((hA) >= 0.0 ? clamp(1.0 - (hA) / max((HA) * 1.45 * (0.15 + 1.05 * tb), 0.001), 0.0, 1.0) * (0.3 + 0.7 * tb) : 0.0)
  float heat = max(FRONT(hU, HU) * wU, FRONT(hL, HL) * wL);
  // The hoop itself glows along its line, both sides, where it has caught.
  float angP = acos(clamp(-p.y / max(length(p), 0.001), -1.0, 1.0));
  float litP = fall(front + 0.25, front - 0.25, angP) * step(0.001, catchAt);
  heat = max(heat, fall(0.06, 0.0, abs(length(p) - R)) * 0.62 * litP);
  heat = clamp(heat * fine * 1.2 * amp, 0.0, 1.25);
  float heatB = max(BACK(hU, HU) * wU, BACK(hL, HL) * wL) * 1.1 * amp;
  float fireA = smoothstep(0.07, 0.74, heat);
  float backA = smoothstep(0.08, 0.8, heatB) * 0.5 * (1.0 - fireA);
  vec3 fire = (fireRamp(heat) * fireA + fireRamp(heatB * 0.9) * backA) / max(fireA + backA, 0.0001);
  fireA += backA;
  // Nothing burns outside the hoop below its waist: no fuel rises there.
  float waist = 1.0 - smoothstep(R + 0.01, R + 0.07, length(p)) * (1.0 - smoothstep(-0.14, 0.04, p.y));
  fireA *= waist;

  // Smoke: thin, dark, rising off the crown and flanks as the fire sinks.
  float smokeZone = smoothstep(0.02, 0.25, hU) * fall(0.95, 0.35, hU) * latFade;
  float smokeA = smoothstep(0.5, 0.82, fbm(p * 2.4 + vec2(0.0, -T * 0.5)))
               * smokeZone * smoothstep(0.3, 0.75, t) * 0.34 * litU;

  // Sparks and near embers rise off the burning ring, more as it dies.
  float sparkZone = max(fall(0.75, 0.0, hU) * smoothstep(-0.05, 0.05, hU) * litU,
                        fall(0.5, 0.0, hL) * smoothstep(-0.05, 0.05, hL) * litL)
                  * latFade * smoothstep(0.18, 0.4, t) * waist;
  float embers = (emberLayer(p, T, 13.0, 0.75, 1.0) + emberLayer(p, T, 8.0, 0.5, 5.0) * 0.95)
               * sparkZone * (0.6 + 0.6 * (1.0 - die));
  float bokeh = bokehLayer(p, T, 4.5, 0.35, 11.0) * sparkZone * 0.8;

  // Premultiplied: fire and sparks are light; smoke is a dark cover.
  vec3 light = fire * fireA + vec3(0.23, 0.72, 0.235) * embers * 1.5
             + vec3(0.27, 0.72, 0.315) * bokeh * 0.6;
  vec4 outC = vec4(vec3(0.006, 0.014, 0.008) * smokeA, smokeA);
  outC.rgb = light + outC.rgb * (1.0 - fireA);
  outC.a = max(outC.a, max(light.r, max(light.g, light.b)));
  outC = clamp(outC, 0.0, 1.0);
  // Straight alpha for the WebP: the light's own hue at its own strength.
  gl_FragColor = outC.a > 0.0005 ? vec4(outC.rgb / outC.a, outC.a) : vec4(0.0);
}
`;

const isMain = fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const preview = process.argv[2] || "";
  const { frames, cols, rows, width: fw, height: fh, ringR, ringY, path } = SAGA_FIRE;
  const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || undefined });
  const page = await browser.newPage();
  await page.setContent("<!doctype html><body></body>");
  const result = await page.evaluate(
    ({ shader, width, height, cols, rows, frames, ringR, ringY }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const gl = canvas.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: true });
      const compile = (type, source) => {
        const created = gl.createShader(type);
        gl.shaderSource(created, source);
        gl.compileShader(created);
        if (!gl.getShaderParameter(created, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(created));
        return created;
      };
      try {
        const program = gl.createProgram();
        gl.attachShader(
          program,
          compile(gl.VERTEX_SHADER, "attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }"),
        );
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, shader));
        gl.bindAttribLocation(program, 0, "aPos");
        gl.linkProgram(program);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(gl.getUniformLocation(program, "uRes"), width, height);
        gl.uniform2f(gl.getUniformLocation(program, "uGrid"), cols, rows);
        gl.uniform1f(gl.getUniformLocation(program, "uFrames"), frames);
        gl.uniform1f(gl.getUniformLocation(program, "uRingR"), ringR);
        gl.uniform1f(gl.getUniformLocation(program, "uRingY"), ringY);
        gl.viewport(0, 0, width, height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return { png: canvas.toDataURL("image/png") };
      } catch (error) {
        return { error: String(error) };
      }
    },
    { shader: SHADER, width: cols * fw, height: rows * fh, cols, rows, frames, ringR, ringY },
  );
  await browser.close();
  if (result.error) throw new Error(result.error);
  // Encoded by sharp with lossy alpha: the fire's soft alpha costs three
  // times as much lossless (Chrome's encoder), with no visible gain.
  const png = Buffer.from(result.png.split(",")[1], "base64");
  const bytes = await sharp(png)
    .webp({ quality: 72, alphaQuality: 70, effort: 6, smartSubsample: true })
    .toBuffer();
  writeFileSync(new URL(`../public${path}`, import.meta.url), bytes);
  if (preview) writeFileSync(preview, png);
  console.log(`${path}: ${cols * fw}x${rows * fh}, ${frames} frames, ${bytes.length} bytes`);
}
