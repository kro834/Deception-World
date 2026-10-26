// Dream chapter GPU layer. Loaded only after src/lib/dream-gpu/dream-gpu-tier.ts
// has found WebGPU (and motion allowed), so none of this is in the startup bundle.
//
//   startLamplightOverlay(canvas, { getDeskRect })  Tier A + B: a full-viewport,
//     pointer-events:none canvas of lamp dust, a slow gold sweep, the pointer's
//     lantern and a running light around the programme desk.
//   startDeskStage(canvas, element)                   Tier A: the real desk DOM
//     (child of a <canvas layoutsubtree>) is copied into a texture with
//     GPUQueue.drawElementImageToTexture and redrawn through bloom, chromatic
//     fringe, scanlines, a lens warp and click glitches. The DOM keeps the hit
//     testing and the accessibility tree; geometry is synced every frame.
//
// Photosensitivity: no full-area flash; the click is a film-gate slip and a paper
// tear (geometry moves, luminance stays put); vermilion is only a slow ambient ramp.

const COMMON_WGSL = /* wgsl */ `
struct U {
  res: vec2f, time: f32, dpr: f32,
  mouse: vec2f, click: f32, energy: f32,
  rect: vec4f,
  scroll: f32, small: f32, seed: f32, pad1: f32,
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
fn hash21(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn hash22(p: vec2f) -> vec2f {
  return fract(sin(vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)))) * 43758.5453);
}
const GOLD = vec3f(1.0, .80, .47);
const LAMP = vec3f(1.0, .63, .34);
const VERMILION = vec3f(.86, .30, .20);
const CREAM = vec3f(1.0, .93, .80);
// One depth layer of lamp dust. Cells of size s; motes rise, sway and twinkle.
// rad = mote radius (cell units), soft = edge softness (0 = pin-sharp far motes,
// large = out-of-focus bokeh discs near the lens).
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
`;

