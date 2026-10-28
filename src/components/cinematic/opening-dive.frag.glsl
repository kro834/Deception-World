// ENTER THE WORLD: the dive. One full-screen pass on an opaque canvas: the
// title's framing (the atmosphere still, its light and the prism logo), a
// camera plunge into the logo's ring with depth (the background drifts
// slower than the logo), a spectral zoom blur, two layers of light trails and
// a darkening tunnel, the world opening through the ring as an iris, one
// breakthrough swell, then the world key visual decelerating forwards and
// settling in Mirage ice at the framing the World page opens on. Appended to
// opening-noise.glsl (precision, noise, BLUR_TAPS).

uniform vec2 uRes;          // drawing-buffer size (px)
uniform float uTime;        // seconds since the dive started drawing
uniform float uZoom;        // title camera: 1 = the title's framing, < 1 = closer
uniform float uBlur;        // radial zoom-blur length (0..0.5)
uniform float uDive;        // 0..1 light trails and tunnel
uniform float uWarp;        // 0..1 breakthrough light (one swell)
uniform float uChroma;      // 0..1 spectral split of the zoom blur (peak speed)
uniform float uIris;        // 0..1 the world seen through the ring, growing to fill
uniform float uCenter;      // 0..1 the camera axis: the ring, then the frame's centre
uniform float uWorld;       // 0 = the title, 1 = past the ring (the world only)
uniform float uWorldZoom;   // world camera: 1 = cover framing, < 1 = closer
uniform float uLand;        // 0..1 the World page's own grade (dark ink, left scrim)
uniform float uBars;        // 1..0 the title's letterbox bars opening
uniform float uIce;         // 0..1 Mirage ice grade (only rises)
uniform vec4 uLogo;         // the logo box in screen UV (x, y, w, h), y up
uniform vec2 uFocus;        // the logo's ring in screen UV: the camera dives into it
uniform vec2 uAtmoScale;    // cover-fit factors for the atmosphere still
uniform vec2 uWorldScale;   // cover-fit factors for the world key visual
uniform float uBarH;        // letterbox bar height in screen UV
uniform sampler2D uLogoTex; // the prism logo, premultiplied
uniform sampler2D uAtmo;    // the atmosphere still
uniform sampler2D uWorldTex; // the world key visual

const vec3 INK = vec3(0.016, 0.031, 0.059);
const vec3 ICE = vec3(0.56, 0.92, 1.0);
const vec3 FOREST = vec3(0.25, 0.65, 0.32);

// The title as it stands when ENTER THE WORLD is pressed. The logo is read
// at `sl`, the background (atmosphere, light, vignette) at `sa`: two depths.
vec3 titleScene(vec2 sl, vec2 sa, float aspect) {
  vec2 a = (sa - 0.5) * uAtmoScale + 0.5;
  // .cine-atmosphere: brightness 0.4 at opacity 0.42 over black.
  vec3 col = sampleTop(uAtmo, a).rgb * 0.17;
  vec2 k = vec2(aspect, 1.0);
  // .cine-light-field at 0.52: blue to the left, gold to the right, ice in the middle.
  col += vec3(0.29, 0.54, 0.84) * 0.1 * fall(0.34, 0.0, length((sa - vec2(0.34, 0.52)) * k));
  col += vec3(0.83, 0.69, 0.34) * 0.07 * fall(0.3, 0.0, length((sa - vec2(0.68, 0.48)) * k));
  col += vec3(0.62, 0.83, 1.0) * 0.045 * fall(0.6, 0.0, length((sa - 0.5) * k));
  // .cine-vignette.
  float v = length((sa - 0.5) * 2.0);
  col *= 1.0 - smoothstep(0.55, 1.45, v) * 0.85;
  vec2 l = (sl - uLogo.xy) / uLogo.zw;
  vec4 logo = sampleTop(uLogoTex, l);
  return col * (1.0 - logo.a) + logo.rgb;
}

