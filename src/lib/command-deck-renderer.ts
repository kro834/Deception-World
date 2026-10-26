/** Decorative only: the command deck's links, text and focus remain ordinary DOM. */
export type CommandDeckRendererMode = "webgpu" | "2d" | "static";
export type CommandDeckRendererOptions = {
  economy?: boolean;
  maxDpr?: number;
  onRendererChange?: (mode: CommandDeckRendererMode) => void;
};

// Keep the optional WebGPU surface local; older DOM typings do not include it.
type GpuBuffer = { destroy(): void };
type GpuTexture = { createView(): unknown };
type GpuContext = {
  configure(options: object): void;
  unconfigure(): void;
  getCurrentTexture(): GpuTexture;
};
type GpuDevice = {
  lost: Promise<unknown>;
  queue: {
    writeBuffer(buffer: GpuBuffer, offset: number, data: Float32Array): void;
    submit(commands: unknown[]): void;
  };
  createBuffer(options: object): GpuBuffer;
  createShaderModule(options: object): unknown;
  createRenderPipelineAsync(
    options: object,
  ): Promise<{ getBindGroupLayout(index: number): unknown }>;
  createBindGroup(options: object): unknown;
  createCommandEncoder(): {
    beginRenderPass(options: object): {
      setPipeline(pipeline: unknown): void;
      setBindGroup(index: number, group: unknown): void;
      draw(count: number): void;
      end(): void;
    };
    finish(): unknown;
  };
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  destroy(): void;
};
type GpuApi = {
  requestAdapter(options: object): Promise<{ requestDevice(): Promise<GpuDevice> } | null>;
  getPreferredCanvasFormat(): string;
};
type Backend = { canvas: HTMLCanvasElement; draw(time: number): void; dispose(): void };
const COLORS = [
  [0.22, 0.82, 1],
  [0.74, 0.42, 1],
  [1, 0.67, 0.28],
];
const MAX_PIXELS = 1_500_000;
const GPU_DEADLINE = 1800;
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

const SHADER = /* wgsl */ `
struct Uniforms { size: vec2f, time: f32, scene: f32, pulse: vec2f, age: f32, pad: f32 };
@group(0) @binding(0) var<uniform> u: Uniforms;
struct Vertex { @builtin(position) position: vec4f };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> Vertex {
  var points = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
  var out: Vertex; out.position=vec4f(points[i],0,1); return out;
}
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453); }
@fragment fn fragment(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let uv=p.xy/u.size;
  let aspect=u.size.x/u.size.y;
  let drift=sin(u.time*.11)*.009;
  let q=vec2f((uv.x-.5)*aspect+drift,uv.y-.5);
  var accent=vec3f(.22,.82,1.);
  if (u.scene>.5) { accent=vec3f(.74,.42,1.); }
  if (u.scene>1.5) { accent=vec3f(1.,.67,.28); }
  // Open diagonal sheets and long light ribbons, never a central sphere.
  let sweep=q.y+q.x*.24;
  let ribbon=exp(-abs(sweep-.19-sin(q.x*3.+u.time*.19)*.055)*90.)*.28;
  let ribbon2=exp(-abs(sweep+.27+sin(q.x*2.-u.time*.13)*.04)*150.)*.14;
  let glass=(1.-smoothstep(.2,.65,abs(sweep)))*.025;
  let reflection=exp(-abs(sweep+.02-sin(u.time*.09)*.015)*9.)*.022;
  let edge=exp(-abs(abs(sweep)-.38)*190.)*.15;
  let horizon=exp(-abs(q.y-.27)*38.)*.055;
  // A sparse, slow star flow; fixed intensity avoids flashing.
  let field=vec2f(uv.x*95.+u.time*.32,uv.y*65.);
  let cell=floor(field);
  let star=pow(max(0.,1.-length(fract(field)-.5)*2.),9.)*step(.991,hash(cell))*.52;
  let floorDepth=uv.y-.48;
  let depth=max(.08,floorDepth);
  let gridUV=vec2f(q.x/depth*2.,1./depth*.8-u.time*.018);
  let gridLine=1.-smoothstep(.0,.025,min(abs(fract(gridUV.x)-.5),abs(fract(gridUV.y)-.5)));
  let grid=gridLine*smoothstep(.08,.4,floorDepth)*.045;
  let delta=(uv-u.pulse)*vec2f(aspect,1.);
  let radius=max(0.,.55-u.age*.42);
  let convergence=exp(-abs(length(delta)-radius)*100.)*max(0.,1.-u.age/1.3)*.24;
  let vignette=clamp(1.-length(q)*.52,.2,1.);
  let silver=vec3f(.58,.76,.9);
  let color=(accent*(ribbon+ribbon2+convergence)+silver*(edge+glass+reflection)+vec3f(horizon+star+grid))*vignette;
  let alpha=clamp(max(color.r,max(color.g,color.b)),0.,.7);
  return vec4f(min(color,vec3f(alpha)),alpha);
}`;