const OVERLAY_WGSL =
  COMMON_WGSL +
  /* wgsl */ `
fn sdBox(p: vec2f, b: vec2f) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec2f(0.))) + min(max(d.x, d.y), 0.);
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
// A stage lamp: a soft wedge of light from a point just off-screen, with a gobo
// breakup so it reads as a real beam and not a gradient.
fn beam(uv: vec2f, src: vec2f, theta: f32, width: f32, t: f32) -> f32 {
  let asp = u.res.x / u.res.y;
  let rel = (uv - src) * vec2f(asp, 1.);
  let ang = atan2(rel.y, rel.x);
  let w = exp(-pow((ang - theta) / width, 2.));
  let fall = exp(-length(rel) * 1.1);
  let gobo = .78 + .22 * sin(ang * 46. + t * .35) * sin(length(rel) * 9. - t * .5);
  return w * fall * gobo;
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let px = in.uv * u.res;
  let t = u.time;
  var c = vec3f(0.);
  var a = 0.;
  // --- lamp dust, three depths with parallax from the pointer ---------------
  let par = (u.mouse - .5) * u.dpr;
  let d1 = dust(px + par * vec2f(6., 3.), 36. * u.dpr, .045, t, 1., .055, .025);
  let d2 = dust(px + par * vec2f(20., 9.), 66. * u.dpr, .03, t, 2., .06, .04);
  var d3 = 0.;
  if (u.small < .5) { d3 = dust(px + par * vec2f(48., 22.), 128. * u.dpr, .02, t, 3., .11, .09); }
  // the desk's own lamp keeps the paper mostly clear of motes
  var deskIn = 0.;
  if (u.rect.z > 0.) {
    let dIn = sdBox(px - u.rect.xy - u.rect.zw * .5, u.rect.zw * .5);
    deskIn = smoothstep(20. * u.dpr, -20. * u.dpr, dIn) * .6;
  }
  let dk = 1. - deskIn;
  c += (CREAM * d1 * .6 + GOLD * d2 * .55 + LAMP * d3 * .38) * dk;
  a += (d1 * .5 + d2 * .42 + d3 * .3) * dk;

  // --- stage lamps: a slow swinging key light from above-left, a vermilion
  //     fill from above-right. Low amplitude, wide, never a flash. ---------
  let key = beam(in.uv, vec2f(-.08, -.22), 1.05 + .22 * sin(t * .09), .13, t) * .085;
  let fill = beam(in.uv, vec2f(1.1, -.3), 2.25 + .18 * sin(t * .07 + 2.), .18, t) * .045;
  c += GOLD * key + mix(VERMILION, LAMP, .5 + .5 * sin(t * .05)) * fill;
  a += key * .5 + fill * .4;
  // a warm vermilion breath pooling at the floor
  let floorAmb = pow(in.uv.y, 3.) * (.012 + .008 * sin(t * .11));
  c += VERMILION * floorAmb;
  a += floorAmb;

  // --- the pointer's lantern ------------------------------------------------
  let m = u.mouse * u.res;
  let ld = length(px - m) / (240. * u.dpr);
  let lantern = exp(-ld * ld * 2.) * (.09 + .07 * u.energy) * (.97 + .03 * sin(t * 7.3));
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

  // --- the programme desk: a brass frame with two comets of light running
  //     round it, corner glints, and a soft halo ------------------------------
  if (u.rect.z > 0.) {
    let h = u.rect.zw * .5;
    let center = u.rect.xy + h;
    let p = px - center;
    let d = sdBox(p, h);
    let s = perim(p, h);
    let f1 = fract(s - t * .055);
    let f2 = fract(-s - t * .035 + .5);
    let c1 = exp(-f1 * 16.) * smoothstep(0., .02, f1);
    let c2 = exp(-f2 * 22.) * smoothstep(0., .015, f2) * .55;
    let run = c1 + c2;
    let line = exp(-abs(d) / (1.6 * u.dpr));
    let soft = exp(-abs(d) / (9. * u.dpr));
    let halo = exp(-max(d, 0.) / (34. * u.dpr)) * step(0., d);
    let e = line * (.08 + run * .7) + soft * run * .25 + halo * (.03 + run * .09);
    c += mix(GOLD, CREAM, run * .5) * e;
    a += e * .7;
    // corner glints: four small brass stars, slowly breathing out of phase
    let q = abs(p) - h;
    let cornerD = length(q);
    let star = exp(-cornerD / (3. * u.dpr)) + exp(-abs(q.x) / (1.2 * u.dpr)) * exp(-abs(q.y) / (14. * u.dpr)) * .5
             + exp(-abs(q.y) / (1.2 * u.dpr)) * exp(-abs(q.x) / (14. * u.dpr)) * .5;
    let phase = select(0., 1.6, p.x > 0.) + select(0., 3.1, p.y > 0.);
    let breathe = .55 + .45 * sin(t * .8 + phase);
    let glint = star * breathe * .5;
    c += CREAM * glint;
    a += glint * .6;
  }
  // film grain (very low)
  let g = hash21(floor(px / u.dpr) + fract(t * 23.) * 91.) - .5;
  c += vec3f(g * .012);
  a = clamp(a, 0., .6);
  return vec4f(c, a);
}
`;

