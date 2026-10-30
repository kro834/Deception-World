import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { GuardianDracoLoader } from "../dogs-archive/draco.ts";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FXAAPass } from "three/addons/postprocessing/FXAAPass.js";
import {
  isRexonanceBody,
  isRexonanceRibbon,
  readRexonanceGlint,
  rexonanceFamilyOf,
  type RexonanceFamily,
} from "./contract.ts";
import { createGlints, estimateGlintNormals, type GlintAnchor } from "./glints.ts";
import { createRexonanceMaterial, createRexonanceUniforms } from "./materials.ts";
import { createRexonanceMotion } from "./motion.ts";
import {
  createAdaptiveScale,
  detectRexonanceQualityTier,
  REXONANCE_QUALITY,
  rexonancePixelRatio,
  type RexonanceQualityTier,
} from "./quality.ts";
import { createBackdrop, createLightRig, createStage, createStudioEnvironment } from "./studio.ts";
import {
  REXONANCE_DEFAULT_VIEW,
  rexonanceFitDistance,
  rexonanceFrameInsets,
  rexonanceOrbitLimits,
  rexonanceView,
  rexonanceViewDirection,
  rexonanceViewOffsetY,
  type FrameInsets,
  type RexonanceViewId,
} from "./views.ts";

export type { RexonanceViewId } from "./views.ts";
export type RexonanceStatus = "loading" | "ready" | "error";

/** Draco decoders the site already serves for DOGS ARCHIVE (three r186, glTF build). */
export const REXONANCE_DRACO_DECODER_PATH = "/dogs-archive-20261028/decoders/draco/";

export type RexonanceSceneOptions = {
  modelUrl?: string;
  scaleMapUrl?: string;
  /** Folder holding draco_decoder.js, draco_wasm_wrapper.js and draco_decoder.wasm. */
  dracoDecoderPath?: string;
  /** The GLB itself, when the page already holds it (the standalone build); no fetch. */
  modelData?: ArrayBuffer;
  initialView?: RexonanceViewId;
  /** Turntable on load (forced off with prefers-reduced-motion). */
  autoRotate?: boolean;
  qualityTier?: RexonanceQualityTier;
  /** Accessible name of the canvas. */
  label?: string;
  onStatus?: (status: RexonanceStatus) => void;
  /** 0..1 while the GLB downloads (when its size is known). */
  onProgress?: (fraction: number) => void;
  onAutoRotateChange?: (on: boolean) => void;
  /** The preset the camera rests on, or null once the visitor orbits away from it. */
  onViewChange?: (view: RexonanceViewId | null) => void;
};

export type RexonanceScene = {
  setView(view: RexonanceViewId): void;
  resetView(): void;
  setAutoRotate(on: boolean): void;
  setPaused(paused: boolean): void;
  /** Hidden behind a menu or dialog: stop drawing, keep everything. */
  setBlocked(blocked: boolean): void;
  /** Fractions of the viewport kept clear (toolbar, caption); refits the resting view. */
  setInsets(insets: FrameInsets | null): void;
  getDiagnostics(): Record<string, unknown>;
  dispose(): void;
};

export const REXONANCE_MODEL_URL = "/rexonance-3d-20261030/rexonance.glb";
export const REXONANCE_SCALE_MAP_URL = "/rexonance-3d-20261030/textures/scale-normal.webp";

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** extensionsUsed from a GLB's JSON chunk, so only the decoders the file needs start. */
function glbExtensionsUsed(data: ArrayBuffer): string[] {
  try {
    const view = new DataView(data);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(16, true) !== 0x4e4f534a)
      return [];
    const json = new TextDecoder().decode(new Uint8Array(data, 20, view.getUint32(12, true)));
    return (JSON.parse(json) as { extensionsUsed?: string[] }).extensionsUsed ?? [];
  } catch {
    return [];
  }
}

/** A page whose policy forbids compiling WebAssembly still has the object; try a tiny module. */
function webAssemblyCompiles(): boolean {
  try {
    return (
      new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])) instanceof
      WebAssembly.Module
    );
  } catch {
    return false;
  }
}

/** The Rexonance viewer: a framework-free three.js surface inside `host`. Every resource it
 * makes is released by dispose(), including a request still in flight. */
