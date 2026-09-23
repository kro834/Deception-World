// ENTER THE WORLD: the dive. One full-screen pass on an opaque canvas: the
// title's framing (the atmosphere still, its light and the prism logo), a
// camera plunge into the logo's ring with zoom blur, speed lines and a
// darkening tunnel, one amber breakthrough, then the world key visual,
// settling in Mirage ice at the framing the World page opens on. Appended to
// opening-noise.glsl (precision, noise, BLUR_TAPS).

uniform vec2 uRes;          // drawing-buffer size (px)
uniform float uTime;        // seconds since the dive started drawing
uniform float uZoom;        // title camera: 1 = the title's framing, < 1 = closer
uniform float uBlur;        // radial zoom-blur length (0..0.5)
uniform float uDive;        // 0..1 speed lines and tunnel
uniform float uWarp;        // 0..1 amber breakthrough light (one swell)
uniform float uWorld;       // 0 = the title, 1 = the world (one cut, inside the bloom)
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

// The title as it stands when ENTER THE WORLD is pressed.
vec3 titleScene(vec2 s, float aspect) {
  vec2 a = (s - 0.5) * uAtmoScale + 0.5;
  // .cine-atmosphere: brightness 0.4 at opacity 0.42 over black.
  vec3 col = sampleTop(uAtmo, a).rgb * 0.17;
  vec2 k = vec2(aspect, 1.0);
  // .cine-light-field at 0.52: blue to the left, gold to the right, ice in the middle.
  col += vec3(0.29, 0.54, 0.84) * 0.1 * fall(0.34, 0.0, length((s - vec2(0.34, 0.52)) * k));
  col += vec3(0.83, 0.69, 0.34) * 0.07 * fall(0.3, 0.0, length((s - vec2(0.68, 0.48)) * k));
  col += vec3(0.62, 0.83, 1.0) * 0.045 * fall(0.6, 0.0, length((s - 0.5) * k));
  // .cine-vignette.
  float v = length((s - 0.5) * 2.0);
  col *= 1.0 - smoothstep(0.55, 1.45, v) * 0.85;
  vec2 l = (s - uLogo.xy) / uLogo.zw;
  vec4 logo = sampleTop(uLogoTex, l);
  return col * (1.0 - logo.a) + logo.rgb;
}

vec3 worldScene(vec2 s) {
  return sampleTop(uWorldTex, (s - 0.5) * uWorldScale * uWorldZoom + vec2(0.5, 0.5)).rgb;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  // Screen point the camera closes in on: the ring, then the world's centre.
  vec2 focus = mix(uFocus, vec2(0.5, 0.52), uWorld);
  vec2 p = (uv - focus) * vec2(aspect, 1.0);
  float r = length(p);

  // ---- Camera: zoom about the focus, with a radial zoom blur towards it.
  vec3 col = vec3(0.0);
  float zoom = mix(uZoom, 1.0, uWorld);
  vec2 s = focus + (uv - focus) * zoom;
  if (uBlur > 0.002) {
    for (int i = 0; i < BLUR_TAPS; i++) {
      float k = float(i) / float(BLUR_TAPS);
      vec2 si = focus + (s - focus) * (1.0 - uBlur * k);
      col += uWorld > 0.5 ? worldScene(si) : titleScene(si, aspect);
    }
    col /= float(BLUR_TAPS);
  } else {
    col = uWorld > 0.5 ? worldScene(s) : titleScene(s, aspect);
  }

  // ---- Grade: neutral at frame 0 (it continues the DOM title), Mirage ice after.
  col *= mix(vec3(1.0), vec3(0.82, 0.97, 1.08), uIce);

  // ---- Speed lines and the tunnel.
  if (uDive > 0.001) {
    float ang = atan(p.y, p.x) / 6.2831853 + 0.5;
    float lanes = 120.0;
    float lane = floor(ang * lanes);
    float rnd = hash11(lane + 1.7);
    float across = abs(fract(ang * lanes) - 0.5) * 2.0;
    float seg = fract(log(r + 0.02) * 1.4 - uTime * (0.9 + rnd * 1.4) * (0.7 + uDive * 1.9) + rnd * 9.0);
    float streak = step(0.5, rnd) * smoothstep(0.0, 0.12, seg) * fall(0.7, 0.12, seg);
    streak *= pow(1.0 - across, 3.0) * smoothstep(0.05, 0.5, r) * smoothstep(0.0, 0.35, uDive);
    vec3 lineCol = mix(mix(vec3(0.48, 0.91, 1.0), vec3(0.94, 0.81, 0.53), step(0.85, rnd)),
                       vec3(1.0, 0.72, 0.42), smoothstep(0.65, 1.0, uDive));
    // Deep in the ring the scene falls dark (the tunnel), so the magnified
    // glyphs never flare; only the streaks carry the speed.
    float dim = mix(1.0, 0.42, smoothstep(0.25, 1.0, uDive) * (1.0 - uWorld));
    col *= dim * mix(1.0, fall(1.2, 0.18, r), uDive * 0.72);
    col += lineCol * streak * 0.95;
  }

  // ---- Breakthrough: one slow amber swell at the mouth of the tunnel, never a white-out.
  col += vec3(1.0, 0.76, 0.5) * uWarp * 0.36 * fall(0.8, 0.0, r);

  // ---- Landing: the World page's hero (key visual at half strength on dark
  // blue, a scrim heavy on the left and at the bottom).
  if (uLand > 0.001) {
    vec3 ink = vec3(0.016, 0.031, 0.059);
    vec3 hud = mix(vec3(0.063, 0.106, 0.161), vec3(0.027, 0.047, 0.078), clamp((uv.x + (1.0 - uv.y)) * 0.6, 0.0, 1.0));
    vec3 hero = mix(hud, col, 0.5);
    float scrimX = uv.x < 0.34 ? mix(0.96, 0.84, uv.x / 0.34)
                 : uv.x < 0.66 ? mix(0.84, 0.26, (uv.x - 0.34) / 0.32)
                 : mix(0.26, 0.58, (uv.x - 0.66) / 0.34);
    hero = mix(hero, ink, scrimX);
    hero = mix(hero, ink, fall(0.34, 0.0, uv.y));
    hero = mix(hero, ink, smoothstep(0.66, 1.0, uv.y) * 0.48);
    col = mix(col, hero, uLand);
  }

  // ---- The title's letterbox bars, opening as the camera moves.
  float bar = uBarH * uBars;
  col *= step(bar, uv.y) * step(uv.y, 1.0 - bar);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
