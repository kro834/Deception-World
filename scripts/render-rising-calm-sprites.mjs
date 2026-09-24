// Renders the RISING THE WORLD calm (CSS) tier's sprites into public/:
// three flame frames, two burn-edge strips and the scorch ahead of each (from
// the two fractal profiles the flames are seated on, rising-calm.ts), a
// tileable char texture and a smoke billow. Each is drawn by a small WebGL 2 shader in headless Chrome and
// encoded by Chrome's WebP encoder (alpha included), so the assets can be
// regenerated from this file alone:
//   PW_BROWSER_CHANNEL=chrome node scripts/render-rising-calm-sprites.mjs [previewDir]
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import {
  CALM_EDGE_SEED,
  CALM_EDGE_STRIP,
  burnEdge,
  calmEdgeAhead,
} from "../src/components/world/rising-calm.ts";
import {
  RISING_CALM_CHAR,
  RISING_CALM_EDGES,
  RISING_CALM_FLAMES,
  RISING_CALM_SCORCHES,
  RISING_CALM_SMOKE,
} from "../src/components/world/rising-art.ts";

const previewDir = process.argv[2] || "";
const publicRoot = new URL("../public/", import.meta.url);

const COMMON = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uSeed;
out vec4 outColor;

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
// Gradient noise; with period > 0 it repeats every period lattice cells.
float gnoise(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 i00 = i, i10 = i + vec2(1.0, 0.0), i01 = i + vec2(0.0, 1.0), i11 = i + vec2(1.0);
  if (period > 0.0) {
    i00 = mod(i00, period); i10 = mod(i10, period); i01 = mod(i01, period); i11 = mod(i11, period);
  }
  float a = dot(hash22(i00 + uSeed) * 2.0 - 1.0, f);
  float b = dot(hash22(i10 + uSeed) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(hash22(i01 + uSeed) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float d = dot(hash22(i11 + uSeed) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// Like the runtime tile's fbm (rising-noise.frag.glsl): 5 octaves from 4
// lattice cells a unit, stretched to 0..1.
float fbm(vec2 p, float period) {
  float v = 0.0, a = 0.5, norm = 0.0, f = 4.0;
  for (int i = 0; i < 5; i++) {
    v += a * gnoise(p * f + float(i) * 7.13, period > 0.0 ? period * f : 0.0);
    norm += a; f *= 2.0; a *= 0.5;
  }
  return clamp(0.5 + v / norm * 1.9, 0.0, 1.0);
}
float fbm(vec2 p) { return fbm(p, 0.0); }
// Voronoi F2 - F1 (0 on the cell edges); period > 0 wraps the cells.
float cellEdge(vec2 p, float period) {
  vec2 i = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 c = i + o;
    if (period > 0.0) c = mod(c, period);
    float dist = length(o + hash22(c + 91.7 + uSeed) - f);
    f2 = min(f2, max(f1, dist));
    f1 = min(f1, dist);
  }
  return f2 - f1;
}
vec3 blackbody(float t) {
  t = clamp(t, 0.0, 1.15);
  vec3 hue = vec3(1.0, 0.035, 0.006);
  hue = mix(hue, vec3(1.0, 0.2, 0.03), smoothstep(0.25, 0.55, t));
  hue = mix(hue, vec3(1.0, 0.46, 0.1), smoothstep(0.5, 0.8, t));
  hue = mix(hue, vec3(1.0, 0.7, 0.36), smoothstep(0.78, 1.05, t));
  return hue * (3.4 * t * t * t + 0.35 * t);
}
// Straight alpha from a premultiplied colour.
vec4 straight(vec3 pm, float a) {
  return a > 0.002 ? vec4(min(pm / a, vec3(1.0)), a) : vec4(0.0);
}
`;

// A cluster of three tongues of mixed height (root along the bottom), the
// runtime flame model: advected, domain-warped turbulence against a threshold
// that climbs with height, blackbody colour, translucent where thin. Frames
// are the same fire a moment apart, so the tier's cross-fades read as motion.
const FLAME = `${COMMON}
uniform float uT;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  // Each frame re-forms the tongues a little (they swell, sink and shift).
  float k = uT * 6.0;
  float H = 0.28
    + (0.5 + 0.12 * sin(k * 2.1)) * exp(-pow((uv.x - 0.5 - 0.05 * sin(k * 1.3)) / 0.13, 2.0))
    + (0.38 + 0.1 * cos(k * 1.7)) * exp(-pow((uv.x - 0.24 + 0.03 * cos(k)) / 0.1, 2.0))
    + (0.32 + 0.12 * sin(k * 2.9 + 1.0)) * exp(-pow((uv.x - 0.78) / 0.11, 2.0));
  float h = uv.y / (H * 1.3);
  vec2 q = vec2(uv.x * 0.525, uv.y * 0.84);
  vec2 sway = vec2(fbm(q * 0.8 + vec2(0.13, -uT * 0.17)), fbm(q * 0.8 + vec2(5.2, -uT * 0.17))) - 0.5;
  float bend = 0.1 + 0.42 * min(h, 1.8) * min(h, 1.8);
  q += sway * vec2(0.3, 0.14) * bend;
  float n1 = fbm(q * vec2(1.5, 0.72) + vec2(0.0, -uT * 0.44));
  float n2 = fbm(q * vec2(3.6, 1.15) + vec2(0.37, -uT * 0.95));
  float turb = n1 * 0.55 + n2 * 0.45;
  // The cluster thins out towards the sprite's sides: a ragged, turbulent
  // falloff of the density and then of the opacity, never a crisp cut (a
  // seat would show one as a straight seam).
  float edgeX = min(uv.x, 1.0 - uv.x) + (n2 - 0.5) * 0.12;
  float side = smoothstep(0.0, 0.3, edgeX);
  float th = 0.12 + 0.74 * (1.0 - exp(-1.2 * h)) + 0.3 * smoothstep(1.6, 2.6, h);
  float dens = turb - th + 0.3 * (1.0 - smoothstep(0.1, 0.45, h)) - (1.0 - side) * 0.35;
  float body = smoothstep(0.0, 0.06, dens);
  float core = smoothstep(0.0, 0.32, turb - th) * (0.8 + 0.4 * n2);
  float temp = (0.38 + 0.46 * core) * (1.0 - 0.46 * smoothstep(0.0, 1.35, h)) + 0.1 * exp(-h * 6.0);
  vec3 tm = 1.0 - exp(-blackbody(temp) * body * 1.25);
  float a = clamp(max(tm.r, max(tm.g, tm.b)) * 1.3, 0.0, 1.0);
  // Faded out to every edge of the sprite.
  float fade = smoothstep(0.0, 0.06, uv.y) * smoothstep(0.0, 0.04, 1.0 - uv.y)
             * smoothstep(0.0, 0.22, edgeX) * smoothstep(0.0, 0.05, min(uv.x, 1.0 - uv.x));
  outColor = straight(tm * fade, a * fade);
}`;

// The profile (Catmull-Rom through the 129 heights) and its fray, shared by
// the strip and its scorch so both hug the same lip. Box units, y down.
const EDGE_PROFILE = `${COMMON}
uniform float uYs[129];
uniform float uTop;
uniform float uBottom;
float edgeAt(float x) {
  float pos = clamp(x, 0.0, 1000.0) / 1000.0 * 128.0;
  int i = int(min(floor(pos), 127.0));
  float f = pos - float(i);
  float y0 = uYs[max(i - 1, 0)], y1 = uYs[i], y2 = uYs[i + 1], y3 = uYs[min(i + 2, 128)];
  return 0.5 * (2.0 * y1 + (-y0 + y2) * f + (2.0 * y0 - 5.0 * y1 + 4.0 * y2 - y3) * f * f
    + (-y0 + 3.0 * y1 - 3.0 * y2 + y3) * f * f * f);
}
float frayAt(vec2 b) {
  return (fbm(b / 1100.0) - 0.5) * 26.0
       + (abs(fbm(b / 260.0 + 3.3) - 0.5) * 2.0 - 0.4) * 8.0
       + (fbm(b / 70.0 + 7.1) - 0.5) * 5.0
       + (abs(fbm(b / 22.0 + 1.9) - 0.5) * 2.0 - 0.4) * 4.0;
}
`;

// A burn edge strip: an incandescent lip whose width and brightness vary
// along it (the print blackens just ahead of it), fresh char behind it with
// plates and cracks glowing orange that cool to dull red and grey-rimmed black
// further down, fading out at the bottom onto the tile. The tier draws the
// flames behind the strips, so the char cuts their roots along the lip.
const EDGE = `${EDGE_PROFILE}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);          // pixels, y down
  float x = px.x / uRes.x * 1000.0;
  float y = uTop + px.y / uRes.y * (uBottom - uTop);                  // box units
  vec2 b = vec2(x, y);
  float d = y - edgeAt(x) - frayAt(b);                                // > 0 burnt

  // Just ahead of the lip the print blackens (the flames, drawn behind the
  // strip, rise from here).
  float sc = smoothstep(-7.0, 0.0, d);
  vec3 pm = vec3(0.04, 0.016, 0.006) * sc * 0.7;
  float a = sc * 0.7;

  // Char: plates split by cracks that gape in stretches, their edges
  // greying; hot near the lip, cold and quiet further down.
  vec2 cp = px / 34.0 + (vec2(fbm(px / 400.0), fbm(px / 400.0 + 4.0)) - 0.5) * 1.0;
  float e = cellEdge(cp, 0.0);
  float heat = exp(-max(d, 0.0) / 30.0);
  float gape = smoothstep(0.35, 0.6, fbm(b / 420.0 + 6.0));
  float crack = (1.0 - smoothstep(0.02, 0.07, e)) * (0.35 + 0.65 * gape);
  float rim = smoothstep(0.05, 0.1, e) * (1.0 - smoothstep(0.12, 0.22, e)) * (0.4 + 0.6 * gape);
  float tone = fbm(b / 900.0 + 9.0);
  vec3 charCol = vec3(0.022, 0.017, 0.015) * (0.65 + 0.7 * tone);
  charCol = mix(charCol, vec3(0.15, 0.14, 0.13), rim * 0.5 * smoothstep(4.0, 30.0, d));
  charCol = mix(charCol, vec3(0.005, 0.004, 0.004), crack * 0.8);
  float aC = smoothstep(-1.5, 1.5, d);
  pm = charCol * aC + pm * (1.0 - aC);
  a = aC + a * (1.0 - aC);

  // Light: the lip (width and brightness vary along it), the ember bed
  // right behind it, cracks that cool from orange to dull red, specks.
  float w = 2.0 + 4.5 * fbm(vec2(x / 180.0, 2.0));
  // Brighter stretches and nearly dark ones where the lip has already cooled.
  float bright = (0.55 + 0.7 * fbm(vec2(x / 90.0, 5.0))) * (0.3 + 0.7 * smoothstep(0.3, 0.52, fbm(vec2(x / 260.0, 9.0))));
  float lip = exp(-pow((d + 1.0) / w, 2.0));
  float halo = exp(-pow((d + 2.0) / (w * 4.0), 2.0));
  vec3 emit = blackbody(0.97) * lip * 1.3 * bright + blackbody(0.66) * halo * 0.8 * bright;
  emit += blackbody(0.55) * exp(-max(d, 0.0) / 9.0) * aC * (0.45 + 0.7 * fbm(b / 90.0 + 2.0));
  emit += blackbody(mix(0.34, 0.62, heat)) * crack * gape * aC * heat * 1.6;
  float speck = smoothstep(0.5, 0.75, cellEdge(px / 9.0 + 40.0, 0.0)) * smoothstep(0.62, 0.8, fbm(b / 160.0));
  emit += blackbody(mix(0.4, 0.62, heat)) * speck * aC * heat;
  vec3 tm = 1.0 - exp(-emit);
  pm += tm;
  a = max(a, clamp(max(tm.r, max(tm.g, tm.b)) * 1.1, 0.0, 1.0));

  float bottom = 1.0 - smoothstep(uBottom - 45.0, uBottom - 2.0, y);
  outColor = straight(pm * bottom, a * bottom);
}`;

// The print ahead of the lip, drawn under the flames: it yellows, browns and
// blisters, then blackens at the lip; the reach varies along the front (hot
// spots scorch first). Transparent at and below the lip, where the strip's
// char covers it.
const SCORCH = `${EDGE_PROFILE}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float x = px.x / uRes.x * 1000.0;
  float y = uTop + px.y / uRes.y * (uBottom - uTop);
  vec2 b = vec2(x, y);
  float d = y - edgeAt(x) - frayAt(b);
  float reach = 12.0 + 26.0 * fbm(vec2(x / 260.0, 3.0)) + 10.0 * (fbm(b / 60.0 + 5.0) - 0.5);
  float t = clamp(-d / reach, 0.0, 1.0);                             // 0 at the lip
  float ahead = (1.0 - smoothstep(0.35, 1.0, t)) * (1.0 - smoothstep(-1.0, 3.0, d));
  vec3 col = mix(vec3(0.05, 0.02, 0.008), vec3(0.3, 0.17, 0.06), smoothstep(0.05, 0.7, t));
  float a = ahead * mix(0.9, 0.2, smoothstep(0.0, 0.8, t));
  // Blisters: raised bubbles in the brown band catch the firelight.
  float e = cellEdge(px / 7.0 + 7.0, 0.0);
  float bubble = smoothstep(0.35, 0.6, e) * smoothstep(0.15, 0.4, t) * (1.0 - smoothstep(0.55, 0.85, t))
               * smoothstep(0.42, 0.62, fbm(b / 90.0 + 11.0));
  col = mix(col, vec3(0.5, 0.24, 0.08), bubble * 0.6);
  outColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