export function createRexonanceScene(
  host: HTMLElement,
  options: RexonanceSceneOptions = {},
): RexonanceScene {
  const abort = new AbortController();
  const coarse = matchMedia("(pointer: coarse)").matches;
  const tier = options.qualityTier ?? detectRexonanceQualityTier(navigator, coarse);
  const quality = REXONANCE_QUALITY[tier];
  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  const canvas = document.createElement("canvas");
  canvas.className = "rx3d-viewer__canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    options.label ??
      "レクソナンスの立体模型。ドラッグで回転、ピンチやホイールで拡大縮小、右ドラッグか二本指で移動。矢印キーで回転、プラスとマイナスで拡大縮小、Homeで視点を戻す。",
  );
  canvas.dataset.qualityTier = tier;
  canvas.dataset.viewer = "rexonance-3d-20261030";
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setClearColor(0x020206, 1);
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const uniforms = createRexonanceUniforms();
  const flatNormal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  flatNormal.needsUpdate = true;
  uniforms.rxScaleMap.value = flatNormal;
  let scaleMap: THREE.Texture | null = null;
  let environment = createStudioEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 1;
  const backdrop = createBackdrop();
  scene.add(backdrop.mesh);
  const lightTarget = new THREE.Object3D();
  lightTarget.name = "RexonanceLightTarget";
  lightTarget.position.set(0, 1, 0);
  scene.add(lightTarget);
  const figure = new THREE.Group();
  figure.name = "RexonanceFigure";
  scene.add(figure);
  let stage: ReturnType<typeof createStage> | null = null;
  let glints: ReturnType<typeof createGlints> | null = null;
  let motion: ReturnType<typeof createRexonanceMotion> | null = null;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
  camera.position.set(2.5, 1.4, 6);
  camera.add(createLightRig(lightTarget));
  scene.add(camera);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.6;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.autoRotateSpeed = 1.6;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.target.set(0, 1, 0);
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = Math.PI / 2 + 0.32;

  const samples = quality.samples;
  const hdr = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples,
  });
  hdr.texture.name = "Rexonance.hdr";
  const composer = new EffectComposer(renderer, hdr);
  const renderPass = new RenderPass(scene, camera);
  // Only true emitters bloom (the cores, the visor, jewel centres, sparkles): gold and lacquer
  // highlights stay under the threshold.
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.38, 0.25, 3);
  bloom.enabled = quality.bloom;
  const output = new OutputPass();
  const fxaa = samples === 0 ? new FXAAPass() : null;
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(output);
  if (fxaa) composer.addPass(fxaa);

  // State
  let model: THREE.Object3D | null = null;
  const frameBox = new THREE.Box3(new THREE.Vector3(-0.6, 0, -0.5), new THREE.Vector3(0.6, 2, 0.5));
  const orbitCenter = new THREE.Vector3(0, 1, 0);
  let currentView: RexonanceViewId | null = options.initialView ?? REXONANCE_DEFAULT_VIEW;
  let userMoved = false;
  let insetsOverride: FrameInsets | null = null;
  let autoRotate = Boolean(options.autoRotate ?? true) && !reducedMotion;
  controls.autoRotate = false;
  let paused = false;
  let blocked = false;
  let disposed = false;
  let lost = false;
  let inViewport = true;
  let frame = 0;
  let last = 0;
  let time = 0;
  let settle = 0;
  let frames = 0;
  let width = 1;
  let height = 1;
  let dpr = 1;
  const adaptive = createAdaptiveScale(quality.minScale);
  let transition: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    targetFrom: THREE.Vector3;
    targetTo: THREE.Vector3;
    start: number;
    duration: number;
  } | null = null;
  const stats = {
    meshes: 0,
    triangles: 0,
    families: {} as Record<string, number>,
    glints: 0,
    ribbons: 0,
    tailPivots: 0,
    core: false,
    unknownMaterials: [] as string[],
    unplacedGlints: [] as string[],
    loadMs: 0,
    bytes: 0,
  };
  const startedAt = performance.now();
  const notify = (status: RexonanceStatus) => {
    if (disposed) return;
    canvas.dataset.status = status;
    options.onStatus?.(status);
  };

  const insets = () => insetsOverride ?? rexonanceFrameInsets(width, height);
  const canDraw = () => !disposed && !lost && !blocked && inViewport && !document.hidden;
  const request = () => {
    if (!frame && canDraw()) frame = requestAnimationFrame(draw);
  };

  const viewGoal = (id: RexonanceViewId) => {
    const view = rexonanceView(id);
    return fitAlong(rexonanceViewDirection(view.azimuth, view.elevation));
  };
  const fitAlong = (direction: [number, number, number]) => {
    const distance = rexonanceFitDistance(
      {
        min: frameBox.min.toArray() as [number, number, number],
        max: frameBox.max.toArray() as [number, number, number],
      },
      orbitCenter.toArray() as [number, number, number],
      direction,
      camera.fov,
      camera.aspect,
      insets(),
    );
    return orbitCenter.clone().addScaledVector(new THREE.Vector3(...direction), distance);
  };

  const applyLimits = () => {
    const front = viewGoal("front").distanceTo(orbitCenter);
    const limits = rexonanceOrbitLimits(front);
    controls.minDistance = limits.minDistance;
    controls.maxDistance = limits.maxDistance;
    controls.minPolarAngle = limits.minPolarAngle;
    controls.maxPolarAngle = limits.maxPolarAngle;
    // Panning and zoom-to-cursor may wander, but only within the figure.
    controls.cursor.copy(orbitCenter);
    controls.maxTargetRadius = Math.max(0.3, frameBox.getSize(new THREE.Vector3()).y * 0.36);
  };

  /** Settle any leftover damping before steering the camera ourselves. */
  const flushControls = () => {
    controls.autoRotate = false;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;
  };

  /** Keep the camera's bearing (a turning turntable, a resize) but fit the figure again. */
  const refit = () => {
    flushControls();
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 1e-8) direction.set(0, 0, 1);
    direction.normalize();
    camera.position.copy(fitAlong(direction.toArray() as [number, number, number]));
    controls.target.copy(orbitCenter);
    controls.update();
  };

  const goTo = (id: RexonanceViewId, animate: boolean) => {
    currentView = id;
    userMoved = false;
    const goal = viewGoal(id);
    flushControls();
    if (!animate || reducedMotion) {
      transition = null;
      camera.position.copy(goal);
      controls.target.copy(orbitCenter);
      controls.update();
    } else {
      transition = {
        from: camera.position.clone(),
        to: goal,
        targetFrom: controls.target.clone(),
        targetTo: orbitCenter.clone(),
        start: -1,
        duration: 0.95,
      };
    }
    canvas.dataset.view = id;
    options.onViewChange?.(id);
    settle = 3;
    request();
  };

  const setAutoRotate = (on: boolean) => {
    autoRotate = on;
    canvas.dataset.autoRotate = String(on);
    options.onAutoRotateChange?.(on);
    // A turning camera no longer rests on a preset.
    if (on && currentView !== null) {
      currentView = null;
      canvas.dataset.view = "";
      options.onViewChange?.(null);
    }
    last = 0;
    request();
  };

  /** A preset chosen by the visitor: the turntable stops so the view holds. */
  const showView = (id: RexonanceViewId) => {
    if (autoRotate) setAutoRotate(false);
    goTo(id, true);
  };

  const sphericalFrom = new THREE.Spherical();
  const sphericalTo = new THREE.Spherical();
  const offsetA = new THREE.Vector3();
  const offsetB = new THREE.Vector3();
  const stepTransition = (dt: number) => {
    if (!transition) return;
    if (transition.start < 0) transition.start = 0;
    transition.start += dt;
    const k = easeInOut(Math.min(1, transition.start / transition.duration));
    // Travel on the sphere (not through the figure), the shorter way round.
    offsetA.subVectors(transition.from, transition.targetFrom);
    offsetB.subVectors(transition.to, transition.targetTo);
    sphericalFrom.setFromVector3(offsetA);
    sphericalTo.setFromVector3(offsetB);
    let dTheta = sphericalTo.theta - sphericalFrom.theta;
    if (dTheta > Math.PI) dTheta -= Math.PI * 2;
    if (dTheta < -Math.PI) dTheta += Math.PI * 2;
    const spherical = new THREE.Spherical(
      THREE.MathUtils.lerp(sphericalFrom.radius, sphericalTo.radius, k),
      THREE.MathUtils.lerp(sphericalFrom.phi, sphericalTo.phi, k),
      sphericalFrom.theta + dTheta * k,
    );
    controls.target.lerpVectors(transition.targetFrom, transition.targetTo, k);
    camera.position.setFromSpherical(spherical).add(controls.target);
    if (k >= 1) transition = null;
  };

  const rootToView = new THREE.Matrix4();
  function draw(now: number) {
    frame = 0;
    if (!canDraw()) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const animating = Boolean(model) && !paused && !reducedMotion;
    if (animating) time += dt;
    const motionAmount = reducedMotion ? 0 : 1;
    uniforms.rxTime.value = time;
    uniforms.rxMotion.value = motionAmount;
    uniforms.rxBreath.value = Math.sin((time * Math.PI * 2) / 4.8) * motionAmount;
    uniforms.rxPulse.value = Math.sin(time * 1.3) * motionAmount;
    motion?.update(time, motionAmount);
    controls.autoRotate = autoRotate && !paused && !transition && Boolean(model);
    stepTransition(dt);
    const moved = controls.update(dt || null);
    if (model) {
      figure.updateMatrixWorld(true);
      uniforms.rxRootMatrix.value.copy(model.matrixWorld);
      uniforms.rxRootInverse.value.copy(model.matrixWorld).invert();
    }
    camera.updateMatrixWorld();
    rootToView.multiplyMatrices(camera.matrixWorldInverse, uniforms.rxRootMatrix.value);
    uniforms.rxRootToView.value.setFromMatrix4(rootToView);
    glints?.update(time, motionAmount);
    composer.render(dt);
    frames++;
    canvas.dataset.frames = String(frames);
    if (animating || controls.autoRotate) {
      if (adaptive.sample(dt)) resize();
      if (dt > 0) canvas.dataset.fps = (1 / dt).toFixed(1);
    }
    if (animating || controls.autoRotate || transition || moved || settle-- > 0) request();
  }

  function resize() {
    if (disposed) return;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;
    dpr = rexonancePixelRatio(devicePixelRatio, width, height, quality, adaptive.scale);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(dpr);
    composer.setSize(width, height);
    backdrop.setSize(width * dpr, height * dpr);
    camera.aspect = width / height;
    const frameInsets = insets();
    const offsetY = rexonanceViewOffsetY(height, frameInsets);
    if (Math.abs(offsetY) > 0.5) camera.setViewOffset(width, height, 0, offsetY, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    backdrop.setCenter(0.5, 0.5 + (frameInsets.bottom - frameInsets.top) / 2);
    canvas.dataset.dpr = dpr.toFixed(2);
    applyLimits();
    if (!userMoved && !transition) {
      if (currentView) goTo(currentView, false);
      else refit();
    }
    settle = Math.max(settle, 4);
    request();
  }

  const onStart = () => {
    userMoved = true;
    transition = null;
    if (currentView !== null) {
      currentView = null;
      canvas.dataset.view = "";
      options.onViewChange?.(null);
    }
    if (autoRotate) setAutoRotate(false);
  };
  const onChange = () => {
    settle = Math.max(settle, 2);
    request();
  };
  controls.addEventListener("start", onStart);
  controls.addEventListener("change", onChange);

  const keyOffset = new THREE.Vector3();
  const keySpherical = new THREE.Spherical();
  const keydown = (event: KeyboardEvent) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_", "Home"];
    if (!keys.includes(event.key) || event.altKey || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    if (event.key === "Home") {
      showView(REXONANCE_DEFAULT_VIEW);
      return;
    }
    onStart();
    keyOffset.subVectors(camera.position, controls.target);
    keySpherical.setFromVector3(keyOffset);
    if (event.key === "ArrowLeft") keySpherical.theta -= 0.12;
    if (event.key === "ArrowRight") keySpherical.theta += 0.12;
    if (event.key === "ArrowUp") keySpherical.phi -= 0.1;
    if (event.key === "ArrowDown") keySpherical.phi += 0.1;
    if (["+", "="].includes(event.key)) keySpherical.radius *= 0.88;
    if (["-", "_"].includes(event.key)) keySpherical.radius *= 1.12;
    keySpherical.phi = THREE.MathUtils.clamp(
      keySpherical.phi,
      controls.minPolarAngle,
      controls.maxPolarAngle,
    );
    keySpherical.radius = THREE.MathUtils.clamp(
      keySpherical.radius,
      controls.minDistance,
      controls.maxDistance,
    );
    camera.position.copy(controls.target).add(keyOffset.setFromSpherical(keySpherical));
    settle = 20;
    request();
  };
  canvas.addEventListener("keydown", keydown);

  const visibility = () => {
    last = 0;
    if (document.hidden && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else request();
  };
  document.addEventListener("visibilitychange", visibility);
  const motionChange = () => {
    reducedMotion = motionQuery.matches;
    if (reducedMotion && autoRotate) setAutoRotate(false);
    last = 0;
    settle = 4;
    request();
  };
  motionQuery.addEventListener("change", motionChange);
  const contextLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    notify("error");
  };
  const contextRestored = () => {
    if (disposed) return;
    try {
      // Render-target contents (the PMREM room, the contact shadow) died with the context.
      const next = createStudioEnvironment(renderer);
      environment.dispose();
      environment = next;
      scene.environment = environment.texture;
      if (stage && model) stage.bake(renderer, scene, hidden());
      lost = false;
      last = 0;
      notify(model ? "ready" : "loading");
      resize();
    } catch (error) {
      console.error("Rexonance viewer could not restore its WebGL context", error);
      notify("error");
    }
  };
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  const resizer = new ResizeObserver(() => resize());
  resizer.observe(host);
  const intersection = new IntersectionObserver(
    ([entry]) => {
      inViewport = entry.isIntersecting;
      last = 0;
      if (!inViewport && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else request();
    },
    { rootMargin: "64px" },
  );
  intersection.observe(host);
  const hidden = () => [backdrop.mesh, ...(glints ? [glints.mesh] : [])];

  canvas.dataset.autoRotate = String(autoRotate);
  resize();
  notify("loading");

  // ---------------------------------------------------------------- loading
  const disposeTree = (root: THREE.Object3D) => {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    textures.forEach((texture) => texture.dispose());
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  };

  const fetchModel = async (url: string) => {
    const response = await fetch(url, { signal: abort.signal, cache: "no-cache" });
    if (!response.ok) throw new Error(`Rexonance model: HTTP ${response.status}`);
    // A compressed response's length is not the body's: progress then only approximates.
    const total = Number(response.headers.get("content-length")) || 0;
    if (!response.body || !total || !options.onProgress) return response.arrayBuffer();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      options.onProgress(Math.min(0.99, received / total));
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    options.onProgress(1);
    return bytes.buffer;
  };

  const loadScaleMap = (url: string) =>
    new Promise<THREE.Texture | null>((resolve) => {
      new THREE.TextureLoader().load(
        url,
        (texture) => resolve(texture),
        undefined,
        () => resolve(null),
      );
    });

  /** UVs for a crystal or ribbon exported without them: v from the end nearest the body
   * (the root) to the far end, u across. The authored UVs are always preferred. */
  const fallbackUv = (mesh: THREE.Mesh, bodyAxis: THREE.Vector3) => {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute("position");
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const size = box.getSize(new THREE.Vector3()).toArray();
    const order = [0, 1, 2].sort((a, b) => size[b] - size[a]);
    const along = order[0];
    const across = order[1];
    const local = mesh.worldToLocal(bodyAxis.clone());
    const lo = box.min.getComponent(along);
    const hi = box.max.getComponent(along);
    const flip =
      Math.abs(local.getComponent(along) - hi) < Math.abs(local.getComponent(along) - lo);
    const uv = new Float32Array(position.count * 2);
    const p = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i);
      const t = (p.getComponent(along) - lo) / Math.max(1e-6, hi - lo);
      const s =
        (p.getComponent(across) - box.min.getComponent(across)) / Math.max(1e-6, size[across]);
      uv[i * 2] = s;
      uv[i * 2 + 1] = flip ? 1 - t : t;
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  };

  const prepare = (root: THREE.Object3D) => {
    root.updateMatrixWorld(true);
    const all = new THREE.Box3();
    const body = new THREE.Box3();
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const box = new THREE.Box3().setFromObject(node);
      all.union(box);
      if (isRexonanceBody(node.name)) body.union(box);
    });
    if (all.isEmpty()) throw new Error("Rexonance model has no geometry");
    const axisBox = body.isEmpty() ? all : body;
    const axis = axisBox.getCenter(new THREE.Vector3());
    const heightM = all.max.y - all.min.y;
    // Feet on the floor, the body's axis on the turntable's.
    root.position.set(-axis.x, -all.min.y, -axis.z);
    figure.add(root);
    figure.updateMatrixWorld(true);
    frameBox.setFromObject(root);
    orbitCenter.set(0, frameBox.getCenter(new THREE.Vector3()).y, 0);
    lightTarget.position.copy(orbitCenter);
    uniforms.rxHeight.value = heightM;
    uniforms.rxChest.value.set(axis.x, all.min.y + heightM * 0.68, axis.z + 0.02);
    const bodyAxisWorld = new THREE.Vector3(0, frameBox.min.y + heightM * 0.55, 0);

    const anchors: GlintAnchor[] = [];
    let ribbonIndex = 0;
    const meshes: THREE.Mesh[] = [];
    const rootInverse = root.matrixWorld.clone().invert();
    const anchorPosition = new THREE.Vector3();
    root.traverse((node) => {
      const glint = readRexonanceGlint(node.name, node.userData);
      if (glint) {
        // An anchor exactly on the model's origin lost its placement in the export (a
        // mirrored empty without its transform): a star between the feet would be wrong.
        node.getWorldPosition(anchorPosition).applyMatrix4(rootInverse);
        if (anchorPosition.lengthSq() < 1e-10) stats.unplacedGlints.push(node.name);
        else anchors.push({ ...glint, node });
      }
      if (node instanceof THREE.Mesh) meshes.push(node);
    });
    for (const mesh of meshes) {
      const original = mesh.material as THREE.Material;
      const family: RexonanceFamily | null = rexonanceFamilyOf(original?.name, mesh.name);
      const geometry = mesh.geometry as THREE.BufferGeometry;
      stats.meshes++;
      stats.triangles += (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
      if (!family) {
        stats.unknownMaterials.push(original?.name ?? mesh.name);
        continue;
      }
      stats.families[family] = (stats.families[family] ?? 0) + 1;
      const ribbon = isRexonanceRibbon(mesh.name);
      if (ribbon) stats.ribbons++;
      if ((family === "Crystal" || ribbon) && !geometry.getAttribute("uv"))
        fallbackUv(mesh, bodyAxisWorld);
      if (family === "Crystal") {
        const color = geometry.getAttribute("color");
        if (color) geometry.setAttribute("rxTint", color);
        else {
          const count = geometry.getAttribute("position").count;
          const tint = new Float32Array(count * 4);
          for (let i = 0; i < count; i++) tint.set([0.25, 0.5, 0.5, 1], i * 4);
          geometry.setAttribute("rxTint", new THREE.BufferAttribute(tint, 4));
        }
      }
      mesh.material = createRexonanceMaterial(family, uniforms, {
        ribbon,
        phase: ribbon ? ribbonIndex++ * 1.9 : 0,
        crystalDetail: quality.crystalDetail,
        scales: true,
      });
      original?.dispose();
      if (ribbon) mesh.frustumCulled = false;
    }
    stats.glints = anchors.length;
    if (anchors.length) {
      const jewels = meshes.filter((mesh) =>
        /^RX_(Gem|Crystal|Glow|Visor)$/u.test((mesh.material as THREE.Material).name),
      );
      estimateGlintNormals(anchors, jewels, meshes, new THREE.Vector3(0, 0, 0));
      glints = createGlints(anchors);
      scene.add(glints.mesh);
    }
    motion = createRexonanceMotion(root);
    stats.tailPivots = motion.tailPivots;
    stats.core = motion.hasCore;
    const radius = Math.max(
      0.9,
      Math.max(frameBox.max.x - frameBox.min.x, frameBox.max.z - frameBox.min.z) * 0.62,
    );
    stage = createStage(radius, quality.shadowSize);
    scene.add(stage.group);
    stage.bake(renderer, scene, hidden());
    canvas.dataset.meshes = String(stats.meshes);
    canvas.dataset.triangles = String(Math.round(stats.triangles));
    canvas.dataset.glints = String(stats.glints);
    canvas.dataset.tailPivots = String(stats.tailPivots);
    canvas.dataset.families = Object.entries(stats.families)
      .map(([family, count]) => `${family}:${count}`)
      .join(",");
  };

  void (async () => {
    try {
      const modelUrl = options.modelUrl ?? REXONANCE_MODEL_URL;
      const [data, texture] = await Promise.all([
        options.modelData ?? fetchModel(modelUrl),
        loadScaleMap(options.scaleMapUrl ?? REXONANCE_SCALE_MAP_URL),
      ]);
      if (disposed) {
        texture?.dispose();
        return;
      }
      if (texture) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.NoColorSpace;
        texture.anisotropy = Math.min(quality.anisotropy, renderer.capabilities.getMaxAnisotropy());
        texture.needsUpdate = true;
        scaleMap = texture;
        uniforms.rxScaleMap.value = texture;
      }
      stats.bytes = data.byteLength;
      canvas.dataset.assetBytes = String(data.byteLength);
      const used = glbExtensionsUsed(data);
      const loader = new GLTFLoader();
      if (used.includes("EXT_meshopt_compression")) {
        // Imported on demand: the decoder compiles WebAssembly as soon as it loads.
        const { MeshoptDecoder } = await import("three/addons/libs/meshopt_decoder.module.js");
        await MeshoptDecoder.ready;
        loader.setMeshoptDecoder(MeshoptDecoder);
      }
      let draco: GuardianDracoLoader | null = null;
      if (used.includes("KHR_draco_mesh_compression")) {
        draco = new GuardianDracoLoader(abort.signal, new THREE.LoadingManager());
        draco.setDecoderPath(options.dracoDecoderPath ?? REXONANCE_DRACO_DECODER_PATH);
        draco.setWorkerLimit(quality.dracoWorkers);
        // Draco's plain-JS build decodes where WebAssembly may not be compiled.
        if (!webAssemblyCompiles())
          (draco as unknown as { decoderConfig: { type: string } }).decoderConfig = { type: "js" };
        loader.setDRACOLoader(draco);
      }
      const base = new URL(".", new URL(modelUrl, document.baseURI)).href;
      let gltf: GLTF;
      try {
        gltf = await loader.parseAsync(data, base);
        draco?.commit();
      } finally {
        draco?.dispose();
      }
      if (disposed) {
        disposeTree(gltf.scene);
        return;
      }
      model = gltf.scene;
      model.name = "RexonanceModel";
      prepare(model);
      if (disposed) return;
      try {
        await renderer.compileAsync(scene, camera);
      } catch {
        // Compiling on first draw instead is slower, never wrong.
      }
      if (disposed) return;
      stats.loadMs = Math.round(performance.now() - startedAt);
      resize();
      goTo(currentView ?? REXONANCE_DEFAULT_VIEW, false);
      if (autoRotate) setAutoRotate(true);
      notify(lost ? "error" : "ready");
      request();
    } catch (error) {
      if (disposed || (error instanceof DOMException && error.name === "AbortError")) return;
      console.error("Rexonance viewer could not load its model", error);
      notify("error");
    }
  })();

  return {
    setView(view) {
      if (!disposed) showView(view);
    },
    resetView() {
      if (!disposed) showView(REXONANCE_DEFAULT_VIEW);
    },
    setAutoRotate(on) {
      // A visitor may ask for the turntable even with reduced motion; it never starts itself.
      if (disposed || on === autoRotate) return;
      if (on) {
        flushControls();
        userMoved = false;
      }
      setAutoRotate(on);
    },
    setPaused(next) {
      if (disposed || paused === next) return;
      paused = next;
      canvas.dataset.paused = String(next);
      last = 0;
      settle = 2;
      request();
    },
    setBlocked(next) {
      if (disposed || blocked === next) return;
      blocked = next;
      controls.enabled = !next;
      last = 0;
      if (next && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else request();
    },
    setInsets(next) {
      insetsOverride = next;
      resize();
    },
    getDiagnostics() {
      return {
        ...stats,
        tier,
        dpr,
        adaptiveScale: adaptive.scale,
        view: currentView,
        autoRotate,
        paused,
        reducedMotion,
        camera: camera.position.toArray(),
        target: controls.target.toArray(),
        frameBox: [frameBox.min.toArray(), frameBox.max.toArray()],
        scaleMap: Boolean(scaleMap),
        programs: renderer.info.programs?.length ?? 0,
        drawCalls: renderer.info.render.calls,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      cancelAnimationFrame(frame);
      frame = 0;
      resizer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      motionQuery.removeEventListener("change", motionChange);
      canvas.removeEventListener("keydown", keydown);
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("change", onChange);
      controls.dispose();
      motion?.reset();
      glints?.dispose();
      stage?.dispose();
      backdrop.dispose();
      if (model) disposeTree(model);
      scaleMap?.dispose();
      flatNormal.dispose();
      environment.dispose();
      bloom.dispose();
      output.dispose();
      fxaa?.dispose();
      renderPass.dispose();
      // Disposes both of its targets (the MSAA HDR target and its clone).
      composer.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
