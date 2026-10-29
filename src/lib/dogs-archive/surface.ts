import * as THREE from "three";

/** Shading that reads like the paintings on top of the authored PBR inputs: pale-green bone
 * rims, deep translucent membranes, broad ink mottling, a breathing lattice face and a mouth
 * that glows while the creature breathes. The bone/membrane mask is read from the shaded
 * albedo luminance (COLOR_0 today; a texture mask from the model lead works unchanged). */
export type GuardianSurfaceUniforms = {
  uNoise: { value: THREE.Data3DTexture };
  uTime: { value: number };
  uStrength: { value: number };
  uAnticipation: { value: number };
  uRimDir: { value: THREE.Vector3 };
  uKeyDir: { value: THREE.Vector3 };
  uRimColor: { value: THREE.Color };
  uTransColor: { value: THREE.Color };
  uRimStrength: { value: number };
  uTransStrength: { value: number };
  uBoneRange: { value: THREE.Vector2 };
};

export function createGuardianSurfaceUniforms(noise: THREE.Data3DTexture): GuardianSurfaceUniforms {
  return {
    uNoise: { value: noise },
    uTime: { value: 0 },
    uStrength: { value: 0 },
    uAnticipation: { value: 0 },
    uRimDir: { value: new THREE.Vector3(-0.5, 0.2, -0.8).normalize() },
    uKeyDir: { value: new THREE.Vector3(0.4, 0.7, 0.6).normalize() },
    uRimColor: { value: new THREE.Color(0.68, 1.0, 0.76) },
    uTransColor: { value: new THREE.Color(0.06, 0.42, 0.14) },
    uRimStrength: { value: 0.75 },
    uTransStrength: { value: 0.6 },
    // Linear albedo luminance: membranes sit below 0.035, bone rims above 0.11.
    uBoneRange: { value: new THREE.Vector2(0.035, 0.11) },
  };
}

/** Families by material name. `lattice` is the face (pulse-driven glow), `core` any other
 * authored emission such as the whorl centres (kept as authored, gently breathing). */
const surfaceFamily = (material: THREE.Material) => {
  const name = material.name;
  if (/face|lattice|forehead/i.test(name)) return "lattice";
  if (/rune|emission|glow|core/i.test(name)) return "core";
  if (/mouth|cavity/i.test(name)) return "mouth";
  if (/bone|ivory|shell|carapace|ridge|teeth/i.test(name.split(/[|:]/, 1)[0])) return "bone";
  return "skin";
};

export type GuardianSurfaceHandles = {
  patched: number;
  families: Record<string, number>;
  update(time: number, strength: number, anticipation: number): void;
  restore(): void;
};