// Cold char, tileable: plates, cracks, greying rims and ash, a few dull embers.
const CHAR = `${COMMON}
void main() {
  vec2 t = gl_FragCoord.xy / uRes;                // 0..1, repeats
  float e = cellEdge(t * 9.0, 9.0);
  float crack = 1.0 - smoothstep(0.02, 0.08, e);
  float rim = smoothstep(0.06, 0.12, e) * (1.0 - smoothstep(0.14, 0.26, e));
  float tone = fbm(t, 1.0);
  float ash = smoothstep(0.62, 0.82, fbm(t + 0.37, 1.0));
  vec3 col = vec3(0.022, 0.017, 0.015) * (0.6 + 0.8 * tone);
  col = mix(col, vec3(0.085, 0.08, 0.075), ash * 0.5);
  col = mix(col, vec3(0.13, 0.12, 0.11), rim * 0.42);
  col = mix(col, vec3(0.005, 0.004, 0.004), crack * 0.85);
  float ember = smoothstep(0.7, 0.85, fbm(t * 1.0 + 2.1, 1.0)) * crack;
  col += 1.0 - exp(-blackbody(0.34) * ember * 0.5);
  outColor = vec4(col, 1.0);
}`;

// A smoke billow: lobed, denser in the middle, lit warm from below.
const SMOKE = `${COMMON}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 c = uv - 0.5;
  float ang = atan(c.y, c.x);
  float r = length(c) * 2.0;
  r -= (fbm(uv * 0.6) - 0.5) * 0.55 + 0.07 * sin(ang * 5.0 + 1.3) + 0.04 * sin(ang * 9.0);
  float dens = (1.0 - smoothstep(0.3, 0.95, r)) * (0.55 + 0.6 * fbm(uv * 1.3 + 3.0));
  float lit = 1.0 - smoothstep(0.15, 0.7, uv.y);
  vec3 col = mix(vec3(0.3, 0.27, 0.25), vec3(0.62, 0.33, 0.15), lit * 0.8) * (0.75 + 0.35 * fbm(uv * 2.0 + 8.0));
  float a = clamp(dens, 0.0, 1.0) * 0.8;
  outColor = vec4(col, a);
}`;