const DESK_WGSL =
  COMMON_WGSL +
  /* wgsl */ `
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var dom: texture_2d<f32>;
fn tap(uv: vec2f) -> vec4f { return textureSampleLevel(dom, samp, uv, 0.); }
// Only saturated lamp-coloured light blooms (gold rails, seals, accents), not the paper.
fn bright(c: vec3f) -> vec3f {
  let sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  return c * smoothstep(.24, .5, sat) * smoothstep(.4, .8, max(c.r, c.g));
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  // The element sits at u.rect (device px) inside the canvas; its texture covers just that box.
  let luv = (in.pos.xy - u.rect.xy) / u.rect.zw;
  if (any(luv < vec2f(0.)) || any(luv > vec2f(1.))) { return vec4f(0.); }
  let t = u.time;
  let m = u.mouse;
  let pxs = u.dpr / u.rect.zw;   // one device pixel in local uv
  var uv = luv;
  // --- click: film-gate jitter + a paper tear. The gate slips a few pixels and
  //     settles in ~0.35s; the paper below a ragged seam slides sideways and a
  //     shadow falls under the lip. Luminance never jumps. ----------------------
  let g = clamp(u.click, 0., 1.);
  let jit = pow(g, 7.);
  uv.y += jit * sin(g * 110.) * 9. * pxs.y;
  uv.x += jit * sin(g * 73. + 1.) * 2.5 * pxs.x;
  let seamY = .28 + .44 * u.seed;
  let rag = (hash21(vec2f(floor(luv.x * 90.), u.seed * 7.)) - .5) * 4. * pxs.y;
  let seam = seamY + rag;
  let below = step(seam, luv.y);
  let tearDir = select(-1., 1., u.seed > .5);
  uv.x += below * jit * tearDir * 14. * pxs.x;
  let lip = exp(-(luv.y - seam) / (7. * pxs.y)) * below * jit;
  // --- lens: a gentle lamp bulge under the pointer (hit testing stays aligned) --
  let dm = uv - m;
  let dpx = dm * u.rect.zw;
  let pull = exp(-dot(dpx, dpx) / (120000. * u.dpr * u.dpr)) * (.002 + .004 * u.energy);
  uv -= dm * pull * 6.;
  // --- chromatic fringe: faint at the edges, a brief flare at the tear --------
  // (two printing plates slipping, warm and cool, rather than an RGB split)
  let ca = (length(luv - .5) * .45 + jit * 1.4 + lip * 1.2) * 1.3;
  let dir = normalize(luv - .5 + vec2f(1e-4));
  let cr = tap(uv + dir * ca * pxs);
  let cg = tap(uv + dir * ca * pxs * .35);
  let cb = tap(uv - dir * ca * pxs);
  var col = vec4f(cr.r, cg.g, cb.b, cg.a);
  // --- bloom: two rings of 12 taps on the bright part, plus a short
  //     anamorphic streak so brass rails and seals catch the lamp ----------------
  var bloom = vec3f(0.);
  let br = 8. * pxs;
  for (var i = 0; i < 12; i++) {
    let an = f32(i) * .5236 + t * .15;
    let o = vec2f(cos(an), sin(an));
    bloom += bright(tap(luv + o * br).rgb) + bright(tap(luv + o * br * 2.8).rgb) * .55;
  }
  var streak = vec3f(0.);
  for (var k = 1; k <= 3; k++) {
    let ox = vec2f(f32(k) * 9. * pxs.x, 0.);
    streak += (bright(tap(luv + ox).rgb) + bright(tap(luv - ox).rgb)) / f32(k);
  }
  bloom = bloom * (.055 + .035 * u.energy) * vec3f(1., .88, .66) + streak * .03 * GOLD;
  // --- the paper: a faint weave, a slow projector breath, a gold sheen that
  //     crosses the desk every ~9s like a lamp swung past it --------------------
  let px = in.pos.xy;
  let weave = .982 + .018 * sin(px.y * 3.14159 / (1.5 * u.dpr));
  let breath = 1. + .01 * sin(t * .6) ;
  let sheenPos = fract(t / 9.) * 1.9 - .45;
  let sheen = exp(-pow((luv.x * .6 + luv.y * .4 - sheenPos) * 7., 2.)) * .045 * col.a;
  var rgb = col.rgb * weave * breath + bloom + GOLD * sheen;
  // --- lamplight from the pointer: a warm pool, a hair of contrast ----------
  let ld = length((luv - m) * u.rect.zw) / (320. * u.dpr);
  let pool = exp(-ld * ld) * (.03 + .03 * u.energy) * col.a;
  rgb += LAMP * pool;
  // the tear's shadow
  rgb *= 1. - lip * .4;
  // --- warm vignette (the paper stays cream, the dark wood goes amber) --------
  let v = smoothstep(.9, .3, length((luv - .5) * vec2f(1., .8)));
  rgb *= mix(vec3f(.86, .80, .76), vec3f(1.), v);
  let a = max(col.a, clamp(max(bloom.r, bloom.g) * 1.2, 0., 1.));
  return vec4f(rgb, a);
}
`;

const UNIFORM_SIZE = 64;

async function getDevice() {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "low-power" });
  if (!adapter) throw new Error("no adapter");
  const device = await adapter.requestDevice();
  device.addEventListener?.("uncapturederror", (event) =>
    console.warn("dream-gpu", event.error?.message),
  );
  return device;
}

