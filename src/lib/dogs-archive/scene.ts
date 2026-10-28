import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createBreathVolume, createMantle } from "./fire.ts";

export type GuardianStatus = "loading" | "ready" | "error";
export type GuardianScene = {
  breathe(): void;
  resetView(): void;
  togglePause(): boolean;
  setBlocked(blocked: boolean): void;
  dispose(): void;
};
type Options = {
  onStatus?: (status: GuardianStatus) => void;
  onActionChange?: (active: boolean) => void;
};
type PoseManifest = {
  poses?: {
    rest?: Record<string, { quaternion?: number[] }>;
    exhale?: Record<string, { quaternion?: number[] }>;
  };
};
const ease = (a: number, b: number, t: number) => THREE.MathUtils.smoothstep(t, a, b);

// Every allocation belongs to this surface. Removing the fifth dog aborts its
// request and releases its maps, buffers, context, listeners and animation loop.
export function createGuardianScene(host: HTMLElement, options: Options = {}): GuardianScene {
  const abort = new AbortController();
  const canvas = document.createElement("canvas");
  canvas.className = "dogs-viewer__canvas";
  canvas.dataset.engineVersion = "guardian-20261028-r14";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    "第五の犬の立体模型。ドラッグで全方向へ回転、ピンチで拡大。矢印キーで回転、プラスとマイナスで拡大縮小、Homeで視点を戻す。",
  );
  const mobile = matchMedia("(pointer: coarse)").matches;
  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: false,
    antialias: !mobile,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#020906");
  scene.fog = new THREE.FogExp2("#04110b", 0.028);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.08, 120);
  const viewDirection = new THREE.Vector3(9.5, 3, 14.8).normalize();
  const viewRight = new THREE.Vector3().crossVectors(camera.up, viewDirection).normalize();
  const viewUp = new THREE.Vector3().crossVectors(viewDirection, viewRight).normalize();
  const viewBounds = new THREE.Box3(new THREE.Vector3(-3, -3.4, -2), new THREE.Vector3(3, 3.4, 2));
  const fitCorner = new THREE.Vector3();
  const environmentScene = new RoomEnvironment();
  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  let environmentTarget = environmentGenerator.fromScene(environmentScene, 0.06);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.34;
  environmentScene.dispose();
  environmentGenerator.dispose();
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.46, 0.65, 1.1);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(output);
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
  scene.add(new THREE.HemisphereLight(0xc6ead5, 0x0a1b11, 1.05));
  const key = new THREE.DirectionalLight(0xd4ffe0, 2.7);
  key.position.set(5, 8, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x52d98e, 3.6);
  rim.position.set(-6, 3, -7);
  scene.add(rim);
  const side = new THREE.DirectionalLight(0x647caa, 1.1);
  side.position.set(-7, -1, 5);
  scene.add(side);
  const breathLight = new THREE.PointLight(0x79ff8d, 0, 12, 1.6);
  scene.add(breathLight);
  const breath = createBreathVolume(mobile);
  scene.add(breath.mesh);
  const surfaceTime = { value: 0 },
    surfaceStrength = { value: 0 };
  let model: THREE.Object3D | null = null;
  let mantle: ReturnType<typeof createMantle> | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let restAction: THREE.AnimationAction | null = null;
  let exhaleAction: THREE.AnimationAction | null = null;
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
    aimPosition = new THREE.Vector3();
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
    root.traverse((node) => {
      if (!(
        node instanceof THREE.Mesh ||
        node instanceof THREE.Points ||
        node instanceof THREE.Line
      ))
        return;
      if (node instanceof THREE.InstancedMesh) node.dispose();
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
            Math.abs(fitCorner.dot(viewRight)) / (tanH * 0.82) + depth,
            Math.abs(fitCorner.dot(viewUp)) / (tanV * 0.82) + depth,
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
    const animate = Boolean(model) && !paused && (!reducedMotion || actionTime >= 0);
    if (animate) time += dt;
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
      restAction?.setEffectiveWeight(1 - actionPose);
      exhaleAction?.setEffectiveWeight(actionPose);
      // Pose clips are sampled together; their weights carry the transition.
      mixer.update(animate ? dt : 0);
    }
    for (const joint of joints) {
      if (!mixer) {
        joint.node.quaternion.copy(joint.base).slerp(joint.exhale, actionPose);
        joint.applied.identity();
      }
      if (joint.kind === "head" && anticipation > 0) {
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
      breath.update(time, strength, origin, direction);
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
      breathLight.position.copy(origin).addScaledVector(direction, 0.5);
      breathLight.intensity = strength * 7.5;
      mantle?.update(time, Math.max(strength, anticipation * 0.2), dpr);
    }
    controls.update();
    composer.render();
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
      mobile ? 1.4 : 1.75,
      Math.sqrt(1850000 / (width * height)),
    );
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(dpr);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (!userOrbit) resetView();
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
      const room = new RoomEnvironment(),
        generator = new THREE.PMREMGenerator(renderer);
      const nextEnvironment = generator.fromScene(room, 0.06);
      room.dispose();
      generator.dispose();
      environmentTarget.dispose();
      environmentTarget = nextEnvironment;
      scene.environment = environmentTarget.texture;
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
  resetView();
  resize();
  notify("loading");
  void (async () => {
    try {
      const requestOptions: RequestInit = {
        signal: abort.signal,
        cache: import.meta.env.DEV ? "no-store" : "no-cache",
      };
      const manifestRequest = fetch("/dogs-archive-20261028/model-manifest.json", requestOptions)
        .then((response) => (response.ok ? (response.json() as Promise<PoseManifest>) : null))
        .catch(() => null);
      const response = await fetch("/dogs-archive-20261028/guardian-v.glb", requestOptions);
      if (!response.ok) throw new Error(`Guardian asset: ${response.status}`);
      const data = await response.arrayBuffer();
      canvas.dataset.assetBytes = String(data.byteLength);
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
      if (assetSha256) canvas.dataset.assetSha256 = assetSha256;
      if (disposed) return;
      const gltf = await new GLTFLoader().parseAsync(data, "/dogs-archive-20261028/");
      if (disposed) {
        disposeObject(gltf.scene);
        return;
      }
      model = gltf.scene;
      model.name = "BlenderGuardianV";
      const box = new THREE.Box3().setFromObject(model),
        size = box.getSize(new THREE.Vector3()),
        center = box.getCenter(new THREE.Vector3());
      const scale = 6.8 / Math.max(size.y, size.x * 0.8, size.z * 0.8);
      model.scale.multiplyScalar(scale);
      model.position.addScaledVector(center, -scale);
      floating.add(model);
      floating.updateMatrixWorld(true);
      viewBounds.setFromObject(model);
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
          node.frustumCulled = true;
          (Array.isArray(node.material) ? node.material : [node.material]).forEach((mat) => {
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.envMapIntensity = 0.55;
              mat.emissiveIntensity = Math.min(mat.emissiveIntensity, 1.35);
              if (/flame|wisp|ember|rune/i.test(`${node.name} ${mat.name}`)) {
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
      if (rest && exhale) {
        mixer = new THREE.AnimationMixer(model);
        restAction = mixer.clipAction(rest).play();
        exhaleAction = mixer.clipAction(exhale).play();
        exhaleAction.setEffectiveWeight(0);
      }
      let triangles = 0,
        meshes = 0;
      model.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          meshes++;
          triangles +=
            (node.geometry.index?.count ?? node.geometry.getAttribute("position")?.count ?? 0) / 3;
        }
      });
      canvas.dataset.meshes = String(meshes);
      canvas.dataset.triangles = String(Math.round(triangles));
      canvas.dataset.source = "blender-glb";
      mantle = createMantle(model, mobile);
      notify(lost ? "error" : "ready");
      request();
    } catch (error) {
      if (!disposed && !(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Guardian viewer could not load its Blender model", error);
        notify("error");
      }
    }
  })();
  return {
    breathe() {
      if (!model || actionTime >= 0) return;
      paused = false;
      actionTime = 0;
      last = 0;
      options.onActionChange?.(true);
      request();
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
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort();
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
      disposeObject(scene);
      environmentTarget.dispose();
      bloom.dispose();
      output.dispose();
      renderPass.dispose();
      composer.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