const sprites = [
  ...RISING_CALM_FLAMES.map((path, index) => ({
    path,
    shader: FLAME,
    size: [200, 320],
    uniforms: { uT: index * 0.16, uSeed: 0 },
    quality: 0.82,
  })),
  // The first front, and the front it re-forms into halfway up.
  ...[burnEdge(CALM_EDGE_SEED).ys, calmEdgeAhead().ys].flatMap((ys, index) => {
    const uniforms = {
      uSeed: 0,
      uTop: CALM_EDGE_STRIP.top,
      uBottom: CALM_EDGE_STRIP.bottom,
      uYs: ys,
    };
    return [
      { path: RISING_CALM_EDGES[index], shader: EDGE, size: [800, 540], uniforms, quality: 0.7 },
      // Soft by nature: half the strip's resolution.
      {
        path: RISING_CALM_SCORCHES[index],
        shader: SCORCH,
        size: [400, 270],
        uniforms,
        quality: 0.7,
      },
    ];
  }),
  { path: RISING_CALM_CHAR, shader: CHAR, size: [256, 256], uniforms: { uSeed: 3 }, quality: 0.72 },
  {
    path: RISING_CALM_SMOKE,
    shader: SMOKE,
    size: [192, 192],
    uniforms: { uSeed: 5 },
    quality: 0.75,
  },
];

