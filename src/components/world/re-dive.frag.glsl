// RE DIVE…?: from RISING THE WORLD's end still into the burned World. One
// full-screen pass on an opaque canvas: the end still (the Rexonance art at its
// grade, framed like .rw-end), a camera plunge into the art's core with zoom
// blur, ember speed lines and a darkening tunnel, one amber swell, then the
// ground of the RE DIVE section (char, its burning lip at the top, ember
// light), framed like the section just under the header. Appended to
// opening-noise.glsl (precision, fall(), noise, emberLayer(), BLUR_TAPS).
// Screen and image coordinates here run y-down, like CSS, and the uploads are
// top-down (t = 0 is an image's top row), so the textures are read with
// texture2D() as is (sampleTop() takes y-up coordinates).

uniform vec2 uRes;        // drawing-buffer size (px)
uniform float uTime;      // seconds since the transition started
uniform vec4 uArtMap;     // screen (y-down) -> art UV: art = s * xy + zw
uniform vec4 uFeather;    // landscape framing: x feather inner, y feather outer (half widths, screen UV), z top fade (screen UV), w on/off
uniform vec2 uFocus;      // the art's core on screen (y-down): the camera dives into it
uniform float uZoom;      // 1 = the end still's framing, < 1 = closer
uniform float uBlur;      // radial zoom-blur length (0..0.5)
uniform float uDive;      // 0..1 speed lines and tunnel
uniform float uLift;      // 0..1 the art comes back up from its end-still dimming
uniform float uWarp;      // 0..1 one amber swell at the mouth of the tunnel
uniform float uLand;      // 0..1 the section's ground
uniform vec2 uCharTile;   // char tile size in drawing-buffer px (x, y)
uniform vec3 uEdge;       // burning lip across the section's top: width, height (px), and the share of its height where the tiled char takes over
uniform float uGroundTop; // where the section's top lands (px, y-down): just under the header
uniform sampler2D uArt;   // the Rexonance art (the end still)
uniform sampler2D uChar;  // the char tile (RISING's calm tier)
uniform sampler2D uEdgeTex; // the burn-edge strip (premultiplied)

const vec3 VOID = vec3(0.0196, 0.0078, 0.0118);
const vec3 GATE = vec3(0.043, 0.012, 0.012);   // the gate's floor, above the section
const vec3 GROUND = vec3(0.039, 0.012, 0.016); // the section's ground (#0a0304)

// The end still as .rw-end draws it: void with an ember floor and a vignette,
// the art at 0.56 (feathered at the sides on landscape screens), and the warm
// ::after veil at 0.2.
vec3 endStill(vec2 s, float lift) {
  vec3 bg = VOID;
  float fromBottom = 1.0 - s.y;
  vec4 floorTint = fromBottom < 0.3
    ? mix(vec4(0.47, 0.086, 0.031, 0.2), vec4(0.235, 0.031, 0.016, 0.06), fromBottom / 0.3)
    : mix(vec4(0.235, 0.031, 0.016, 0.06), vec4(0.0), clamp((fromBottom - 0.3) / 0.25, 0.0, 1.0));
  bg = mix(bg, floorTint.rgb, floorTint.a);
  float rr = length((s - vec2(0.5, 0.42)) / vec2(0.9, 0.7));
  bg = mix(bg, vec3(0.0), 0.78 * smoothstep(0.36, 1.0, rr));

  vec2 a = s * uArtMap.xy + uArtMap.zw;
  float inside = step(0.0, a.x) * step(a.x, 1.0) * step(0.0, a.y) * step(a.y, 1.0);
  float mask = 1.0;
  if (uFeather.w > 0.5) {
    float dx = abs(s.x - 0.5);
    mask = fall(uFeather.y, uFeather.x, dx) * smoothstep(0.0, uFeather.z, s.y);
  }
  vec3 art = texture2D(uArt, clamp(a, 0.0, 1.0)).rgb;
  float alpha = mix(0.56, 0.9, lift) * inside * mask;
  vec3 col = mix(bg, art, alpha);
  return mix(col, vec3(0.329, 0.0706, 0.0235), 0.2 * (1.0 - lift * 0.6));
}