export function applyGuardianInkSurface(
  model: THREE.Object3D,
  uniforms: GuardianSurfaceUniforms,
): GuardianSurfaceHandles {
  const seen = new Set<THREE.Material>();
  const lattice: { material: THREE.MeshStandardMaterial; base: number }[] = [];
  const cores: { material: THREE.MeshStandardMaterial; base: number }[] = [];
  const mouths: THREE.MeshStandardMaterial[] = [];
  const families: Record<string, number> = {};
  const previous = new Map<
    THREE.MeshStandardMaterial,
    {
      onBeforeCompile: THREE.MeshStandardMaterial["onBeforeCompile"];
      customProgramCacheKey: THREE.MeshStandardMaterial["customProgramCacheKey"];
      emissive: THREE.Color;
      emissiveIntensity: number;
      color: THREE.Color;
      roughness: number;
      metalness: number;
      metalnessMap: THREE.Texture | null;
    }
  >();
  let patched = 0;
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial) || seen.has(material)) continue;
      seen.add(material);
      const family = surfaceFamily(material);
      families[family] = (families[family] ?? 0) + 1;
      previous.set(material, {
        onBeforeCompile: material.onBeforeCompile,
        customProgramCacheKey: material.customProgramCacheKey,
        emissive: material.emissive.clone(),
        emissiveIntensity: material.emissiveIntensity,
        color: material.color.clone(),
        roughness: material.roughness,
        metalness: material.metalness,
        metalnessMap: material.metalnessMap,
      });
      if (family === "lattice") {
        // An authored emissive texture keeps its own colours and strength; only the pulse is
        // driven here. The legacy wire lattice gets the painting's white-green.
        if (!material.emissiveMap && !material.map) {
          material.color.set("#0d1f14");
          material.emissive.set("#bfffd0");
          lattice.push({ material, base: 1.2 });
        } else lattice.push({ material, base: material.emissiveIntensity });
        continue;
      }
      if (family === "core") {
        cores.push({ material, base: material.emissiveIntensity });
        continue;
      }
      if (family === "mouth") {
        material.emissive.set("#39ff7a");
        material.emissiveIntensity = 0;
        mouths.push(material);
        continue;
      }
      material.roughness = Math.min(material.roughness, family === "bone" ? 0.82 : 0.9);
      // Ink is a dielectric. The 2026-10-28 ORM's blue channel gave the membranes metalness,
      // which mirrored the studio and read as grey.
      material.metalness = 0;
      material.metalnessMap = null;
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vGuardianWorld;")
          .replace(
            "#include <skinning_vertex>",
            "#include <skinning_vertex>\nvGuardianWorld=(modelMatrix*vec4(transformed,1.)).xyz;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
uniform highp sampler3D uNoise;
uniform float uTime,uStrength,uAnticipation,uRimStrength,uTransStrength;
uniform vec3 uRimDir,uKeyDir,uRimColor,uTransColor;
uniform vec2 uBoneRange;
varying vec3 vGuardianWorld;
float gBone;`,
          )
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
{
 // Bone is pale OR grey-green (low saturation); ink and membranes are saturated green.
 // Saturation survives an AO bake multiplied into the vertex colours.
 float gLum=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
 float gMax=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b));
 float gSat=(gMax-min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b)))/max(gMax,1e-4);
 // 2026-10-28 bone: luminance ≥ 0.12 at saturation ≈ 0.38. 2026-10-29 bone: saturation 0.2–0.3
 // at any luminance. Ink/membranes of both: saturation ≥ 0.5, so luminance never counts there.
 gBone=max(smoothstep(uBoneRange.x,uBoneRange.y,gLum)*(1.-smoothstep(.45,.6,gSat)),1.-smoothstep(.3,.5,gSat));
 float gMottle=texture(uNoise,vGuardianWorld*.085+vec3(.3)).r;
 float gFine=texture(uNoise,vGuardianWorld*.6+vec3(1.7)).g;
 // Membranes: black-green ink. Bone: pale grey-green, lifted toward ~0.22 linear when the
 // authored value is darker (the 2026-10-28 bone), left alone when it is already pale.
 float gLift=clamp(.22/max(gLum,.02),1.,1.5);
 vec3 gTint=mix(vec3(.2,.34,.24),vec3(1.,1.02,.98)*gLift,gBone);
 diffuseColor.rgb*=gTint*(.74+gMottle*.45)*(.9+gFine*.2);
}`,
          )
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
{
 vec3 gV=normalize(vViewPosition);
 float gNdV=saturate(dot(normal,gV));
 // Thin rims. Thin bone bars (2026-10-29 lattice) sit at grazing angles over most of their
 // pixels, so the rim is kept narrow and capped below the bloom threshold.
 float gFres=pow(1.-gNdV,3.5);
 float gRimFace=saturate(dot(normal,uRimDir))*.75+.25;
 float gRim=min(gFres*gRimFace*(.22+.78*gBone)*uRimStrength,.45);
 // Thin membranes glow where the fire is behind the surface itself, and mostly at their
 // edges: without occlusion a broad back-lit term would wash the whole body green.
 float gBack=saturate(dot(-uRimDir,gV));
 float gThin=saturate(dot(normal,-uRimDir));
 float gEdge=.12+.88*pow(1.-gNdV,2.5);
 float gTrans=pow(gThin,2.)*pow(gBack,1.5)*gEdge*(1.-gBone)*uTransStrength;
 float gKey=saturate(dot(normal,uKeyDir));
 totalEmissiveRadiance+=uRimColor*gRim*(1.+uStrength*.5)+uTransColor*gTrans*(1.+uStrength*.8);
 totalEmissiveRadiance+=uRimColor*gKey*gFres*gBone*.18;
}`,
          )
          .replace(
            "#include <aomap_fragment>",
            `#include <aomap_fragment>
{
 // Ink outline: membranes darken at grazing angles like a brush edge.
 float gNdV2=saturate(dot(normal,normalize(vViewPosition)));
 float gInk=1.-pow(1.-gNdV2,5.)*.75*(1.-gBone);
 reflectedLight.directDiffuse*=gInk;
 reflectedLight.indirectDiffuse*=gInk;
}`,
          );
      };
      material.customProgramCacheKey = () => `guardian-ink-surface-v1:${family}`;
      material.needsUpdate = true;
      patched++;
    }
  });
  return {
    patched,
    families,
    update(time, strength, anticipation) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.35);
      const latticeScale = 1 + pulse * 0.35 + anticipation * 1.4 + strength * 0.8;
      for (const { material, base } of lattice) material.emissiveIntensity = base * latticeScale;
      const coreScale = 0.92 + pulse * 0.16 + anticipation * 0.4 + strength * 0.3;
      for (const { material, base } of cores) material.emissiveIntensity = base * coreScale;
      for (const material of mouths) material.emissiveIntensity = strength * 4.5 + anticipation * 0.6;
    },
    restore() {
      previous.forEach((state, material) => {
        material.onBeforeCompile = state.onBeforeCompile;
        material.customProgramCacheKey = state.customProgramCacheKey;
        material.emissive.copy(state.emissive);
        material.emissiveIntensity = state.emissiveIntensity;
        material.color.copy(state.color);
        material.roughness = state.roughness;
        material.metalness = state.metalness;
        material.metalnessMap = state.metalnessMap;
        material.needsUpdate = true;
      });
      previous.clear();
    },
  };
}
