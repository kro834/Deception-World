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
// Photosensitivity: no full-area flash; the click glitch only shifts slices and
// fringes (luminance stays put), the vermilion stays a slow ambient ramp.

const COMMON_WGSL = /* wgsl */ `
struct U {
  res: vec2f, time: f32, dpr: f32,
  mouse: vec2f, click: f32, energy: f32,
  rect: vec4f,
  scroll: f32, small: f32, pad0: f32, pad1: f32,
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
const INDIGO = vec3f(.36, .42, .86);
// One layer of drifting lamp dust: cells of size s, motes rise and sway.
fn dust(px: vec2f, s: f32, speed: f32, t: f32, seed: f32) -> f32 {
  let q = px / s + vec2f(0., t * speed + u.scroll / s * (.15 + seed * .2));
  let id = floor(q);
  let f = fract(q) - .5;
  let r = hash22(id + seed * 17.);
  if (r.x > .38) { return 0.; }
  let off = (r - .5) * .6 + vec2f(sin(t * .6 + r.y * 6.28) * .12, 0.);
  let d = length(f - off);
  let tw = .55 + .45 * sin(t * (1.2 + r.y * 2.) + r.x * 40.);
  return smoothstep(.05 + r.y * .04, 0., d) * tw;
}
`;

const OVERLAY_WGSL =
  COMMON_WGSL +
  /* wgsl */ `
fn sdBox(p: vec2f, b: vec2f) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec2f(0.))) + min(max(d.x, d.y), 0.);
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  let px = in.uv * u.res;
  let t = u.time;
  var c = vec3f(0.);
  var a = 0.;
  // three parallax layers of dust (fewer on small screens)
  let d1 = dust(px, 46. * u.dpr, .05, t, 1.);
  let d2 = dust(px + vec2f((u.mouse.x - .5) * 18. * u.dpr, 0.), 82. * u.dpr, .03, t, 2.);
  var d3 = 0.;
  if (u.small < .5) { d3 = dust(px + vec2f((u.mouse.x - .5) * 36. * u.dpr, 0.), 140. * u.dpr, .018, t, 3.); }
  c += GOLD * (d1 * .55 + d2 * .75 + d3 * .9);
  a += d1 * .4 + d2 * .5 + d3 * .6;

  // the pointer's lantern
  let m = u.mouse * u.res;
  let ld = length(px - m) / (220. * u.dpr);
  let lantern = exp(-ld * ld * 2.2) * (.10 + .06 * u.energy);
  c += LAMP * lantern;
  a += lantern * .6;

  // click ripple: a thin gold ring, small area, fades in 1.2s
  let ck = clamp(u.click, 0., 1.);
  if (ck > 0.) {
    let ring = abs(length(px - m) - (1. - ck) * 260. * u.dpr);
    let rv = exp(-ring * ring / (18. * u.dpr * u.dpr)) * ck * .5;
    c += GOLD * rv;
    a += rv * .5;
  }

  // slow diagonal sweep of stage light, every ~11s; low amplitude, wide
  let sweepPos = fract(t / 11.) * 2.4 - .7;
  let diag = in.uv.x * .7 + in.uv.y * .3;
  let sw = exp(-pow((diag - sweepPos) * 9., 2.)) * .05;
  c += mix(GOLD, VERMILION, .5 + .5 * sin(t * .07)) * sw;
  a += sw * .5;

  // the programme desk: a running light round its frame + a faint scanline veil
  if (u.rect.z > 0.) {
    let center = u.rect.xy + u.rect.zw * .5;
    let p = px - center;
    let d = sdBox(p, u.rect.zw * .5);
    let edge = exp(-abs(d) / (3. * u.dpr)) ;
    let ang = atan2(p.y, p.x);
    let run = pow(.5 + .5 * cos(ang - t * .9), 18.) + pow(.5 + .5 * cos(ang + t * .6 + 2.), 24.) * .6;
    let halo = exp(-max(d, 0.) / (26. * u.dpr)) * step(0., d) * .06;
    let e = edge * (.10 + run * .55) + halo * (.6 + run);
    c += mix(GOLD, LAMP, run) * e;
    a += e * .7;
    if (d < 0.) {
      let sl = .5 + .5 * sin(px.y * 3.14159 / (2. * u.dpr) );
      let bar = exp(-pow(fract((px.y - u.rect.y) / u.rect.w - t * .08) * 8. - 4., 2.)) * .035;
      c += GOLD * (sl * .012 + bar);
      a += sl * .01 + bar * .4;
    }
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
  return c * smoothstep(.28, .55, sat) * smoothstep(.45, .8, max(c.r, c.g));
}
@fragment fn fs(in: VO) -> @location(0) vec4f {
  // The element sits at u.rect (device px) inside the canvas; its texture covers just that box.
  let luv = (in.pos.xy - u.rect.xy) / u.rect.zw;
  if (any(luv < vec2f(0.)) || any(luv > vec2f(1.))) { return vec4f(0.); }
  let t = u.time;
  var uv = luv;
  let m = u.mouse;
  // glitch: horizontal slices shift for ~0.45s after a click (no luminance flash)
  let g = clamp(u.click, 0., 1.);
  let gg = g * g * g;
  let row = floor(uv.y * 38.);
  let rh = hash21(vec2f(row, floor(t * 24.)));
  if (rh > .72) { uv.x += (rh - .86) * .06 * gg; }
  // lens warp toward the pointer (very small; hit testing stays visually aligned)
  let dm = uv - m;
  let pull = exp(-dot(dm * u.rect.zw, dm * u.rect.zw) / (90000. * u.dpr * u.dpr)) * (.0025 + .004 * u.energy);
  uv -= dm * pull * 6.;
  // chromatic fringe grows toward the edges and with the glitch
  let ca = (length(luv - .5) * .9 + gg * 3.) * 1.6 / u.rect.z;
  let dir = normalize(luv - .5 + vec2f(1e-4));
  let cr = tap(uv + dir * ca * u.dpr);
  let cg = tap(uv);
  let cb = tap(uv - dir * ca * u.dpr);
  var col = vec4f(cr.r, cg.g, cb.b, cg.a);
  // bloom: 12-tap ring of the bright part
  var bloom = vec3f(0.);
  let br = 7. * u.dpr / u.rect.zw;
  for (var i = 0; i < 12; i++) {
    let an = f32(i) * .5236 + t * .2;
    let o = vec2f(cos(an), sin(an));
    let s1 = tap(luv + o * br).rgb;
    let s2 = tap(luv + o * br * 2.6).rgb;
    bloom += bright(s1) + bright(s2) * .6;
  }
  bloom *= (.045 + .03 * u.energy) * vec3f(1., .86, .66);
  // scanlines + a slow rolling bar
  let px = in.pos.xy;
  let sl = .965 + .035 * sin(px.y * 3.14159 / (1.5 * u.dpr));
  let roll = 1. + exp(-pow(fract(luv.y - t * .06) * 10. - 5., 2.)) * .025;
  var rgb = col.rgb * sl * roll + bloom;
  // lamplight from the pointer: warm, never a flash
  let ld = length((luv - m) * u.rect.zw) / (300. * u.dpr);
  rgb += LAMP * exp(-ld * ld) * .03 * col.a;
  // edge vignette in the desk
  let v = smoothstep(.85, .25, length((luv - .5) * vec2f(1., .8)));
  rgb *= mix(.82, 1., v);
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
  const state = { x: 0.5, y: 0.35, tx: 0.5, ty: 0.35, cx: -1, cy: -1, click: 0, energy: 0 };
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
    u.set([scrollY * s, small ? 1 : 0, 0, 0], 12);
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