// The RE DIVE section's ground as the page shows it at landing, its top just
// under the header (styles-world-re-dive.css): the burning lip across the top,
// the tiled char from under the lip's own char down, and the ember light over
// both (.re-dive-embers' first gradient, 157 x 55 svh at the top, at 0.9).
vec3 ground(vec2 s, vec2 px, float aspect) {
  float gy = px.y - uGroundTop;
  float charTop = uEdge.y * uEdge.z;
  vec3 col = gy < 0.0 ? GATE : GROUND;
  if (gy >= charTop) col = texture2D(uChar, fract(vec2(px.x, gy - charTop) / uCharTile)).rgb;
  vec2 e = vec2(px.x / uEdge.x, gy / uEdge.y);
  if (e.y >= 0.0 && e.y <= 1.0) {
    vec4 edge = texture2D(uEdgeTex, e);
    col = col * (1.0 - edge.a) + edge.rgb;
  }
  if (gy >= 0.0) {
    vec2 d = vec2((s.x - 0.5) * aspect / 1.57, gy / uRes.y / 0.55);
    col = mix(col, vec3(0.42, 0.09, 0.02), 0.144 * max(0.0, 1.0 - length(d)));
  }
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 s = vec2(uv.x, 1.0 - uv.y);
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float aspect = uRes.x / uRes.y;
  vec2 p = (s - uFocus) * vec2(aspect, 1.0);
  float r = length(p);

  // ---- Camera: zoom about the core, a radial zoom blur towards it. The taps
  // are jittered per pixel and per frame, so the blur grains instead of ghosting.
  vec2 z = uFocus + (s - uFocus) * uZoom;
  vec3 col = vec3(0.0);
  if (uBlur > 0.002) {
    float jitter = hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 97.0);
    for (int i = 0; i < BLUR_TAPS; i++) {
      float k = (float(i) + jitter) / float(BLUR_TAPS);
      col += endStill(uFocus + (z - uFocus) * (1.0 - uBlur * k), uLift);
    }
    col /= float(BLUR_TAPS);
  } else {
    col = endStill(z, uLift);
  }

  // ---- Heat: the grade only warms as the camera goes in.
  col *= mix(vec3(1.0), vec3(1.12, 0.78, 0.62), uDive * 0.7);

  // ---- Ember speed lines and the tunnel.
  if (uDive > 0.001) {
    float ang = atan(p.y, p.x) / 6.2831853 + 0.5;
    float lanes = 110.0;
    float lane = floor(ang * lanes);
    float rnd = hash11(lane + 3.3);
    float across = abs(fract(ang * lanes) - 0.5) * 2.0;
    float seg = fract(log(r + 0.02) * 1.35 - uTime * (0.8 + rnd * 1.3) * (0.7 + uDive * 1.8) + rnd * 9.0);
    float streak = step(0.52, rnd) * smoothstep(0.0, 0.12, seg) * fall(0.7, 0.12, seg);
    streak *= pow(1.0 - across, 3.0) * smoothstep(0.05, 0.5, r) * smoothstep(0.0, 0.35, uDive);
    vec3 lineCol = mix(vec3(1.0, 0.62, 0.3), vec3(1.0, 0.3, 0.09), step(0.8, rnd));
    col *= mix(1.0, 0.45, smoothstep(0.3, 1.0, uDive)) * mix(1.0, fall(1.2, 0.2, r), uDive * 0.7);
    col += lineCol * streak * 0.85;
  }

  // ---- One slow amber swell at the mouth of the tunnel; blacks stay black.
  col += vec3(1.0, 0.6, 0.3) * uWarp * 0.32 * fall(0.85, 0.0, r);

  // ---- Landing on the section's ground.
  if (uLand > 0.001) col = mix(col, ground(s, px, aspect), uLand);

  // ---- Sparks rise through the dive and over the ground.
  vec2 q = (s - 0.5) * vec2(aspect, 1.0);
  float sparks = emberLayer(q, uTime, 17.0, 0.55, 2.0) + emberLayer(q, uTime, 10.0, 0.36, 6.0) * 0.8;
  col += vec3(1.0, 0.46, 0.13) * sparks * (uDive * 0.9 + uLand * 0.8);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
