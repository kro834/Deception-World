import * as THREE from "three";

/** Opt-in sculpture lighting for the v2 mesh. The existing viewer does not use
 * this rig until the clay model has passed its silhouette/volume review. */
export type GuardianLightingOptions = {
  mobile: boolean;
  normalBias?: number;
  mapSize?: number;
  palette?: GuardianLightingPalette;
};
export type GuardianLightingPalette = "forest" | "neutral" | "reference";

export type GuardianSurfaceAudit = {
  meshes: number;
  shadowCasters: number;
  materials: number;
  normalMaps: number;
  aoMaps: number;
  roughnessMaps: number;
  missingNormals: number;
  groups: Record<string, number>;
  missingUvSets: number;
  vertexColorMeshes: number;
  inputs: {
    name: string;
    roughness: number;
    metalness: number;
    normalScale: number[];
    emissiveIntensity: number;
    emissive: number[];
    vertexColors: boolean;
  }[];
};

function surfaceFamily(material: THREE.Material) {
  const prefix = material.name.split(/[|:]/, 1)[0];
  if (/bone|ivory|teeth|ridge|shell|carapace/i.test(prefix)) return "bone";
  if (/skin|flesh|membrane/i.test(prefix)) return "skin";
  if (/rune|ember|emission|flame|wisp|glow/i.test(material.name)) return "emission";
  if (/furrow|cavity|shadow/i.test(material.name)) return "cavity";
  if (/skin|flesh|membrane/i.test(material.name)) return "skin";
  if (/bone|ivory|teeth|ridge|shell|carapace/i.test(material.name)) return "bone";
  return "other";
}

/** Keep mouth light local to the head/neck; a shadowless 12-unit light fills
 * every cavity of a 6.8-unit creature. Only the key spends a shadow pass. */
export function prepareGuardianMouthSpill(light: THREE.PointLight) {
  const previous = { distance: light.distance, decay: light.decay, castShadow: light.castShadow };
  light.distance = 3.8;
  light.decay = 2;
  light.castShadow = false;
  return () => {
    light.distance = previous.distance;
    light.decay = previous.decay;
    light.castShadow = previous.castShadow;
  };
}

/** Preserve authored color/normal/AO/ORM, UV channels, normalScale and roughness.
 * Only the studio's reflection contribution differs between skin and bone. */
export function prepareGuardianSurfaces(model: THREE.Object3D): GuardianSurfaceAudit {
  const audit: GuardianSurfaceAudit = {
    meshes: 0,
    shadowCasters: 0,
    materials: 0,
    normalMaps: 0,
    aoMaps: 0,
    roughnessMaps: 0,
    missingNormals: 0,
    missingUvSets: 0,
    groups: {},
    vertexColorMeshes: 0,
    inputs: [],
  };
  const seen = new Set<THREE.Material>();
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || node instanceof THREE.InstancedMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (!materials.some((material) => material instanceof THREE.MeshStandardMaterial)) return;
    audit.meshes++;
    if (node.geometry.getAttribute("color")) audit.vertexColorMeshes++;
    if (!node.geometry.getAttribute("normal")) audit.missingNormals++;
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      for (const texture of [
        material.map,
        material.normalMap,
        material.aoMap,
        material.roughnessMap,
        material.metalnessMap,
      ]) {
        if (
          texture &&
          !node.geometry.getAttribute(texture.channel === 0 ? "uv" : `uv${texture.channel}`)
        )
          audit.missingUvSets++;
      }
    }
    const physical = materials.some(
      (material) =>
        surfaceFamily(material) !== "emission" && material.opacity > 0.8 && !material.transparent,
    );
    node.castShadow = physical;
    node.receiveShadow = physical;
    if (physical) audit.shadowCasters++;
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial) || seen.has(material)) continue;
      seen.add(material);
      audit.materials++;
      const family = surfaceFamily(material);
      audit.groups[family] = (audit.groups[family] ?? 0) + 1;
      if (material.normalMap) audit.normalMaps++;
      if (material.aoMap) audit.aoMaps++;
      if (material.roughnessMap) audit.roughnessMaps++;
      audit.inputs.push({
        name: material.name,
        roughness: material.roughness,
        metalness: material.metalness,
        normalScale: material.normalScale.toArray(),
        emissiveIntensity: material.emissiveIntensity,
        emissive: material.emissive.toArray(),
        vertexColors: material.vertexColors,
      });
      material.envMapIntensity =
        family === "skin" ? 0.42 : family === "cavity" ? 0.1 : family === "bone" ? 0.85 : 0.4;
      // GLTFLoader already assigns NoColorSpace to normal/AO/ORM and preserves
      // texCoord + KHR_texture_transform. Do not retag these or generate UVs.
      material.needsUpdate = true;
    }
  });
  return audit;
}

