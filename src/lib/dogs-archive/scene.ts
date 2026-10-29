import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FXAAPass } from "three/addons/postprocessing/FXAAPass.js";
import { createBreathJet, createFlameMantle, FIRE_TIERS } from "./fire.ts";
import { createInkBackdrop } from "./backdrop.ts";
import { createInkEnvironment } from "./environment.ts";
import { createNoiseVolume, NOISE_VOLUME_BYTES } from "./noise-volume.ts";
import { GuardianInkGradePass } from "./post.ts";
import { GuardianVolumePass } from "./volume-pass.ts";
import {
  applyGuardianInkSurface,
  createGuardianSurfaceUniforms,
  type GuardianSurfaceHandles,
} from "./surface.ts";
import {
  describeGuardianPoses,
  guardianPoseFadeSeconds,
  type GuardianPose,
  type GuardianPoseManifest,
} from "./poses.ts";

import { GUARDIAN_REFERENCE_DIRECTIONS, type GuardianLook } from "./look.ts";

export type { GuardianPose } from "./poses.ts";
export type { GuardianLook } from "./look.ts";
import {
  createGuardianSculptureLighting,
  prepareGuardianMouthSpill,
  type GuardianSurfaceAudit,
  type GuardianLightingPalette,
} from "./lighting.ts";
import { GuardianDracoLoader } from "./draco.ts";

export type GuardianLightingProfile = "legacy" | "sculpture";
/** Counts, ray-march steps and pixel ratio only. Every tier keeps the full motion. */
export type GuardianQualityTier = "high" | "mobile" | "low";

export function detectGuardianQualityTier(nav: Navigator, mobile: boolean): GuardianQualityTier {
  if (!mobile) return "high";
  const cores = nav.hardwareConcurrency || 0;
  const memory = (nav as Navigator & { deviceMemory?: number }).deviceMemory;
  const connection = (nav as Navigator & { connection?: { saveData?: boolean } }).connection;
  const constrained =
    connection?.saveData === true ||
    (memory !== undefined && memory <= 3) ||
    (cores > 0 && cores <= 4 && /Android/i.test(nav.userAgent));
  return constrained ? "low" : "mobile";
}

export type GuardianStatus = "loading" | "ready" | "error";
export type GuardianScene = {
  breathe(): void;
  /** Selectable poses from the model's clips (Rest only on a Rest/Exhale model). */
  listPoses(): GuardianPose[];
  getPose(): string;
  /** Crossfade to a pose; the breath, float and fire keep working on top of it. */
  setPose(name: string): boolean;
  resetView(): void;
  togglePause(): boolean;
  setBlocked(blocked: boolean): void;
  setLightingProfile(profile: GuardianLightingProfile): void;
  setLightingPalette(palette: GuardianLightingPalette): void;
  getDiagnostics(): Record<string, unknown>;
  dispose(): void;
};
type Options = {
  onStatus?: (status: GuardianStatus) => void;
  onActionChange?: (active: boolean) => void;
  onPoseChange?: (name: string) => void;
  /** Internal, trusted preview inputs. Public DogViewer supplies none. */
  modelUrl?: string;
  manifestUrl?: string | null;
  lightingProfile?: GuardianLightingProfile;
  lightingPalette?: GuardianLightingPalette;
  qualityTier?: GuardianQualityTier;
  effects?: boolean;
  diagnostics?: boolean;
  /** Test-only reference look (see look.ts). The public page passes the parsed URL flag. */
  look?: GuardianLook;
};
type PoseManifest = GuardianPoseManifest & {
  poses?: {
    rest?: Record<string, { quaternion?: number[] }>;
    exhale?: Record<string, { quaternion?: number[] }>;
  };
};
type PoseLayer = GuardianPose & {
  action: THREE.AnimationAction;
  weight: number;
  from: number;
  to: number;
};
const ease = (a: number, b: number, t: number) => THREE.MathUtils.smoothstep(t, a, b);

