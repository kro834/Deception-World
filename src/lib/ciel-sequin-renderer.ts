import {
  BufferAttribute,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  OrthographicCamera,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";
import { CIEL_SEQUIN_FRAGMENT, CIEL_SEQUIN_VERTEX } from "./ciel-sequin-shaders.ts";
import {
  brushSequinGrid,
  sampleSequinSpring,
  SEQUIN_SPRING,
  sequinGrid,
  sequinImageRect,
  sequinStrokeTarget,
  sequinBrushDelay,
  sequinGridCenter,
  sequinGridIndexAt,
  SEQUIN_RADIUS_RATIO,
  type SequinFit,
} from "./ciel-sequin-physics.ts";

export type CielSequinState = "loading" | "webgl" | "fallback" | "unavailable";
export type CielSequinOptions = {
  canvas: HTMLCanvasElement;
  fallback: HTMLCanvasElement;
  imageUrl: string;
  coarse?: boolean;
  reducedMotion?: boolean;
  economy?: boolean;
  onState?: (state: CielSequinState) => void;
};

/** A closed pressed disc: shallow dish, rounded bevel and physical thickness.
 * Indexed rings share vertices within each material surface, still one draw. */
function discGeometry(coarse: boolean) {
  const positions: number[] = [],
    normals: number[] = [],
    walls: number[] = [],
    faces: number[] = [],
    indices: number[] = [];
  const segments = coarse ? 16 : 24;
  const profile = [
    [0, 0.005],
    [0.94, 0.045],
    [0.985, 0.034],
    [1, 0.015],
    [1, -0.005],
    [0.985, -0.024],
    [0.94, -0.035],
    [0, -0.075],
  ];
  const ring = (p: number, face: number) => {
    const [radius, z] = profile[p];
    const before = profile[p - 1],
      after = profile[p + 1];
    const incoming = Math.hypot(radius - before[0], z - before[1]);
    const outgoing = Math.hypot(after[0] - radius, after[1] - z);
    const dr = (radius - before[0]) / incoming + (after[0] - radius) / outgoing;
    const dz = (z - before[1]) / incoming + (after[1] - z) / outgoing;
    const length = Math.hypot(dr, dz);
    const start = positions.length / 3;
    for (let i = 0; i < segments; i++) {
      const angle = (i * Math.PI * 2) / segments,
        c = Math.cos(angle),
        s = Math.sin(angle);
      positions.push(radius * c, radius * s, z);
      normals.push((-dz / length) * c, (-dz / length) * s, dr / length);
      walls.push(face === 0 ? 1 : 0);
      faces.push(face);
    }
    return start;
  };
  const cap = (back: boolean) => {
    const face = back ? -1 : 1,
      center = positions.length / 3;
    positions.push(0, 0, profile[back ? 7 : 0][1]);
    normals.push(0, 0, face);
    walls.push(0);
    faces.push(face);
    const edge = ring(back ? 6 : 1, face);
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(center, edge + (back ? next : i), edge + (back ? i : next));
    }
  };
  cap(false);
  let previous = ring(1, 0);
  for (let p = 2; p <= 6; p++) {
    const next = ring(p, 0);
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      indices.push(previous + i, next + i, previous + j, previous + j, next + i, next + j);
    }
    previous = next;
  }
  cap(true);
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute("aWall", new BufferAttribute(new Float32Array(walls), 1));
  geometry.setAttribute("aFace", new BufferAttribute(new Float32Array(faces), 1));
  return geometry;
}

/** This module is imported only after the secret has finished burning.
 * No DOM beyond the two supplied canvases is changed. */