export function mountCommandDeckRenderer(
  host: HTMLElement,
  options: CommandDeckRendererOptions = {},
) {
  const defaultView = host.ownerDocument.defaultView;
  if (!defaultView) return { setScene() {}, pulse() {}, setPaused() {}, dispose() {} };
  const win = defaultView;
  const doc = host.ownerDocument;
  const media = win.matchMedia?.("(prefers-reduced-motion: reduce)");
  const connection = (
    win.navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }
  ).connection;
  let disposed = false,
    paused = false,
    intersecting = true,
    scene = 0;
  let width = 1,
    height = 1,
    frame = 0,
    lastTime = 0,
    elapsed = 0;
  let pulseX = 0.5,
    pulseY = 0.5,
    pulseAt = -10;
  let backend: Backend | null = null;
  let pendingCleanup: (() => void) | null = null;
  let rendererMode: CommandDeckRendererMode = "static";
  let gpuExpired = false;
  let gpuTimer = 0;
  const canvases = new Set<HTMLCanvasElement>();
  const isStill = () => !!options.economy || !!connection?.saveData || !!media?.matches;
  const active = () => !disposed && !paused && intersecting && !doc.hidden;
  const makeCanvas = () => {
    const canvas = doc.createElement("canvas");
    canvas.className = "command-deck-renderer";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block";
    canvas.width = width;
    canvas.height = height;
    canvases.add(canvas);
    return canvas;
  };
  const report = (mode: CommandDeckRendererMode) => {
    rendererMode = mode;
    host.dataset.renderer = mode;
    options.onRendererChange?.(mode);
  };
  const stop = () => {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  };
  function draw(now: number) {
    frame = 0;
    if (!active() || !backend) return;
    if (lastTime && !isStill()) elapsed += Math.min(64, Math.max(0, now - lastTime)) / 1000;
    lastTime = now;
    try {
      backend.draw(elapsed);
    } catch {
      if (rendererMode === "webgpu") fallback();
      else {
        backend?.dispose();
        backend = null;
        report("static");
      }
    }
    if (active() && backend && !isStill() && !frame) frame = win.requestAnimationFrame(draw);
  }
  function refresh() {
    stop();
    if (active() && backend) frame = win.requestAnimationFrame(draw);
  }
  function attachBackend(next: Backend, mode: CommandDeckRendererMode) {
    if (disposed) {
      next.dispose();
      return;
    }
    const old = backend;
    backend = next;
    host.append(next.canvas);
    old?.dispose();
    report(mode);
    refresh();
  }
  function fallback() {
    if (disposed) return;
    stop();
    backend?.dispose();
    backend = null;
    const canvas = makeCanvas();
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d", { alpha: true });
    } catch {
      /* Static CSS remains. */
    }
    if (!ctx) {
      canvas.remove();
      canvases.delete(canvas);
      report("static");
      return;
    }
    const context = ctx;
    attachBackend(
      {
        canvas,
        draw(time) {
          context.clearRect(0, 0, width, height);
          const c = COLORS[scene];
          const rgb = c.map((n) => Math.round(n * 255)).join(",");
          const glow = context.createLinearGradient(0, 0, width, height);
          glow.addColorStop(0, `rgba(${rgb},0)`);
          glow.addColorStop(0.5, `rgba(${rgb},.14)`);
          glow.addColorStop(1, `rgba(${rgb},0)`);
          context.fillStyle = glow;
          context.beginPath();
          context.moveTo(-width * 0.1, height * 0.43);
          context.lineTo(width * 1.1, height * 0.14);
          context.lineTo(width * 1.1, height * 0.61);
          context.lineTo(-width * 0.1, height * 0.9);
          context.closePath();
          context.fill();
          // A silver seam separates the glass layers from the dark metal stage.
          context.beginPath();
          context.moveTo(-width * 0.1, height * 0.43);
          context.lineTo(width * 1.1, height * 0.14);
          context.strokeStyle = "rgba(177,207,230,.18)";
          context.lineWidth = Math.max(1, width / 1400);
          context.stroke();
          context.strokeStyle = `rgba(${rgb},.055)`;
          context.lineWidth = Math.max(0.5, width / 1800);
          for (let i = -6; i <= 6; i++) {
            context.beginPath();
            context.moveTo(width * 0.5 + i * width * 0.012, height * 0.62);
            context.lineTo(width * 0.5 + i * width * 0.19, height);
            context.stroke();
          }
          for (let i = 1; i <= 5; i++) {
            const floorY = height * (0.62 + (i / 5) ** 2 * 0.38);
            context.beginPath();
            context.moveTo(0, floorY);
            context.lineTo(width, floorY);
            context.stroke();
          }
          for (let band = 0; band < 3; band++) {
            context.beginPath();
            for (let n = 0; n <= 48; n++) {
              const x = (n / 48) * width;
              const y =
                height * (0.35 + band * 0.19) -
                x * 0.15 +
                Math.sin((n / 48) * 5 + time * 0.17 + band) * height * 0.025;
              if (n) context.lineTo(x, y);
              else context.moveTo(x, y);
            }
            context.strokeStyle = `rgba(${rgb},${band === 1 ? 0.38 : 0.16})`;
            context.lineWidth = Math.max(1, width / 1200);
            context.stroke();
          }
          context.fillStyle = "rgba(196,223,255,.38)";
          for (let i = 0; i < 52; i++) {
            const x = (((i * 137.51 + time * 2.8) % 1000) / 1000) * width;
            const y = (((i * 293.31) % 1000) / 1000) * height;
            context.fillRect(x, y, Math.max(1, width / 1200), Math.max(1, height / 900));
          }
          const age = time - pulseAt;
          if (age >= 0 && age < 1.3) {
            context.beginPath();
            context.arc(
              pulseX * width,
              pulseY * height,
              Math.max(0, 0.55 - age * 0.42) * height,
              0,
              Math.PI * 2,
            );
            context.strokeStyle = `rgba(${rgb},${(1 - age / 1.3) * 0.35})`;
            context.stroke();
          }
        },
        dispose() {
          canvas.remove();
          canvases.delete(canvas);
        },
      },
      "2d",
    );
  }
  const resize = () => {
    if (disposed) return;
    const box = host.getBoundingClientRect();
    const dpr = clamp(options.maxDpr ?? 1.5, 0.5, 2);
    const scale = Math.min(
      win.devicePixelRatio || 1,
      dpr,
      Math.sqrt(MAX_PIXELS / Math.max(1, box.width * box.height)),
    );
    width = Math.max(1, Math.round(box.width * scale));
    height = Math.max(1, Math.round(box.height * scale));
    for (const canvas of canvases) {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    }
    refresh();
  };
  const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  const intersectionObserver =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => {
          intersecting = entry?.isIntersecting ?? false;
          refresh();
        })
      : null;
  resizeObserver?.observe(host);
  intersectionObserver?.observe(host);
  win.addEventListener("resize", resize, { passive: true });
  doc.addEventListener("visibilitychange", refresh);
  media?.addEventListener?.("change", refresh);
  connection?.addEventListener("change", refresh);
  resize();
  fallback();

  // The DOM and 2D background are already usable before any adapter work starts.
  async function tryGpu() {
    const gpu = (win!.navigator as Navigator & { gpu?: GpuApi }).gpu;
    if (!gpu || isStill() || !active()) return;
    let candidate: HTMLCanvasElement | null = null;
    let buffer: GpuBuffer | null = null;
    let context: GpuContext | null = null;
    let device: GpuDevice | null = null;
    let activated = false;
    const stale = () => disposed || gpuExpired;
    const onError = () => {
      if (activated && !disposed) fallback();
      else {
        gpuExpired = true;
        cleanup();
      }
    };
    const cleanup = () => {
      device?.removeEventListener("uncapturederror", onError);
      try {
        context?.unconfigure();
      } catch {
        /* A lost context may already be unconfigured. */
      }
      buffer?.destroy();
      device?.destroy();
      if (candidate) {
        candidate.remove();
        canvases.delete(candidate);
      }
      buffer = null;
      device = null;
      context = null;
      candidate = null;
    };
    pendingCleanup = cleanup;
    gpuTimer = win!.setTimeout(() => {
      gpuExpired = true;
      cleanup();
      pendingCleanup = null;
    }, GPU_DEADLINE);
    try {
      const adapter = await gpu.requestAdapter({ powerPreference: "low-power" });
      if (!adapter || stale()) return;
      device = await adapter.requestDevice();
      if (stale()) {
        cleanup();
        return;
      }
      device.addEventListener("uncapturederror", onError);
      candidate = makeCanvas();
      context = candidate.getContext("webgpu") as unknown as GpuContext | null;
      if (!context) throw new Error("No GPU canvas context");
      const format = gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: "premultiplied" });
      buffer = device.createBuffer({ size: 32, usage: 0x40 | 0x08 }); // UNIFORM | COPY_DST
      const module = device.createShaderModule({ code: SHADER });
      const pipeline = await device.createRenderPipelineAsync({
        layout: "auto",
        vertex: { module, entryPoint: "vertex" },
        fragment: { module, entryPoint: "fragment", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      });
      if (stale()) {
        cleanup();
        return;
      }
      const group = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer } }],
      });
      const gpuDevice = device,
        gpuContext = context,
        uniforms = buffer;
      const data = new Float32Array(8);
      const gpuBackend: Backend = {
        canvas: candidate,
        draw(time) {
          data.set([width, height, time, scene, pulseX, pulseY, time - pulseAt, 0]);
          gpuDevice.queue.writeBuffer(uniforms, 0, data);
          const encoder = gpuDevice.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: gpuContext.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: "clear",
                storeOp: "store",
              },
            ],
          });
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, group);
          pass.draw(3);
          pass.end();
          gpuDevice.queue.submit([encoder.finish()]);
        },
        dispose: cleanup,
      };
      gpuBackend.draw(elapsed); // Mark WebGPU only after configuration, compilation and first submission.
      activated = true;
      pendingCleanup = null;
      win!.clearTimeout(gpuTimer);
      gpuTimer = 0;
      attachBackend(gpuBackend, "webgpu");
      void gpuDevice.lost.then(() => {
        if (!disposed && backend === gpuBackend) fallback();
      }, onError);
    } catch {
      cleanup(); /* Existing 2D canvas remains available during initialization failure. */
    } finally {
      if (!activated) {
        pendingCleanup = null;
        win!.clearTimeout(gpuTimer);
        gpuTimer = 0;
      }
    }
  }
  void Promise.resolve().then(tryGpu);
  return {
    setScene(index: number) {
      if (disposed) return;
      scene = clamp(Math.round(Number.isFinite(index) ? index : 0), 0, 2);
      refresh();
    },
    pulse(x?: number, y?: number) {
      if (disposed || isStill()) return;
      const box = host.getBoundingClientRect();
      pulseX = clamp((x ?? box.width * 0.5) / Math.max(1, box.width), 0, 1);
      pulseY = clamp((y ?? box.height * 0.5) / Math.max(1, box.height), 0, 1);
      pulseAt = elapsed;
      refresh();
    },
    setPaused(value: boolean) {
      if (disposed) return;
      paused = value;
      refresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gpuExpired = true;
      stop();
      win.clearTimeout(gpuTimer);
      pendingCleanup?.();
      pendingCleanup = null;
      backend?.dispose();
      backend = null;
      for (const canvas of canvases) canvas.remove();
      canvases.clear();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      win.removeEventListener("resize", resize);
      doc.removeEventListener("visibilitychange", refresh);
      media?.removeEventListener?.("change", refresh);
      connection?.removeEventListener("change", refresh);
      delete host.dataset.renderer;
    },
  };
}