// Every allocation belongs to this surface. Removing the fifth dog aborts its
// request and releases its maps, buffers, context, listeners and animation loop.
export function createGuardianScene(host: HTMLElement, options: Options = {}): GuardianScene {
  const bootStartedAt = performance.now();
  const abort = new AbortController();
  const gltfManager = new THREE.LoadingManager();
  let dracoLoader: GuardianDracoLoader | null = null;
  let dracoStats: ReturnType<GuardianDracoLoader["getDiagnostics"]> | null = null;
  const preserveAuthoredMaterials = Boolean(options.modelUrl);
  const loading = {
    phase: "boot",
    fetchMs: 0,
    hashAndManifestMs: 0,
    parseMs: 0,
    readyMs: 0,
    firstFrameTotalMs: 0,
    firstFrameSubmitMs: 0,
  };
  let captureFirstFrame = false;
  const releaseDecoder = (commit: boolean) => {
    if (!dracoLoader) return;
    if (commit) dracoLoader.commit();
    dracoLoader.dispose();
    dracoStats = dracoLoader.getDiagnostics();
    dracoLoader = null;
  };
  const canvas = document.createElement("canvas");
  canvas.className = "dogs-viewer__canvas";
  canvas.dataset.engineVersion = preserveAuthoredMaterials
    ? "guardian-20261029-ink"
    : "guardian-20261028-r14";
  canvas.dataset.lightingProfile = "legacy";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "第五の犬の立体模型。ドラッグで全方向へ回転、ピンチで拡大。矢印キーで回転、プラスとマイナスで拡大縮小、Homeで視点を戻す。",
  );
  const mobile = matchMedia("(pointer: coarse)").matches;
  const tier = options.qualityTier ?? detectGuardianQualityTier(navigator, mobile);
  const fireTier = FIRE_TIERS[tier];
  canvas.dataset.qualityTier = tier;
  // The reference look: creature alone on a white ground, even neutral light, one of the
  // four turnaround directions. Fire, backdrop and grade are off; the materials are judged.
  const look: GuardianLook = options.look ?? { look: "page" };
  const referenceLook = look.look === "reference";
  const effectsEnabled = options.effects !== false && !referenceLook;
  canvas.dataset.look = look.look;
  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;
  // Every frame goes through the composer, so the default framebuffer needs no multisampling.
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral keeps the fire's pale greens green; ACES rolled every wash to cream-white.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.12;
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(referenceLook ? "#f4f4f1" : "#020906");
  scene.fog = referenceLook ? null : new THREE.FogExp2("#03100a", 0.009);
  const noise = createNoiseVolume();
  const backdrop = createInkBackdrop(noise);
  backdrop.mesh.visible = !referenceLook;
  scene.add(backdrop.mesh);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.08, 120);
  const viewDirection = (
    look.look === "reference"
      ? new THREE.Vector3(...GUARDIAN_REFERENCE_DIRECTIONS[look.view])
      : new THREE.Vector3(9.5, 2.3, 14.8)
  ).normalize();
  const viewRight = new THREE.Vector3().crossVectors(camera.up, viewDirection).normalize();
  const viewUp = new THREE.Vector3().crossVectors(viewDirection, viewRight).normalize();
  const viewBounds = new THREE.Box3(new THREE.Vector3(-3, -3.4, -2), new THREE.Vector3(3, 3.4, 2));
  const fitCorner = new THREE.Vector3();
  let environmentTarget = createInkEnvironment(renderer);
  scene.environment = referenceLook ? null : environmentTarget.texture;
  scene.environmentIntensity = 0.34;
  const composer = new EffectComposer(renderer);
  // Depth textures replace the targets' depth renderbuffers (no extra memory): the breath
  // volume marches against the scene depth and the grade draws ink contours from it. The
  // composer alternates its targets between frames, so both carry one.
  for (const target of [composer.renderTarget1, composer.renderTarget2]) {
    target.depthTexture = new THREE.DepthTexture(1, 1);
    target.depthTexture.name = `${target.texture.name}.depth`;
  }
  const renderPass = new RenderPass(scene, camera);
  // Only true emitters bloom (the lattice face, the breath's white core): pale bone sits just
  // under 1.0 and must not halo.
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.6, 1.7);
  const output = new OutputPass();
  const antialiasPass = tier === "low" ? null : new FXAAPass();
  const grade = new GuardianInkGradePass(camera);
  const volumeScene = new THREE.Scene();
  volumeScene.name = "GuardianBreathVolumeScene";
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.minPolarAngle = 0.001;
  controls.maxPolarAngle = Math.PI - 0.001;
  controls.minDistance = 5;
  controls.maxDistance = 23;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.75;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
  const floating = new THREE.Group();
  floating.name = "GuardianFloatingRoot";
  scene.add(floating);
  const legacyLights = new THREE.Group();
  legacyLights.name = "GuardianLegacyLightRig";
  scene.add(legacyLights);
  legacyLights.add(new THREE.HemisphereLight(0xc6ead5, 0x0a1b11, 1.05));
  const key = new THREE.DirectionalLight(0xd4ffe0, 2.7);
  key.position.set(5, 8, 8);
  legacyLights.add(key);
  const rim = new THREE.DirectionalLight(0x52d98e, 3.6);
  rim.position.set(-6, 3, -7);
  legacyLights.add(rim);
  const side = new THREE.DirectionalLight(0x647caa, 1.1);
  side.position.set(-7, -1, 5);
  legacyLights.add(side);
  const breathLight = new THREE.PointLight(0x79ff8d, 0, 12, 1.6);
  scene.add(breathLight);
  // A small light inside the head keeps the lattice's glow anchored in the skin around it.
  const faceLight = new THREE.PointLight(0x8dffb0, 0, 2.2, 2);
  faceLight.name = "GuardianFaceGlow";
  scene.add(faceLight);
  const breath = createBreathJet(noise, fireTier);
  volumeScene.add(breath.mesh);
  scene.add(breath.sparks);
  const volumePass = new GuardianVolumePass(
    volumeScene,
    camera,
    breath.uniforms,
    tier === "high" ? 0.5 : 0.4,
  );
  grade.depthSource = volumePass;
  composer.addPass(renderPass);
  composer.addPass(volumePass);
  composer.addPass(bloom);
  composer.addPass(output);
  if (antialiasPass) composer.addPass(antialiasPass);
  grade.enabled = !referenceLook;
  composer.addPass(grade);
  const surfaceUniforms = createGuardianSurfaceUniforms(noise);
  if (referenceLook) {
    // Even light judges the albedo: no green rim or transmission glow from an absent fire.
    surfaceUniforms.uRimColor.value.setRGB(0.88, 0.93, 0.88);
    surfaceUniforms.uTransColor.value.setRGB(0.18, 0.24, 0.2);
    surfaceUniforms.uRimStrength.value = 0.45;
    surfaceUniforms.uTransStrength.value = 0.25;
  }
  let inkSurface: GuardianSurfaceHandles | null = null;
  const rimWorld = new THREE.Vector3(),
    keyWorld = new THREE.Vector3(),
    facePosition = new THREE.Vector3();
  const bodyBounds = new THREE.Box3(),
    floatingInverse = new THREE.Matrix4();
  const surfaceTime = { value: 0 },
    surfaceStrength = { value: 0 };
  let model: THREE.Object3D | null = null;
  let lightingProfile: GuardianLightingProfile = "legacy";
  let lightingPalette: GuardianLightingPalette =
    options.lightingPalette ?? (referenceLook ? "reference" : "forest");
  let sculptureLighting: ReturnType<typeof createGuardianSculptureLighting> | null = null;
  let restoreMouthSpill: (() => void) | null = null;
  let surfaceAudit: GuardianSurfaceAudit | null = null;
  let poseAvailable = !options.modelUrl;
  let poseSource = poseAvailable ? "procedural-fallback" : "none";
  let geometryBytesEstimated = 0,
    materialTextureBytesEstimated = 0;
  let skinnedMeshes = 0,
    skeletonsCount = 0,
    morphMeshes = 0;
  let animationSummary: { name: string; tracks: number }[] = [];
  if (options.diagnostics) renderer.info.autoReset = false;
  let mantle: ReturnType<typeof createFlameMantle> | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let exhaleAction: THREE.AnimationAction | null = null;
  // Pose layers crossfade by weight (they always sum to one); the breath is an additive
  // delta from Rest layered on top, so it plays from any pose.
  const poseLayers: PoseLayer[] = [];
  let currentPose = "Rest",
    poseClock = 0,
    poseFadeStart = -1,
    poseFadeSeconds = 1.2;
  let mouth: THREE.Object3D | undefined, aim: THREE.Object3D | undefined;
  const joints: {
    node: THREE.Object3D;
    base: THREE.Quaternion;
    exhale: THREE.Quaternion;
    applied: THREE.Quaternion;
    kind: string;
    phase: number;
  }[] = [];
  const origin = new THREE.Vector3(),
    direction = new THREE.Vector3(),
    aimPosition = new THREE.Vector3(),
    toCamera = new THREE.Vector3(),
    steerPerp = new THREE.Vector3();
  const sway = new THREE.Quaternion(),
    euler = new THREE.Euler(),
    spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();
  let disposed = false,
    paused = false,
    lost = false,
    inViewport = true,
    blocked = false;
  let userOrbit = false;
  let frame = 0,
    settleFrames = 0,
    last = 0,
    time = 0,
    actionTime = -1,
    dpr = 1;
  let pose = 0;
  let measuredFrames = 0,
    measuredSeconds = 0;
  const notify = (status: GuardianStatus) => {
    if (!disposed) options.onStatus?.(status);
  };

  const disposeObject = (root: THREE.Object3D) => {
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    const skeletons = new Set<THREE.Skeleton>();
    root.traverse((node) => {
      if (!(
        node instanceof THREE.Mesh ||
        node instanceof THREE.Points ||
        node instanceof THREE.Line
      ))
        return;
      if (node instanceof THREE.InstancedMesh) node.dispose();
      if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
      geometries.add(node.geometry);
      (Array.isArray(node.material) ? node.material : [node.material]).forEach((material) => {
        materials.add(material);
        Object.values(material).forEach((value) => {
          if (value instanceof THREE.Texture) textures.add(value);
        });
      });
    });
    textures.forEach((texture) => {
      const image = texture.image;
      if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
      texture.dispose();
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    skeletons.forEach((skeleton) => skeleton.dispose());
  };
  const parseAbortably = async (task: Promise<GLTF>) => {
    let rejectAbort: () => void = () => {};
    const abortTask = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(new DOMException("Guardian parse cancelled", "AbortError"));
      if (abort.signal.aborted) rejectAbort();
      else abort.signal.addEventListener("abort", rejectAbort, { once: true });
    });
    const ownedTask = task.then((result) => {
      if (disposed || abort.signal.aborted) {
        disposeObject(result.scene);
        throw new DOMException("Guardian late parse disposed", "AbortError");
      }
      return result;
    });
    try {
      return await Promise.race([ownedTask, abortTask]);
    } finally {
      abort.signal.removeEventListener("abort", rejectAbort);
    }
  };
  const canDraw = () => !disposed && !lost && !blocked && inViewport && !document.hidden;
  const request = () => {
    if (!frame && canDraw()) frame = requestAnimationFrame(draw);
  };
  const resetView = () => {
    userOrbit = false;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)),
      tanH = tanV * camera.aspect;
    let distance = 0;
    for (const x of [viewBounds.min.x, viewBounds.max.x])
      for (const y of [viewBounds.min.y, viewBounds.max.y])
        for (const z of [viewBounds.min.z, viewBounds.max.z]) {
          fitCorner.set(x, y + 0.1, z);
          const depth = fitCorner.dot(viewDirection);
          distance = Math.max(
            distance,
            Math.abs(fitCorner.dot(viewRight)) / (tanH * 0.9) + depth,
            Math.abs(fitCorner.dot(viewUp)) / (tanV * 0.9) + depth,
          );
        }
    distance = Math.max(8, distance);
    camera.position.copy(viewDirection).multiplyScalar(distance);
    controls.maxDistance = Math.max(23, distance * 1.8);
    controls.target.set(0, -0.1, 0);
    controls.update();
    settleFrames = 24;
    request();
  };
  function draw(now: number) {
    frame = 0;
    if (!canDraw()) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    if (last && model) {
      measuredFrames++;
      measuredSeconds += (now - last) / 1000;
      if (measuredFrames >= 30) {
        canvas.dataset.fps = (measuredFrames / measuredSeconds).toFixed(1);
        measuredFrames = 0;
        measuredSeconds = 0;
      }
    }
    last = now;
    // Reduced motion: only what the visitor asked for moves (the breath, a chosen pose).
    const poseMoving =
      poseFadeStart >= 0 || Boolean(poseLayers.find((layer) => layer.name === currentPose)?.loop);
    const animate =
      Boolean(model) && !paused && (!reducedMotion || actionTime >= 0 || poseMoving);
    if (animate) time += dt;
    if (!paused) poseClock += dt;
    if (!paused && actionTime >= 0) {
      actionTime += dt;
      if (actionTime > 8.4) {
        actionTime = -1;
        options.onActionChange?.(false);
      }
    }
    const a = Math.max(0, actionTime);
    const anticipation = actionTime < 0 ? 0 : ease(0, 0.32, a) * (1 - ease(0.45, 1.05, a));
    const actionPose = actionTime < 0 ? 0 : ease(0.45, 1.8, a) * (1 - ease(6.35, 8.35, a));
    pose = actionPose;
    const strength = actionTime < 0 ? 0 : ease(1.45, 2.4, a) * (1 - ease(6.1, 7.25, a));
    surfaceTime.value = time;
    surfaceStrength.value = Math.max(strength, anticipation * 0.2);
    if (mixer) {
      // Undo only our secondary offset. Resetting a bound node to its base
      // here breaks AnimationMixer's unchanged-value cache at a held pose.
      for (const joint of joints) {
        joint.node.quaternion.multiply(joint.applied.invert()).normalize();
        joint.applied.identity();
      }
      if (poseFadeStart >= 0) {
        const k = ease(0, 1, (poseClock - poseFadeStart) / poseFadeSeconds);
        for (const layer of poseLayers) {
          layer.weight = layer.from + (layer.to - layer.from) * k;
          layer.action.setEffectiveWeight(layer.weight);
        }
        if (k >= 1) poseFadeStart = -1;
      }
      // Pose weights sum to one; the additive breath carries the head, jaw and body offsets.
      exhaleAction?.setEffectiveWeight(actionPose);
      mixer.update(animate ? dt : 0);
    }
    for (const joint of joints) {
      if (!mixer) {
        joint.node.quaternion.copy(joint.base).slerp(joint.exhale, actionPose);
        joint.applied.identity();
      }
      if (!preserveAuthoredMaterials && joint.kind === "head" && anticipation > 0) {
        sway.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -0.055 * anticipation);
        joint.node.quaternion.multiply(sway);
        joint.applied.multiply(sway);
      }
      if (joint.kind === "tentacle" && !reducedMotion) {
        const amp = 0.018 + actionPose * 0.028;
        euler.set(
          Math.sin(time * 0.58 + joint.phase) * amp,
          Math.cos(time * 0.43 + joint.phase * 2) * amp,
          Math.sin(time * 0.71 + joint.phase) * amp,
        );
        sway.setFromEuler(euler);
        // Record the secondary offset so the next frame can remove it without
        // disturbing AnimationMixer's held-pose cache.
        joint.node.quaternion.multiply(sway);
        joint.applied.multiply(sway);
      }
    }
    if (!reducedMotion) {
      floating.position.y = Math.sin(time * 0.63) * 0.105;
      floating.rotation.z = Math.sin(time * 0.31) * 0.012;
      floating.rotation.y = Math.sin(time * 0.21) * 0.023;
    } else {
      floating.position.y = 0;
      floating.rotation.set(0, 0, 0);
    }
    floating.position.z = -0.09 * anticipation;
    if (model) {
      floating.updateMatrixWorld(true);
      if (mouth && aim) {
        mouth.getWorldPosition(origin);
        aim.getWorldPosition(aimPosition);
        direction.subVectors(aimPosition, origin).normalize();
      } else {
        // Only a legacy asset can reach this fallback. The shipped Blender
        // model carries both sockets, whose delta follows every head pose.
        origin.set(0, 0.15, 2).applyMatrix4(floating.matrixWorld);
        direction.set(0, -0.12, 1).transformDirection(floating.matrixWorld);
      }
      const effectStrength = effectsEnabled ? strength : 0;
      // The painting composes the breath sideways. A jet aimed within 60° of the camera would
      // put its cloud between the viewer and the body, so the jet (with its sparks, mouth light
      // and backdrop mass) is steered away from the view axis; the head still opens as authored.
      toCamera.subVectors(camera.position, origin).normalize();
      const toward = direction.dot(toCamera);
      if (toward > 0.5) {
        steerPerp.copy(direction).addScaledVector(toCamera, -toward);
        if (steerPerp.lengthSq() < 1e-6)
          steerPerp.set(1, 0, 0).applyQuaternion(camera.quaternion);
        steerPerp.normalize();
        direction.copy(toCamera).multiplyScalar(0.5).addScaledVector(steerPerp, Math.sqrt(0.75));
      }
      breath.update(time, effectStrength, origin, direction, dpr);
      canvas.dataset.mouthDirection = direction
        .toArray()
        .map((value) => value.toFixed(3))
        .join(",");
      const headJoint = joints.find((joint) => joint.kind === "head");
      if (headJoint)
        canvas.dataset.headQuaternion = headJoint.node.quaternion
          .toArray()
          .map((value) => value.toFixed(4))
          .join(",");
      // Candela: pale bone sits just under the bloom threshold, so the mouth light stays small
      // (the fire itself carries the brightness, as in the breath painting).
      breathLight.position.copy(origin).addScaledVector(direction, 0.6);
      breathLight.intensity = effectStrength * 1.6;
      facePosition
        .copy(origin)
        .addScaledVector(direction, -0.3)
        .addScaledVector(THREE.Object3D.DEFAULT_UP, 0.4);
      faceLight.position.copy(facePosition);
      // The face leaf's axis for the lattice glow: HeadPivot (base) toward the mouth (tip).
      if (headJoint) headJoint.node.getWorldPosition(surfaceUniforms.uFaceBase.value);
      else surfaceUniforms.uFaceBase.value.copy(origin).addScaledVector(direction, -1.2);
      surfaceUniforms.uFaceTip.value.copy(origin);
      faceLight.intensity =
        0.5 + 0.25 * Math.sin(time * 1.35) + anticipation * 0.9 + effectStrength * 0.5;
      inkSurface?.update(time, effectStrength, anticipation);
    }
    controls.update();
    sculptureLighting?.update(time, pose);
    camera.updateMatrixWorld();
    if (model) {
      const effectStrength = effectsEnabled ? strength : 0;
      mantle?.update(time, effectStrength, anticipation, dpr, camera);
      backdrop.update(
        time,
        effectStrength,
        anticipation,
        camera,
        bodyBounds,
        floating.matrixWorld,
        origin,
        direction,
      );
      surfaceUniforms.uTime.value = time;
      surfaceUniforms.uStrength.value = effectStrength;
      surfaceUniforms.uAnticipation.value = anticipation;
      if (sculptureLighting) {
        sculptureLighting.rimDirection(rimWorld);
        sculptureLighting.keyDirection(keyWorld);
      } else {
        rimWorld.set(-6, 3, -7).normalize();
        keyWorld.set(5, 8, 8).normalize();
      }
      surfaceUniforms.uRimDir.value.copy(rimWorld).transformDirection(camera.matrixWorldInverse);
      surfaceUniforms.uKeyDir.value.copy(keyWorld).transformDirection(camera.matrixWorldInverse);
    }
    if (options.diagnostics) renderer.info.reset();
    const submitStarted = captureFirstFrame ? performance.now() : 0;
    composer.render();
    if (captureFirstFrame && model) {
      loading.firstFrameSubmitMs = performance.now() - submitStarted;
      loading.firstFrameTotalMs = performance.now() - bootStartedAt;
      captureFirstFrame = false;
    }
    canvas.dataset.pose = pose.toFixed(3);
    canvas.dataset.action = actionTime >= 0 ? "exhale" : "rest";
    if (animate || settleFrames-- > 0) request();
  }
  const resize = () => {
    if (disposed) return;
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    dpr = Math.min(
      devicePixelRatio || 1,
      tier === "low" ? 1.2 : mobile ? 1.4 : 1.75,
      Math.sqrt((tier === "low" ? 1200000 : 1850000) / (width * height)),
    );
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(dpr);
    composer.setSize(width, height);
    backdrop.setSize(width * dpr, height * dpr);
    grade.uniforms.uResolution.value.set(width * dpr, height * dpr);
    grade.uniforms.uHalo.value = 9 * dpr;
    // Resource estimate for device reports: two half-float composer targets with their depth
    // textures, the half-float breath volume target, the bloom mip chain, the shadow map and
    // the noise volume. Not a driver measure.
    const pixels = Math.round(width * dpr) * Math.round(height * dpr);
    const shadowSide = tier === "high" ? 1536 : 768;
    const volumeScale = tier === "high" ? 0.5 : 0.4;
    canvas.dataset.renderTargetBytes = String(
      Math.round(
        pixels * (2 * 8 + 2 * 4) +
          pixels * volumeScale * volumeScale * 8 +
          256 * 256 * 8 * 10 +
          shadowSide * shadowSide * 8 +
          NOISE_VOLUME_BYTES,
      ),
    );
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (!userOrbit) resetView();
    request();
  };
  const setLightingProfile = (next: GuardianLightingProfile) => {
    if (disposed || (next === lightingProfile && (next === "legacy" || sculptureLighting))) return;
    sculptureLighting?.dispose();
    sculptureLighting = null;
    restoreMouthSpill?.();
    restoreMouthSpill = null;
    legacyLights.visible = next === "legacy";
    if (next === "sculpture") {
      sculptureLighting = createGuardianSculptureLighting(renderer, scene, floating, {
        mobile,
        palette: lightingPalette,
      });
      restoreMouthSpill = prepareGuardianMouthSpill(breathLight);
      if (model) surfaceAudit = sculptureLighting.setModel(model);
    }
    lightingProfile = next;
    canvas.dataset.lightingProfile = next;
    measuredFrames = 0;
    measuredSeconds = 0;
    request();
  };
  const syncLightingModel = () => {
    if (model && sculptureLighting) surfaceAudit = sculptureLighting.setModel(model);
  };
  const setLightingPalette = (next: GuardianLightingPalette) => {
    if (disposed) return;
    lightingPalette = next;
    sculptureLighting?.setPalette(next);
    measuredFrames = 0;
    measuredSeconds = 0;
    request();
  };
  const change = () => {
    settleFrames = 25;
    request();
  };
  const controlStart = () => {
    userOrbit = true;
  };
  controls.addEventListener("change", change);
  controls.addEventListener("start", controlStart);
  const keydown = (event: KeyboardEvent) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_", "Home"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") {
      resetView();
      return;
    }
    userOrbit = true;
    offset.subVectors(camera.position, controls.target);
    spherical.setFromVector3(offset);
    if (event.key === "ArrowLeft") spherical.theta -= 0.11;
    if (event.key === "ArrowRight") spherical.theta += 0.11;
    if (event.key === "ArrowUp") spherical.phi -= 0.11;
    if (event.key === "ArrowDown") spherical.phi += 0.11;
    if (["+", "="].includes(event.key)) spherical.radius *= 0.9;
    if (["-", "_"].includes(event.key)) spherical.radius *= 1.1;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.001, Math.PI - 0.001);
    spherical.radius = THREE.MathUtils.clamp(
      spherical.radius,
      controls.minDistance,
      controls.maxDistance,
    );
    camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
    controls.update();
    change();
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
      // A render-target environment has no CPU pixels to upload after context
      // loss. Rebuild it rather than silently resuming with black reflections.
      const nextEnvironment = createInkEnvironment(renderer);
      environmentTarget.dispose();
      environmentTarget = nextEnvironment;
      scene.environment = referenceLook ? null : environmentTarget.texture;
      sculptureLighting?.restoreAfterContextLoss();
      lost = false;
      last = 0;
      notify(model ? "ready" : "loading");
      resize();
      request();
    } catch (error) {
      console.error("Guardian context restoration failed", error);
      notify("error");
    }
  };
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  const motionChange = () => {
    reducedMotion = motionQuery.matches;
    last = 0;
    request();
  };
  motionQuery.addEventListener("change", motionChange);
  const resizer = new ResizeObserver(resize);
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
    { rootMargin: "80px" },
  );
  intersection.observe(host);
  setLightingProfile(options.lightingProfile ?? "legacy");
  resetView();
  resize();
  notify("loading");
  void (async () => {
    try {
      const requestOptions: RequestInit = {
        signal: abort.signal,
        cache: import.meta.env.DEV ? "no-store" : "no-cache",
      };
      const fetchStarted = performance.now();
      loading.phase = "fetch";
      const modelUrl = options.modelUrl ?? "/dogs-archive-20261029/guardian-v3.glb";
      const manifestUrl =
        options.manifestUrl === undefined
          ? options.modelUrl
            ? null
            : "/dogs-archive-20261029/model-manifest.json"
          : options.manifestUrl;
      const manifestRequest = manifestUrl
        ? fetch(manifestUrl, requestOptions)
            .then((response) => (response.ok ? (response.json() as Promise<PoseManifest>) : null))
            .catch(() => null)
        : Promise.resolve(null);
      const response = await fetch(modelUrl, requestOptions);
      if (!response.ok) throw new Error(`Guardian asset: ${response.status}`);
      const data = await response.arrayBuffer();
      loading.fetchMs = performance.now() - fetchStarted;
      canvas.dataset.assetBytes = String(data.byteLength);
      const hashStarted = performance.now();
      loading.phase = "hash";
      const digestRequest = globalThis.crypto?.subtle
        ? globalThis.crypto.subtle
            .digest("SHA-256", data)
            .then((digest) =>
              [...new Uint8Array(digest)]
                .map((byte) => byte.toString(16).padStart(2, "0"))
                .join(""),
            )
            .catch(() => null)
        : Promise.resolve(null);
      const [manifest, assetSha256] = await Promise.all([manifestRequest, digestRequest]);
      loading.hashAndManifestMs = performance.now() - hashStarted;
      if (assetSha256) canvas.dataset.assetSha256 = assetSha256;
      if (disposed) return;
      const assetBase = new URL(".", new URL(modelUrl, document.baseURI)).href;
      const parseStarted = performance.now();
      loading.phase = "parse";
      dracoLoader = new GuardianDracoLoader(abort.signal, gltfManager);
      const gltfLoader = new GLTFLoader(gltfManager).setDRACOLoader(dracoLoader);
      const gltf = await parseAbortably(gltfLoader.parseAsync(data, assetBase));
      loading.parseMs = performance.now() - parseStarted;
      releaseDecoder(true);
      loading.phase = "prepare";
      if (disposed) {
        disposeObject(gltf.scene);
        return;
      }
      model = gltf.scene;
      model.name = "BlenderGuardianV";
      model.updateMatrixWorld(true);
      model.traverse((node) => {
        if (node instanceof THREE.SkinnedMesh) node.skeleton.update();
      });
      const box = new THREE.Box3().setFromObject(model),
        size = box.getSize(new THREE.Vector3()),
        center = box.getCenter(new THREE.Vector3());
      const scale = 6.8 / Math.max(size.y, size.x * 0.8, size.z * 0.8);
      model.scale.multiplyScalar(scale);
      model.position.addScaledVector(center, -scale);
      floating.add(model);
      floating.updateMatrixWorld(true);
      viewBounds.setFromObject(model);
      // Bounds in the floating root's space, so the backdrop's fire follows the float.
      bodyBounds.copy(viewBounds).applyMatrix4(floatingInverse.copy(floating.matrixWorld).invert());
      if (!userOrbit) resetView();
      mouth = model.getObjectByName("MouthSocket");
      aim = model.getObjectByName("MouthAim");
      model.traverse((node) => {
        let kind = "";
        if (node.name === "BodyPivot") kind = "body";
        if (node.name === "HeadPivot") kind = "head";
        if (node.name === "JawPivot") kind = "jaw";
        if (node.name.startsWith("TentaclePivot_")) kind = "tentacle";
        if (kind) {
          const base = node.quaternion.clone();
          const restQuaternion = manifest?.poses?.rest?.[node.name]?.quaternion;
          if (restQuaternion?.length === 4) base.fromArray(restQuaternion);
          const rotation =
            kind === "head"
              ? new THREE.Euler(-0.29, 0.05, -0.08)
              : kind === "jaw"
                ? new THREE.Euler(0.45, 0, 0)
                : new THREE.Euler(-0.08, 0.035, 0.03 * Math.sin(joints.length));
          const exhale = base.clone().multiply(new THREE.Quaternion().setFromEuler(rotation));
          const exhaleQuaternion = manifest?.poses?.exhale?.[node.name]?.quaternion;
          if (exhaleQuaternion?.length === 4) exhale.fromArray(exhaleQuaternion);
          joints.push({
            node,
            base,
            exhale,
            applied: new THREE.Quaternion(),
            kind,
            phase: joints.length * 1.618,
          });
        }
        if (node instanceof THREE.Mesh) {
          // A moving skin's rest bounding sphere can otherwise cull the neck
          // in an authored intermediate pose. Rigid body parts keep culling.
          node.frustumCulled = !(node instanceof THREE.SkinnedMesh);
          (Array.isArray(node.material) ? node.material : [node.material]).forEach((mat) => {
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.envMapIntensity = 0.55;
              if (!preserveAuthoredMaterials)
                mat.emissiveIntensity = Math.min(mat.emissiveIntensity, 1.35);
              if (
                !preserveAuthoredMaterials &&
                /flame|wisp|ember|rune/i.test(`${node.name} ${mat.name}`)
              ) {
                const displace = /flame|wisp/i.test(`${node.name} ${mat.name}`);
                mat.onBeforeCompile = (shader) => {
                  shader.uniforms.guardianTime = surfaceTime;
                  shader.uniforms.guardianStrength = surfaceStrength;
                  shader.vertexShader = shader.vertexShader.replace(
                    "#include <common>",
                    "#include <common>\nuniform float guardianTime; varying vec3 vGuardianSurface;",
                  );
                  shader.vertexShader = shader.vertexShader.replace(
                    "#include <begin_vertex>",
                    `#include <begin_vertex>\nvGuardianSurface=position;${displace ? "transformed+=normal*(sin(position.y*5.+position.x*3.-guardianTime*2.)*.022+sin(position.z*8.+guardianTime*2.6)*.014);" : ""}`,
                  );
                  shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <common>",
                    "#include <common>\nuniform float guardianTime,guardianStrength; varying vec3 vGuardianSurface;",
                  );
                  shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <emissivemap_fragment>",
                    "#include <emissivemap_fragment>\nfloat flow=sin(vGuardianSurface.y*5.+sin(vGuardianSurface.x*4.+guardianTime)*1.5-guardianTime*1.9);totalEmissiveRadiance*=.80+flow*.17+guardianStrength*.55;",
                  );
                };
                mat.customProgramCacheKey = () =>
                  displace ? "guardian-living-flame-v1" : "guardian-living-rune-v1";
                mat.needsUpdate = true;
              }
            }
          });
        }
      });
      const rest = gltf.animations.find((clip) => /rest/i.test(clip.name));
      const exhale = gltf.animations.find((clip) => /exhale/i.test(clip.name));
      animationSummary = gltf.animations.map((clip) => ({
        name: clip.name,
        tracks: clip.tracks.length,
      }));
      if (rest && exhale) {
        mixer = new THREE.AnimationMixer(model);
        poseFadeSeconds = guardianPoseFadeSeconds(manifest);
        const described = describeGuardianPoses(
          gltf.animations.map((clip) => clip.name),
          manifest,
        );
        for (const pose of described) {
          const clip = gltf.animations.find((candidate) => candidate.name === pose.name);
          if (!clip) continue;
          const action = mixer.clipAction(clip);
          action.setLoop(pose.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
          action.clampWhenFinished = true;
          action.play();
          const weight = clip === rest ? 1 : 0;
          action.setEffectiveWeight(weight);
          poseLayers.push({ ...pose, action, weight, from: weight, to: weight });
        }
        currentPose = rest.name;
        canvas.dataset.poseName = currentPose;
        // The breath as an additive delta from Rest: at Rest it reproduces the authored
        // Exhale exactly; in any other pose the same head, jaw and body offsets apply on top.
        exhaleAction = mixer.clipAction(
          THREE.AnimationUtils.makeClipAdditive(exhale.clone(), 0, rest),
        );
        exhaleAction.play();
        exhaleAction.setEffectiveWeight(0);
        poseAvailable = true;
        poseSource = "clips";
      } else if (manifest?.poses?.exhale) {
        poseAvailable = true;
        poseSource = "manifest";
      }
      canvas.dataset.poseContract = poseSource;
      syncLightingModel();
      inkSurface = applyGuardianInkSurface(model, surfaceUniforms);
      let triangles = 0,
        meshes = 0;
      const gpuAttributes = new Set<THREE.BufferAttribute | THREE.InterleavedBuffer>();
      const materialTextures = new Set<THREE.Texture>();
      const modelSkeletons = new Set<THREE.Skeleton>();
      const ownAttribute = (
        attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
      ) => {
        const buffer =
          attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data : attribute;
        if (gpuAttributes.has(buffer)) return;
        gpuAttributes.add(buffer);
        geometryBytesEstimated += buffer.array.byteLength;
      };
      model.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          const geometry = node.geometry as THREE.BufferGeometry;
          meshes++;
          if (node instanceof THREE.SkinnedMesh) {
            skinnedMeshes++;
            modelSkeletons.add(node.skeleton);
          }
          if (Object.values(geometry.morphAttributes).some((attributes) => attributes?.length))
            morphMeshes++;
          triangles +=
            (node.geometry.index?.count ?? node.geometry.getAttribute("position")?.count ?? 0) / 3;
          if (geometry.index) ownAttribute(geometry.index);
          Object.values(geometry.attributes).forEach(ownAttribute);
          Object.values(
            geometry.morphAttributes as Record<
              string,
              (THREE.BufferAttribute | THREE.InterleavedBufferAttribute)[] | undefined
            >,
          ).forEach((attributes) => attributes?.forEach(ownAttribute));
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            Object.values(material).forEach((value) => {
              if (value instanceof THREE.Texture) materialTextures.add(value);
            });
          }
        }
      });
      skeletonsCount = modelSkeletons.size;
      for (const texture of materialTextures) {
        const image = texture.image as { width?: number; height?: number } | undefined;
        if (image?.width && image.height)
          materialTextureBytesEstimated +=
            image.width * image.height * 4 * (texture.generateMipmaps ? 4 / 3 : 1);
      }
      canvas.dataset.meshes = String(meshes);
      canvas.dataset.triangles = String(Math.round(triangles));
      canvas.dataset.source = "blender-glb";
      canvas.dataset.geometryBytes = String(geometryBytesEstimated);
      canvas.dataset.materialTextureBytes = String(Math.round(materialTextureBytesEstimated));
      if (effectsEnabled) mantle = createFlameMantle(model, noise, fireTier);
      loading.readyMs = performance.now() - bootStartedAt;
      loading.phase = "ready";
      captureFirstFrame = true;
      notify(lost ? "error" : "ready");
      request();
    } catch (error) {
      releaseDecoder(false);
      loading.phase = disposed ? "disposed" : "error";
      if (!disposed && !(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Guardian viewer could not load its Blender model", error);
        notify("error");
      }
    }
  })();
  return {
    breathe() {
      if (!model || !poseAvailable || actionTime >= 0) return;
      paused = false;
      actionTime = 0;
      last = 0;
      options.onActionChange?.(true);
      request();
    },
    listPoses: () => poseLayers.map(({ name, label, loop }) => ({ name, label, loop })),
    getPose: () => currentPose,
    setPose(name) {
      const target = poseLayers.find((layer) => layer.name === name);
      if (!target || disposed) return false;
      if (name === currentPose && poseFadeStart < 0) return true;
      for (const layer of poseLayers) {
        layer.from = layer.weight;
        layer.to = layer === target ? 1 : 0;
      }
      target.action.reset().play();
      target.action.setEffectiveWeight(target.weight);
      currentPose = name;
      poseFadeStart = poseClock;
      paused = false;
      last = 0;
      canvas.dataset.poseName = name;
      options.onPoseChange?.(name);
      request();
      return true;
    },
    resetView,
    togglePause() {
      paused = !paused;
      last = 0;
      request();
      return paused;
    },
    setBlocked(next) {
      if (blocked === next || disposed) return;
      blocked = next;
      controls.enabled = !blocked;
      last = 0;
      if (blocked) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else request();
    },
    setLightingProfile,
    setLightingPalette,
    getDiagnostics() {
      return {
        disposed,
        modelUrl: options.modelUrl ?? "/dogs-archive-20261029/guardian-v3.glb",
        assetSha256: canvas.dataset.assetSha256 ?? null,
        assetBytes: Number(canvas.dataset.assetBytes ?? 0),
        lightingProfile,
        lightingPalette,
        qualityTier: tier,
        fireTier,
        noiseVolumeBytes: NOISE_VOLUME_BYTES,
        inkSurface: inkSurface
          ? { patched: inkSurface.patched, families: inkSurface.families }
          : null,
        mobile,
        dpr,
        poseSource,
        poseAvailable,
        poseName: currentPose,
        poses: poseLayers.map(({ name, loop, weight }) => ({ name, loop, weight })),
        fps: Number(canvas.dataset.fps ?? 0),
        textures: renderer.info.memory.textures,
        geometries: renderer.info.memory.geometries,
        programs: renderer.info.programs?.length ?? 0,
        drawCalls: renderer.info.render.calls,
        submittedTriangles: renderer.info.render.triangles,
        camera: camera.position.toArray(),
        target: controls.target.toArray(),
        floatingPosition: floating.position.toArray(),
        floatingRotation: [floating.rotation.x, floating.rotation.y, floating.rotation.z],
        loading: { ...loading },
        draco: dracoLoader?.getDiagnostics() ?? dracoStats,
        geometryBytesEstimated,
        materialTextureBytesEstimated,
        authoredMaterialsPreserved: preserveAuthoredMaterials,
        skinnedMeshes,
        skeletons: skeletonsCount,
        morphMeshes,
        animationClips: animationSummary,
        skinJointQuaternions: Object.fromEntries(
          ["NeckBaseJoint", "NeckHeadJoint"].flatMap((name) => {
            const bone = model?.getObjectByName(name);
            return bone ? [[name, bone.quaternion.toArray()]] : [];
          }),
        ),
        mantle: mantle?.diagnostics ?? null,
        legacyLightsVisible: legacyLights.visible,
        sculptureLightsVisible: sculptureLighting?.root.visible ?? false,
        shadows: sculptureLighting?.getDiagnostics() ?? null,
        surfaces: surfaceAudit,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loading.phase = "disposed";
      abort.abort();
      gltfManager.abort();
      releaseDecoder(false);
      cancelAnimationFrame(frame);
      resizer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      motionQuery.removeEventListener("change", motionChange);
      canvas.removeEventListener("keydown", keydown);
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      controls.removeEventListener("change", change);
      controls.removeEventListener("start", controlStart);
      controls.dispose();
      mixer?.stopAllAction();
      if (model) mixer?.uncacheRoot(model);
      poseLayers.length = 0;
      sculptureLighting?.dispose();
      sculptureLighting = null;
      restoreMouthSpill?.();
      restoreMouthSpill = null;
      mantle?.dispose();
      mantle = null;
      inkSurface = null;
      breath.dispose();
      backdrop.dispose();
      disposeObject(scene);
      noise.dispose();
      environmentTarget.dispose();
      bloom.dispose();
      output.dispose();
      antialiasPass?.dispose();
      volumePass.dispose();
      grade.dispose();
      renderPass.dispose();
      composer.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