export function createCielSequinRenderer(options: CielSequinOptions) {
  const { canvas, fallback } = options;
  const coarse = Boolean(options.coarse),
    calm = Boolean(options.reducedMotion || options.economy);
  let disposed = false,
    manualPause = false,
    suspended = document.hidden;
  let epoch = performance.now(),
    pauseStamp = suspended ? epoch : 0;
  let raf = 0,
    activeUntil = 0,
    lightUntil = 0,
    lastFrameTime = 0,
    fit: SequinFit = "cover";
  let grid = sequinGrid(1, 1, coarse),
    motion = new Float32Array(4),
    axes = new Float32Array([0, 1]);
  let motionAttribute: InstancedBufferAttribute | null = null,
    axisAttribute: InstancedBufferAttribute | null = null;
  let renderer: WebGLRenderer | null = null,
    geometry: InstancedBufferGeometry | null = null;
  let mesh: Mesh | null = null,
    material: ShaderMaterial | null = null,
    texture: Texture | null = null,
    studioTexture: Texture | null = null;
  let studioImage: HTMLImageElement | null = null;
  let image: HTMLImageElement | null = null,
    imageReady = false,
    backCount = 0;
  let ctx: CanvasRenderingContext2D | null = null,
    pointerId: number | null = null,
    lastX = 0,
    lastY = 0;
  let hoverKnown = false;
  let shaderFailed = false;
  let dirtyFrom = Infinity,
    dirtyTo = -1;
  const scratch = new Float64Array(2),
    centerScratch = new Float64Array(2),
    scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 1, 0, 0.1, 1000);
  camera.position.z = 200;
  const light = new Vector3(0.5, 0.6, 300);
  const lightTarget = light.clone();
  const uniforms = {
    uTime: { value: 0 },
    uRadius: { value: 1 },
    uSize: { value: new Vector2(1, 1) },
    uImage: { value: null as Texture | null },
    uImageReady: { value: 0 },
    uImageRect: { value: new Vector4(0, 0, 1, 1) },
    uLight: { value: light },
    uStudio: { value: null as Texture | null },
    uStudioReady: { value: 0 },
  };
  const clock = () => ((suspended ? pauseStamp : performance.now()) - epoch) / 1000;
  const state = (next: CielSequinState) => {
    for (const surface of [canvas, fallback]) surface.dataset.sequinState = next;
    options.onState?.(next);
  };
  const report = () => {
    for (const surface of [canvas, fallback]) {
      surface.dataset.sequinCount = String(grid.count);
      surface.dataset.sequinBack = String(backCount);
      surface.dataset.sequinDrawCalls = renderer ? "1" : "0";
    }
  };
  const fitImage = () => {
    if (!imageReady || !image) return;
    const rect = sequinImageRect(
      grid.width,
      grid.height,
      image.naturalWidth,
      image.naturalHeight,
      fit,
    );
    uniforms.uImageRect.value.set(
      rect.x,
      grid.height - rect.y - rect.height,
      rect.width,
      rect.height,
    );
  };
  const drawFallback = () => {
    if (!ctx) return;
    const ratio = fallback.width / grid.width;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#030806";
    ctx.fillRect(0, 0, grid.width, grid.height);
    if (imageReady && image) {
      const r = sequinImageRect(
        grid.width,
        grid.height,
        image.naturalWidth,
        image.naturalHeight,
        fit,
      );
      ctx.drawImage(image, r.x, r.y, r.width, r.height);
    }
    // Paint over unrevealed cells. The photograph is drawn just once, not
    // thousands of cropped images; reverse brushing closes those cells.
    const pitch = grid.pitch;
    for (let i = 0; i < grid.count; i++)
      if (motion[i * 4 + 2] < 1) {
        sequinGridCenter(grid, i, centerScratch);
        const x = centerScratch[0],
          y = centerScratch[1],
          radius = pitch * SEQUIN_RADIUS_RATIO;
        const tone = (i * 37) % 13;
        ctx.fillStyle = tone < 3 ? "#a1c3aa" : tone < 7 ? "#557e68" : "#294c3b";
        ctx.beginPath();
        ctx.ellipse(x, y, radius, radius, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#172b21";
        ctx.fillRect(
          x - pitch * 0.04,
          y - radius * 0.74,
          Math.max(0.7, pitch * 0.08),
          Math.max(0.7, pitch * 0.08),
        );
      }
  };
  const render = (now: number) => {
    raf = 0;
    if (disposed || suspended) return;
    const time = (now - epoch) / 1000;
    if (renderer && material) {
      const delta = Math.max(0, Math.min(0.05, time - lastFrameTime));
      lastFrameTime = time;
      if (time >= lightUntil) light.copy(lightTarget);
      else light.lerp(lightTarget, 1 - Math.exp(-delta * 12));
      uniforms.uTime.value = time;
      if (dirtyTo >= dirtyFrom && motionAttribute && axisAttribute) {
        motionAttribute.clearUpdateRanges();
        motionAttribute.addUpdateRange(dirtyFrom * 4, (dirtyTo - dirtyFrom + 1) * 4);
        motionAttribute.needsUpdate = true;
        axisAttribute.clearUpdateRanges();
        axisAttribute.addUpdateRange(dirtyFrom * 2, (dirtyTo - dirtyFrom + 1) * 2);
        axisAttribute.needsUpdate = true;
        dirtyFrom = Infinity;
        dirtyTo = -1;
      }
      try {
        renderer.render(scene, camera);
      } catch {
        shaderFailed = true;
      }
      if (shaderFailed) {
        activateFallback();
        return;
      }
      if (time < activeUntil || (time < lightUntil && light.distanceToSquared(lightTarget) > 0.04))
        raf = requestAnimationFrame(render);
    } else drawFallback();
  };
  const wake = () => {
    if (!disposed && !suspended && !raf) raf = requestAnimationFrame(render);
  };
  const releaseGPU = () => {
    if (mesh) scene.remove(mesh);
    geometry?.dispose();
    material?.dispose();
    texture?.dispose();
    studioTexture?.dispose();
    studioTexture = null;
    uniforms.uStudio.value = null;
    uniforms.uStudioReady.value = 0;
    if (studioImage) {
      studioImage.onload = studioImage.onerror = null;
      studioImage.removeAttribute("src");
      studioImage = null;
    }
    renderer?.dispose();
    // The owner can change motion preferences and remount on this canvas.
    // Dispose resources without deliberately making its context unusable.
    renderer = null;
    geometry = null;
    material = null;
    texture = null;
    mesh = null;
    motionAttribute = null;
    axisAttribute = null;
  };
  const activateFallback = () => {
    releaseGPU();
    canvas.hidden = true;
    fallback.hidden = false;
    ctx = fallback.getContext("2d", { alpha: false });
    state(ctx ? "fallback" : "unavailable");
    report();
    wake();
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    if (disposed) return;
    activateFallback();
  };
  canvas.addEventListener("webglcontextlost", contextLost);
  if (!calm)
    try {
      renderer = new WebGLRenderer({
        canvas,
        alpha: false,
        antialias: false,
        powerPreference: "low-power",
      });
      if (renderer.getContext().isContextLost()) throw new Error("Sequin context unavailable");
      renderer.debug.onShaderError = () => {
        shaderFailed = true;
      };
      renderer.setClearColor(0x030806, 1);
      renderer.outputColorSpace = SRGBColorSpace;
      material = new ShaderMaterial({
        vertexShader: CIEL_SEQUIN_VERTEX,
        fragmentShader: CIEL_SEQUIN_FRAGMENT,
        uniforms,
        side: DoubleSide,
      });
      canvas.hidden = false;
      fallback.hidden = true;
      state("webgl");
    } catch {
      activateFallback();
    }
  else activateFallback();

  const resize = (width: number, height: number) => {
    if (disposed) return;
    const old = grid,
      previous = motion,
      previousAxes = axes,
      time = clock();
    grid = sequinGrid(width, height, coarse || !renderer);
    motion = new Float32Array(grid.count * 4);
    axes = new Float32Array(grid.count * 2);
    const centers = new Float32Array(grid.count * 2),
      seeds = new Float32Array(grid.count);
    backCount = 0;
    for (let i = 0; i < grid.count; i++) {
      sequinGridCenter(grid, i, centerScratch);
      const x = centerScratch[0],
        y = centerScratch[1];
      const index = sequinGridIndexAt(
          old,
          (x / grid.width) * old.width,
          (y / grid.height) * old.height,
        ),
        offset = index * 4;
      const target = previous[offset + 2] ?? 0;
      sampleSequinSpring(
        previous[offset] ?? 0,
        previous[offset + 1] ?? 0,
        target,
        time - (previous[offset + 3] ?? 0),
        scratch,
      );
      motion.set([scratch[0], scratch[1], target, time], i * 4);
      axes[i * 2] = previousAxes[index * 2] ?? 0;
      axes[i * 2 + 1] = previousAxes[index * 2 + 1] ?? 1;
      centers[i * 2] = x;
      centers[i * 2 + 1] = grid.height - y;
      seeds[i] = ((i * 137.507764) % 100) / 100;
      if (target > 1) backCount++;
    }
    const ratio = Math.min(
      devicePixelRatio || 1,
      coarse ? 1.35 : 1.7,
      Math.sqrt((coarse ? 1100000 : 2200000) / (grid.width * grid.height)),
    );
    if (renderer && material) {
      if (mesh) scene.remove(mesh);
      geometry?.dispose();
      geometry = discGeometry(coarse);
      motionAttribute = new InstancedBufferAttribute(motion, 4).setUsage(DynamicDrawUsage);
      axisAttribute = new InstancedBufferAttribute(axes, 2).setUsage(DynamicDrawUsage);
      geometry.setAttribute("aMotion", motionAttribute);
      geometry.setAttribute("aAxis", axisAttribute);
      geometry.setAttribute("aCenter", new InstancedBufferAttribute(centers, 2));
      geometry.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 1));
      geometry.instanceCount = grid.count;
      mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      renderer.setPixelRatio(ratio);
      renderer.setSize(grid.width, grid.height, false);
      camera.right = grid.width;
      camera.top = grid.height;
      camera.updateProjectionMatrix();
      uniforms.uSize.value.set(grid.width, grid.height);
      uniforms.uRadius.value = grid.pitch * SEQUIN_RADIUS_RATIO;
    }
    fallback.width = Math.max(1, Math.round(grid.width * Math.min(1, ratio)));
    fallback.height = Math.max(1, Math.round(grid.height * Math.min(1, ratio)));
    light.set(grid.width * 0.5, grid.height * 0.65, Math.max(180, grid.width * 0.45));
    lightTarget.copy(light);
    lightUntil = lastFrameTime = time;
    dirtyFrom = Infinity;
    dirtyTo = -1;
    fitImage();
    report();
    wake();
  };
  const retarget = (
    i: number,
    target: number,
    ax: number,
    ay: number,
    time: number,
    impulse: number,
    delay = 0,
  ) => {
    const o = i * 4;
    sampleSequinSpring(motion[o], motion[o + 1], motion[o + 2], time - motion[o + 3], scratch);
    const moving = Math.abs(scratch[1]) > 0.1 || Math.abs(scratch[0] - motion[o + 2]) > 0.02;
    if (motion[o + 2] > 1 !== target > 1) backCount += target > 1 ? 1 : -1;
    // Repeated strokes continue from the current angle and velocity, not a
    // reset to the last end pose. Thus even a mid-flight reversal is smooth.
    motion[o] = scratch[0];
    motion[o + 1] = Math.max(-24, Math.min(24, scratch[1] + impulse));
    motion[o + 2] = target;
    motion[o + 3] = time + (moving ? 0 : delay);
    // Keep the axis while a tile is in flight; changing it would teleport
    // the 3D normal despite a continuous spring angle.
    if (Math.abs(Math.sin(scratch[0])) < 0.05) {
      axes[i * 2] = ax;
      axes[i * 2 + 1] = ay;
    }
    dirtyFrom = Math.min(dirtyFrom, i);
    dirtyTo = Math.max(dirtyTo, i);
  };
  const point = (event: PointerEvent) => {
    const surface = event.currentTarget as HTMLCanvasElement,
      rect = surface.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * grid.width) / Math.max(1, rect.width),
      y: ((event.clientY - rect.top) * grid.height) / Math.max(1, rect.height),
    };
  };
  const move = (event: PointerEvent) => {
    if (disposed) return;
    const p = point(event);
    lightTarget.set(p.x, grid.height - p.y, Math.max(180, grid.width * 0.45));
    lightUntil = clock() + 0.65;
    const hover = event.pointerType === "mouse" && !coarse && pointerId === null;
    if (hover && !hoverKnown) {
      hoverKnown = true;
      lastX = p.x;
      lastY = p.y;
      wake();
      return;
    }
    if (pointerId === event.pointerId || hover) {
      if (!hover) event.preventDefault();
      const dx = p.x - lastX,
        dy = p.y - lastY,
        length = Math.hypot(dx, dy);
      if (length > 0.2) {
        const time = clock(),
          target = sequinStrokeTarget(dx, dy),
          direction = target > 1 ? 1 : -1;
        brushSequinGrid(grid, lastX, lastY, p.x, p.y, coarse ? 34 : 27, (i, weight) => {
          if (weight > 0.08)
            retarget(
              i,
              target,
              dy / length,
              dx / length,
              time,
              direction * (2 + weight * 3),
              calm ? 0 : sequinBrushDelay(weight),
            );
        });
        activeUntil = time + SEQUIN_SPRING.settle + 0.065;
        report();
        lastX = p.x;
        lastY = p.y;
      }
    }
    wake();
  };
  const down = (event: PointerEvent) => {
    if (disposed || pointerId !== null || (event.pointerType === "mouse" && event.button !== 0))
      return;
    event.preventDefault();
    pointerId = event.pointerId;
    const p = point(event);
    lastX = p.x;
    lastY = p.y;
    try {
      (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
    } catch {
      /* Detached or cancelled pointer. */
    }
    lightTarget.set(p.x, grid.height - p.y, Math.max(180, grid.width * 0.45));
    lightUntil = clock() + 0.65;
    wake();
  };
  const leave = () => {
    hoverKnown = false;
  };
  const up = (event: PointerEvent) => {
    if (pointerId === event.pointerId) pointerId = null;
  };
  for (const surface of [canvas, fallback]) {
    surface.style.touchAction = "none";
    surface.addEventListener("pointerdown", down);
    surface.addEventListener("pointermove", move);
    surface.addEventListener("pointerleave", leave);
    surface.addEventListener("pointerup", up);
    surface.addEventListener("pointercancel", up);
    surface.addEventListener("lostpointercapture", up);
  }
  const updatePause = () => {
    const next = manualPause || document.hidden;
    if (next === suspended) return;
    if (next) {
      pauseStamp = performance.now();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pointerId = null;
      hoverKnown = false;
    } else epoch += performance.now() - pauseStamp;
    suspended = next;
    if (!next) wake();
  };
  document.addEventListener("visibilitychange", updatePause);
  if (renderer) {
    studioImage = new Image();
    studioImage.decoding = "async";
    const loadingStudio = studioImage;
    studioImage.onload = () => {
      if (disposed || !renderer || !loadingStudio.naturalWidth || !loadingStudio.naturalHeight)
        return;
      studioTexture?.dispose();
      studioTexture = new Texture(loadingStudio);
      studioTexture.colorSpace = SRGBColorSpace;
      studioTexture.wrapS = RepeatWrapping;
      studioTexture.needsUpdate = true;
      uniforms.uStudio.value = studioTexture;
      uniforms.uStudioReady.value = 1;
      wake();
    };
    studioImage.onerror = () => {
      /* Procedural lighting remains available. */
    };
    studioImage.src = "/ciel-sequin-studio-20261028/studio.webp";
  }
  image = new Image();
  image.decoding = "async";
  const loadingImage = image;
  image.onload = () => {
    if (disposed) return;
    imageReady = loadingImage.naturalWidth > 0 && loadingImage.naturalHeight > 0;
    if (imageReady && renderer) {
      texture = new Texture(loadingImage);
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      uniforms.uImage.value = texture;
      uniforms.uImageReady.value = 1;
    }
    if (!imageReady) state("unavailable");
    fitImage();
    wake();
  };
  image.onerror = () => {
    if (!disposed) state("unavailable");
  };
  image.src = options.imageUrl;
  resize(
    Math.max(1, canvas.clientWidth || fallback.clientWidth),
    Math.max(1, canvas.clientHeight || fallback.clientHeight),
  );
  return {
    resize,
    setPaused(value: boolean) {
      manualPause = value;
      updatePause();
    },
    setImageFit(value: SequinFit) {
      if (disposed) return;
      fit = value;
      fitImage();
      wake();
    },
    setFace(face: "front" | "back") {
      if (disposed) return;
      const time = clock(),
        target = face === "back" ? Math.PI : 0;
      for (let i = 0; i < grid.count; i++) retarget(i, target, 0, 1, time, 0);
      activeUntil = time + SEQUIN_SPRING.settle;
      report();
      wake();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      canvas.removeEventListener("webglcontextlost", contextLost);
      document.removeEventListener("visibilitychange", updatePause);
      for (const surface of [canvas, fallback]) {
        surface.removeEventListener("pointerdown", down);
        surface.removeEventListener("pointermove", move);
        surface.removeEventListener("pointerleave", leave);
        surface.removeEventListener("pointerup", up);
        surface.removeEventListener("pointercancel", up);
        surface.removeEventListener("lostpointercapture", up);
      }
      if (image) {
        image.onload = null;
        image.onerror = null;
        image.removeAttribute("src");
      }
      image = null;
      releaseGPU();
      ctx = null;
    },
  };
}