function makePointer() {
  const state = { x: 0.5, y: 0.35, tx: 0.5, ty: 0.35, cx: -1, cy: -1, click: 0, energy: 0, seed: 0.5 };
  const move = (e) => {
    state.tx = e.clientX / Math.max(1, innerWidth);
    state.ty = e.clientY / Math.max(1, innerHeight);
    state.cx = e.clientX;
    state.cy = e.clientY;
    state.energy = Math.min(1, state.energy + 0.06);
  };
  const down = (e) => {
    move(e);
    state.click = 1;
    state.seed = Math.random();
  };
  addEventListener("pointermove", move, { passive: true });
  addEventListener("pointerdown", down, { passive: true });
  return {
    state,
    step(dt) {
      const k = 1 - Math.exp(-dt * 6);
      state.x += (state.tx - state.x) * k;
      state.y += (state.ty - state.y) * k;
      state.click = Math.max(0, state.click - dt / 1.2);
      state.energy = Math.max(0, state.energy - dt * 0.6);
    },
    dispose() {
      removeEventListener("pointermove", move);
      removeEventListener("pointerdown", down);
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

const isSmall = () =>
  matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 700;

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
  const ubuf = device.createBuffer({
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: ubuf } }],
  });
  const u = new Float32Array(UNIFORM_SIZE / 4);
  const pointer = makePointer();
  const small = isSmall();
  // Phones and tablets render at ≤ 1 device px per CSS px (memory + fill rate).
  const scale = () => Math.min(devicePixelRatio || 1, small ? 1 : 1.5) * (small ? 0.75 : 1);
  let start = 0;
  const stopLoop = loop((t, dt) => {
    if (!start) start = t;
    pointer.step(dt);
    const s = scale();
    const w = Math.max(1, Math.round(innerWidth * s));
    const h = Math.max(1, Math.round(innerHeight * s));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const r = getDeskRect?.();
    u.set([
      w,
      h,
      t - start,
      s,
      pointer.state.x,
      pointer.state.y,
      pointer.state.click,
      pointer.state.energy,
    ]);
    if (r && r.bottom > -80 && r.top < innerHeight + 80) {
      u.set([r.left * s, r.top * s, r.width * s, r.height * s], 8);
    } else u.set([0, 0, 0, 0], 8);
    u.set([scrollY * s, small ? 1 : 0, pointer.state.seed, 0], 12);
    device.queue.writeBuffer(ubuf, 0, u);
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: ctx.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: [0, 0, 0, 0],
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.draw(3);
    pass.end();
    device.queue.submit([enc.finish()]);
  });
  return () => {
    stopLoop();
    pointer.dispose();
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
  const module = device.createShaderModule({ code: DESK_WGSL });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format }] },
  });
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  const ubuf = device.createBuffer({
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const u = new Float32Array(UNIFORM_SIZE / 4);
  let tex = null;
  let bind = null;
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
    tex?.destroy();
    tex = device.createTexture({
      size: [ew, eh],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: ubuf } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: tex.createView() },
      ],
    });
    captured = false;
  };

  const capture = () => {
    ensureTexture();
    try {
      queue.drawElementImageToTexture({ source: element }, { texture: tex });
      captured = true;
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
  let start = 0;
  let firstAt = 0;
  const stopLoop = loop((t, dt) => {
    if (!start) start = firstAt = t;
    pointer.step(dt);
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
    u.set([
      canvas.width,
      canvas.height,
      t - start,
      dpr,
      mx,
      my,
      pointer.state.click,
      pointer.state.energy,
    ]);
    const sx = canvas.width / Math.max(1, rect.width);
    u.set([(er.left - rect.left) * sx, (er.top - rect.top) * sx, er.width * sx, er.height * sx], 8);
    u.set([0, 0, pointer.state.seed, 0], 12);
    device.queue.writeBuffer(ubuf, 0, u);
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: ctx.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: [0, 0, 0, 0],
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.draw(3);
    pass.end();
    queue.submit([enc.finish()]);
  });
  return () => {
    stopLoop();
    pointer.dispose();
    ro.disconnect();
    canvas.removeEventListener("paint", onPaint);
    tex?.destroy();
    ubuf.destroy();
    device.destroy();
  };
}