const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || undefined });
const page = await browser.newPage();
await page.setContent("<!doctype html><body></body>");
if (previewDir) mkdirSync(previewDir, { recursive: true });
for (const sprite of sprites) {
  const { webp, png, error } = await page.evaluate(
    async ({ shader, size, uniforms, quality }) => {
      const canvas = document.createElement("canvas");
      [canvas.width, canvas.height] = size;
      const gl = canvas.getContext("webgl2", {
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
      });
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
          compile(
            gl.VERTEX_SHADER,
            "#version 300 es\nin vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }",
          ),
        );
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, shader));
        gl.bindAttribLocation(program, 0, "aPos");
        gl.linkProgram(program);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(gl.getUniformLocation(program, "uRes"), size[0], size[1]);
        for (const [name, value] of Object.entries(uniforms)) {
          const at = gl.getUniformLocation(program, name);
          if (Array.isArray(value)) gl.uniform1fv(at, value);
          else gl.uniform1f(at, value);
        }
        gl.viewport(0, 0, size[0], size[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return {
          webp: canvas.toDataURL("image/webp", quality),
          png: canvas.toDataURL("image/png"),
        };
      } catch (error) {
        return { error: String(error) };
      }
    },
    {
      shader: sprite.shader,
      size: sprite.size,
      uniforms: sprite.uniforms,
      quality: sprite.quality,
    },
  );
  if (error) throw new Error(`${sprite.path}: ${error}`);
  if (!webp.startsWith("data:image/webp")) throw new Error("this browser cannot encode WebP");
  const bytes = Buffer.from(webp.split(",")[1], "base64");
  writeFileSync(new URL(sprite.path.slice(1), publicRoot), bytes);
  if (previewDir) {
    const name = sprite.path.slice(1).replace(/\.webp$/, ".png");
    writeFileSync(`${previewDir}/${name}`, Buffer.from(png.split(",")[1], "base64"));
  }
  console.log(`${sprite.path}: ${sprite.size.join("x")}, ${bytes.length} bytes`);
}
await browser.close();