// The world key visual, centred on `w` = 0.5; past its edges it fades to ink
// (it is smaller than the frame while it is still far, behind the ring).
vec3 worldScene(vec2 w) {
  vec2 t = (w - 0.5) * uWorldScale * uWorldZoom + 0.5;
  vec2 o = max(abs(t - 0.5) - 0.5, 0.0);
  float inside = fall(0.05, 0.0, length(o));
  return mix(INK, sampleTop(uWorldTex, t).rgb, inside);
}

// One layer of light trails streaming out of the axis.
float trail(float ang, float r, float lanes, float seed, float speed, float density, float len) {
  float lane = floor(ang * lanes);
  float rnd = hash11(lane + seed);
  float across = abs(fract(ang * lanes) - 0.5) * 2.0;
  float seg = fract(log(r + 0.02) * 1.3 - uTime * speed * (0.75 + rnd * 1.3) + rnd * 9.0);
  float s = step(1.0 - density, rnd) * smoothstep(0.0, 0.06, seg) * fall(len, 0.06, seg);
  return s * pow(1.0 - across, 3.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  // The camera axis: the ring, drifting to the frame's centre past it.
  vec2 focus = mix(uFocus, vec2(0.5), uCenter);
  vec2 p = (uv - focus) * vec2(aspect, 1.0);
  float r = length(p);

  // ---- The iris: the world through the ring, opening until it fills the frame.
  float iris = 0.0;
  float rim = 0.0;
  if (uWorld > 0.5) {
    iris = 1.0;
  } else if (uIris > 0.001) {
    float R = uIris * uIris * 2.1;
    iris = fall(R, R * 0.78, r);
    float d = (r - R * 0.92) / (0.02 + R * 0.06);
    rim = exp(-d * d) * (1.0 - uIris * 0.5);
  }

  // ---- Camera: zoom about the axis (the logo near, the background far),
  // with a radial zoom blur whose taps split red outwards and blue inwards
  // at peak speed: a chromatic warp, at no extra samples.
  vec2 sl = focus + (uv - focus) * uZoom;
  vec2 sa = focus + (uv - focus) * pow(uZoom, 0.42);
  vec2 sw = vec2(0.5) + (uv - focus);
  vec3 col = vec3(0.0);
  bool needTitle = iris < 0.999;
  bool needWorld = iris > 0.001;
  if (uBlur > 0.002 || uChroma > 0.002) {
    vec3 acc = vec3(0.0);
    vec3 wsum = vec3(0.0);
    for (int i = 0; i < BLUR_TAPS; i++) {
      float k = float(i) / float(BLUR_TAPS);
      float f = 1.0 - uBlur * k;
      vec3 w = mix(vec3(1.0), vec3(1.0 - k, 1.0 - abs(2.0 * k - 1.0), k) + 0.04, uChroma * 0.75);
      vec3 c = vec3(0.0);
      if (needTitle) c += titleScene(focus + (sl - focus) * f, focus + (sa - focus) * f, aspect) * (1.0 - iris);
      // The world is far: its streaks are shorter than the near title's.
      if (needWorld) c += worldScene(vec2(0.5) + (sw - 0.5) * (1.0 - uBlur * 0.5 * k)) * iris;
      acc += c * w;
      wsum += w;
    }
    col = acc / wsum;
  } else {
    if (needTitle) col += titleScene(sl, sa, aspect) * (1.0 - iris);
    if (needWorld) col += worldScene(sw) * iris;
  }

  // ---- The lens: as the camera starts to move, the logo's highlights
  // stretch into anamorphic ice streaks (gone before the tunnel).
  if (uWorld < 0.5 && uDive > 0.001) {
    float ana = smoothstep(0.02, 0.22, uDive) * (1.0 - smoothstep(0.5, 0.85, uDive));
    if (ana > 0.001 && iris < 0.999) {
      vec2 dx = vec2(0.016, 0.0);
      vec3 acc = max(titleScene(sl + dx, sa, aspect) - 0.62, 0.0) * 0.5
               + max(titleScene(sl - dx, sa, aspect) - 0.62, 0.0) * 0.5
               + max(titleScene(sl + dx * 2.0, sa, aspect) - 0.62, 0.0) * 0.3
               + max(titleScene(sl - dx * 2.0, sa, aspect) - 0.62, 0.0) * 0.3;
      col += acc * vec3(0.5, 0.88, 1.0) * ana * 0.6;
    }
  }

  // ---- Grade: neutral at frame 0 (it continues the DOM title), Mirage ice after.
  col *= mix(vec3(1.0), vec3(0.82, 0.97, 1.08), uIce);

  // ---- The tunnel and the light trails: near trails are long, fast and
  // bright, far ones short and dim, so the speed has depth.
  if (uDive > 0.001) {
    float ang = atan(p.y, p.x) / 6.2831853 + 0.5;
    float len = mix(0.22, 0.78, uDive);
    float gate = smoothstep(0.0, 0.3, uDive);
    float near = trail(ang, r, 110.0, 1.7, 1.5 + uDive * 2.8, 0.5, len) * smoothstep(0.08, 0.55, r);
    float far = trail(ang, r, 54.0, 4.3, 0.6 + uDive * 1.1, 0.62, len * 0.6)
              * smoothstep(0.02, 0.24, r) * fall(0.95, 0.3, r);
    // Deep in the ring the title falls dark (the tunnel), so the magnified
    // glyphs never flare; only the trails carry the speed.
    // The world arriving through it is held a little darker too, so the
    // breakthrough reads as light at the end of a tunnel, not a flash.
    float dim = mix(1.0, mix(0.4, 0.62, iris), smoothstep(0.25, 1.0, uDive));
    col *= dim * mix(1.0, fall(1.2, 0.18, r), uDive * 0.7 * (1.0 - iris));
    vec3 nearCol = mix(vec3(0.82, 0.97, 1.0), ICE, smoothstep(0.3, 0.9, r));
    vec3 farCol = mix(ICE, FOREST, 0.45);
    col += (nearCol * near * 0.95 + farCol * far * 0.5) * gate;
  }

  // ---- The ring's rim as the iris opens: ice, split red out and blue in.
  if (rim > 0.001) {
    col += vec3(0.7, 0.95, 1.0) * rim * 0.55 + vec3(0.18, -0.04, -0.1) * rim * uChroma;
  }

  // ---- Breakthrough: one slow forest-green swell at the mouth of the tunnel,
  // paired with a Mirage ice corona as the world opens, never a white-out.
  col += FOREST * uWarp * 0.16 * fall(0.7, 0.0, r)
       + ICE * uWarp * 0.16 * smoothstep(0.18, 0.46, r) * fall(0.95, 0.46, r);

  // ---- Landing: the World page's hero (key visual at half strength on dark
  // blue, a scrim heavy on the left and at the bottom). The grade is read
  // where the landing canvas will show it, so the compositor's settle after
  // glEnd continues this picture exactly.
  if (uLand > 0.001) {
    vec2 g = vec2(0.5) + (uv - 0.5) * uWorldZoom;
    vec3 hud = mix(vec3(0.063, 0.106, 0.161), vec3(0.027, 0.047, 0.078), clamp((g.x + (1.0 - g.y)) * 0.6, 0.0, 1.0));
    vec3 hero = mix(hud, col, 0.5);
    float scrimX = g.x < 0.34 ? mix(0.96, 0.84, g.x / 0.34)
                 : g.x < 0.66 ? mix(0.84, 0.26, (g.x - 0.34) / 0.32)
                 : mix(0.26, 0.58, (g.x - 0.66) / 0.34);
    hero = mix(hero, INK, clamp(scrimX, 0.0, 1.0));
    hero = mix(hero, INK, fall(0.34, 0.0, g.y));
    hero = mix(hero, INK, smoothstep(0.66, 1.0, g.y) * 0.48);
    col = mix(col, hero, uLand);
  }

  // ---- The title's letterbox bars, opening as the camera moves.
  float bar = uBarH * uBars;
  col *= step(bar, uv.y) * step(uv.y, 1.0 - bar);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