export function createGuardianSculptureLighting(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  floating: THREE.Group,
  options: GuardianLightingOptions,
) {
  const previous = {
    enabled: renderer.shadowMap.enabled,
    type: renderer.shadowMap.type,
    autoUpdate: renderer.shadowMap.autoUpdate,
    environment: scene.environmentIntensity,
  };
  renderer.shadowMap.enabled = true;
  // Three r186 removed PCFSoftShadowMap; PCFShadowMap now uses a soft disk.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  scene.environmentIntensity = 0.12;
  const root = new THREE.Group();
  root.name = "GuardianSculptureLightRig";
  floating.add(root);
  // The paintings' light: a dark ink sky over a fire bank below, a pale key from above and in
  // front, saturated green rims from behind where the fire is. The creature stays the darkest
  // element of the picture. Only the key casts shadows.
  const hemi = new THREE.HemisphereLight(0x8a978c, 0x0a2012, 0.62);
  const key = new THREE.DirectionalLight(0xf0f4ee, 3.4);
  key.position.set(5.8, 7.6, 6.4);
  key.target.position.set(0, 0.15, 0);
  key.castShadow = true;
  const mapSize = options.mapSize ?? (options.mobile ? 768 : 1536);
  key.shadow.mapSize.set(mapSize, mapSize);
  key.shadow.radius = options.mobile ? 1.6 : 2.1;
  key.shadow.bias = -0.000025;
  key.shadow.normalBias = options.normalBias ?? 0.004;
  key.shadow.autoUpdate = false;
  const rim = new THREE.DirectionalLight(0x39d977, 2.4);
  rim.position.set(-5.5, -1.5, -7);
  const rimRight = new THREE.DirectionalLight(0x2fb765, 1.0);
  rimRight.position.set(6.5, 1.5, -6.5);
  const fill = new THREE.DirectionalLight(0x6f8a8c, 0.35);
  fill.position.set(-6, 0.5, 3.5);
  root.add(hemi, key, key.target, rim, rimRight, fill);
  let palette: GuardianLightingPalette = options.palette ?? "forest";
  const setPalette = (next: GuardianLightingPalette) => {
    palette = next;
    if (next === "reference") {
      // Even, neutral studio light for judging the materials against the white-ground
      // originals: a bright sky-and-ground hemisphere, a soft key, pale rims and fill.
      hemi.color.set(0xffffff);
      hemi.groundColor.set(0xb9bdb8);
      hemi.intensity = 0.95;
      key.color.set(0xfdfcf8);
      key.intensity = 1.5;
      rim.color.set(0xdfe6df);
      rim.intensity = 0.5;
      rimRight.color.set(0xdfe6df);
      rimRight.intensity = 0.4;
      fill.color.set(0xe8ebe6);
      fill.intensity = 0.6;
    } else if (next === "neutral") {
      // Similar linear luminance to the forest rig. Read authored albedo
      // rather than painting every dielectric highlight with green light.
      hemi.color.set(0xc3c6c8);
      hemi.groundColor.set(0x1a1c1b);
      hemi.intensity = 0.38;
      key.color.set(0xf1eadf);
      key.intensity = 3.08;
      rim.color.set(0xb4c3d0);
      rim.intensity = 0.9;
      rimRight.color.set(0x9fb0ba);
      rimRight.intensity = 0.5;
      fill.color.set(0x88939f);
      fill.intensity = 0.32;
    } else {
      hemi.color.set(0x8a978c);
      hemi.groundColor.set(0x0a2012);
      hemi.intensity = 0.62;
      key.color.set(0xf0f4ee);
      key.intensity = 3.4;
      rim.color.set(0x39d977);
      rim.intensity = 2.4;
      rimRight.color.set(0x2fb765);
      rimRight.intensity = 1.0;
      fill.color.set(0x6f8a8c);
      fill.intensity = 0.35;
    }
  };
  setPalette(palette);
  let disposed = false,
    dirty = true,
    lastShadowTime = -Infinity,
    lastPose = NaN;
  let shadowUpdates = 0;
  let model: THREE.Object3D | null = null;
  const materialState = new Map<THREE.MeshStandardMaterial, number>();
  const meshState = new Map<THREE.Mesh, [boolean, boolean]>();
  const bounds = new THREE.Box3(),
    corner = new THREE.Vector3(),
    center = new THREE.Vector3(),
    worldCentre = new THREE.Vector3();

  const fitShadow = () => {
    if (!model) return;
    root.updateWorldMatrix(true, true);
    model.updateWorldMatrix(true, true);
    bounds.setFromObject(model);
    bounds.getCenter(center);
    root.worldToLocal(center);
    key.target.position.copy(center);
    key.position.copy(center).add(new THREE.Vector3(5.8, 7.6, 6.4));
    root.updateWorldMatrix(true, true);
    key.shadow.updateMatrices(key);
    const camera = key.shadow.camera;
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          corner.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
          minX = Math.min(minX, corner.x);
          maxX = Math.max(maxX, corner.x);
          minY = Math.min(minY, corner.y);
          maxY = Math.max(maxY, corner.y);
          minZ = Math.min(minZ, corner.z);
          maxZ = Math.max(maxZ, corner.z);
        }
    // A pose allowance keeps the lifted head/jaw inside the one tight map.
    const margin = 0.9;
    camera.left = minX - margin;
    camera.right = maxX + margin;
    camera.bottom = minY - margin;
    camera.top = maxY + margin;
    camera.near = Math.max(0.1, -maxZ - margin);
    camera.far = Math.max(camera.near + 1, -minZ + margin);
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const restoreSurfaces = () => {
    materialState.forEach((intensity, material) => {
      material.envMapIntensity = intensity;
      material.needsUpdate = true;
    });
    meshState.forEach(([cast, receive], mesh) => {
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
    });
    materialState.clear();
    meshState.clear();
  };

  return {
    root,
    key,
    setPalette,
    setModel(next: THREE.Object3D) {
      restoreSurfaces();
      model = next;
      model.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        meshState.set(node, [node.castShadow, node.receiveShadow]);
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          if (material instanceof THREE.MeshStandardMaterial && !materialState.has(material))
            materialState.set(material, material.envMapIntensity);
        }
      });
      const audit = prepareGuardianSurfaces(next);
      fitShadow();
      return audit;
    },
    update(time: number, pose: number) {
      if (disposed || !model) return;
      root.updateWorldMatrix(true, true);
      // Keep the lookup matrix current even when the depth map is reused.
      // Key+target share the floating root, so bobbing alone changes no depth.
      key.shadow.updateMatrices(key);
      const poseChanged = !Number.isFinite(lastPose) || Math.abs(pose - lastPose) > 0.002;
      const interval = 1 / (options.mobile ? (poseChanged ? 8 : 6) : poseChanged ? 16 : 12);
      if (dirty || time - lastShadowTime >= interval) {
        renderer.shadowMap.needsUpdate = true;
        key.shadow.needsUpdate = true;
        lastShadowTime = time;
        lastPose = pose;
        dirty = false;
        shadowUpdates++;
      }
    },
    invalidate() {
      dirty = true;
    },
    /** World-space direction from the creature toward the main rim light. */
    rimDirection(target: THREE.Vector3) {
      rim.getWorldPosition(target);
      key.target.getWorldPosition(worldCentre);
      return target.sub(worldCentre).normalize();
    },
    /** World-space direction from the creature toward the key light. */
    keyDirection(target: THREE.Vector3) {
      key.getWorldPosition(target);
      key.target.getWorldPosition(worldCentre);
      return target.sub(worldCentre).normalize();
    },
    restoreAfterContextLoss() {
      if (disposed) return;
      key.shadow.dispose();
      key.shadow.map = null;
      key.shadow.mapPass = null;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.shadowMap.autoUpdate = false;
      lastShadowTime = -Infinity;
      lastPose = NaN;
      fitShadow();
      dirty = true;
    },
    refit: fitShadow,
    getDiagnostics() {
      const target = key.shadow.map;
      return {
        mapSize: [key.shadow.mapSize.x, key.shadow.mapSize.y],
        allocated: Boolean(target),
        colorTextureUuid: target?.texture.uuid ?? null,
        depthTextureUuid: target?.depthTexture?.uuid ?? null,
        // PCF's RGBA8 target + 32-bit depth; this is a resource estimate,
        // not a driver/OS VRAM measurement. renderer.info tracks object counts.
        estimatedMapBytes: target ? target.width * target.height * 8 : 0,
        normalBias: key.shadow.normalBias,
        palette,
        shadowUpdates,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      key.shadow.dispose();
      root.removeFromParent();
      restoreSurfaces();
      renderer.shadowMap.enabled = previous.enabled;
      renderer.shadowMap.type = previous.type;
      renderer.shadowMap.autoUpdate = previous.autoUpdate;
      scene.environmentIntensity = previous.environment;
      renderer.shadowMap.needsUpdate = previous.enabled;
    },
  };
}
