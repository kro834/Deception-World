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
  /** 1 = full luminance curve on painted albedo (the v8 tiles); lower it for an atlas that
   * already carries the originals' ridge/pit contrast. */
  uPaintedContrast: { value: number };
  /** Translucent wrap glow on pale parts (ridges, bone): 0 disables. */
  uTranslucency: { value: number };
  /** World-space base and tip of the face leaf (HeadPivot → MouthSocket): the lattice
   * brightens toward the tip. */
  uFaceBase: { value: THREE.Vector3 };
  uFaceTip: { value: THREE.Vector3 };
  /** Unsharp mask on painted albedo: 0 off, 1 full (ridges crisp, blotches flattened). */
  uClarity: { value: number };
  /** World units per model unit: the bone veins are sized in world space. */
  uVeinScale: { value: number };
  /** Irradiance at which the toon ramp's light band is fully on (set per light rig). */
  uToonRange: { value: number };
};

export function createGuardianSurfaceUniforms(noise: THREE.Data3DTexture): GuardianSurfaceUniforms {
  return {
    uNoise: { value: noise },
    uTime: { value: 0 },
    uStrength: { value: 0 },
    uAnticipation: { value: 0 },
    uRimDir: { value: new THREE.Vector3(-0.5, 0.2, -0.8).normalize() },
    uKeyDir: { value: new THREE.Vector3(0.4, 0.7, 0.6).normalize() },
    uRimColor: { value: new THREE.Color(0.6, 1.0, 0.64) },
    uTransColor: { value: new THREE.Color(0.06, 0.42, 0.14) },
    uRimStrength: { value: 0.55 },
    uTransStrength: { value: 0.4 },
    // Linear albedo luminance: membranes sit below 0.035, bone rims above 0.11.
    uBoneRange: { value: new THREE.Vector2(0.035, 0.11) },
    uPaintedContrast: { value: 1 },
    uTranslucency: { value: 1 },
    uFaceBase: { value: new THREE.Vector3(0, 1, 0) },
    uFaceTip: { value: new THREE.Vector3(0, 0, 1) },
    // Off until the v13 re-projection: on the v12 atlas it read as specks or darkened the body.
    uClarity: { value: 0 },
    uVeinScale: { value: 1 },
    uToonRange: { value: 3.5 },
  };
}

/** Families by the material name's prefix (the part before `|`): `Bone`, `Skin`, `Mouth`,
 * `Rune` (authored emission). Within `Rune`, `lattice` is the face (pulse-driven glow) and
 * `core` any other emitter such as the whorl centres (kept as authored, gently breathing).
 * The prefix decides: "Bone | v3 lattice" is bone, not the face. */
export const guardianSurfaceFamily = (material: THREE.Material) => {
  const name = material.name;
  const prefix = name.split(/[|:]/, 1)[0];
  if (/glass|crystal/i.test(prefix)) return "glass";
  if (/horn|lacquer|obsidian/i.test(prefix)) return "horn";
  if (/bone|ivory|shell|carapace|ridge|teeth/i.test(prefix)) return "bone";
  if (/mouth|cavity/i.test(prefix)) return "mouth";
  if (/rune|emission|glow/i.test(prefix))
    return /face|forehead|lattice/i.test(name) ? "lattice" : "core";
  if (/face|forehead/i.test(prefix)) return "lattice";
  return "skin";
};
const surfaceFamily = guardianSurfaceFamily;

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
      vertexColors: boolean;
      transparent: boolean;
      opacity: number;
      depthWrite: boolean;
      side: THREE.Side;
      envMapIntensity: number;
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
        vertexColors: material.vertexColors,
        transparent: material.transparent,
        opacity: material.opacity,
        depthWrite: material.depthWrite,
        side: material.side,
        envMapIntensity: material.envMapIntensity,
      });
      // A projected atlas (2026-10-30 "painted" materials) already carries the baked AO; any
      // vertex colour left on those primitives would darken it a second time.
      if (material.map && /painted/i.test(material.name) && material.vertexColors)
        material.vertexColors = false;
      if (family === "lattice") {
        // An authored emissive texture keeps its own colours and strength; only the pulse is
        // driven here. The legacy wire lattice gets the painting's white-green.
        if (!material.emissiveMap && !material.map) {
          material.color.set("#0d1f14");
          material.emissive.set("#bfffd0");
          lattice.push({ material, base: 1.2 });
        } else lattice.push({ material, base: material.emissiveIntensity });
        // The face: a leaf-shaped lattice glowing saturated green over near-black gaps, the
        // lines brightening toward the tip, a white-hot point at the tip (05/07/08).
        // Lattice source: 2 = the v18 bud's own UV0 (u around, v base→tip); 1 = a temporary
        // parametrisation around the HeadPivot→MouthSocket axis; 0 = the authored mask.
        const faceMode = {
          value: /face lattice/i.test(material.name) && node.geometry.getAttribute("uv") ? 2 : 1,
        };
        // The v17 leaf shows about a quarter turn of the axis parametrisation, so it takes
        // more cells per turn to show 6–8 across; the v18 bud's UV spans the whole bud.
        const faceCells = { value: faceMode.value === 2 ? 16 : 28 };
        const faceRows = { value: faceMode.value === 2 ? 10 : 12 };
        material.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, {
            uFaceBase: uniforms.uFaceBase,
            uFaceTip: uniforms.uFaceTip,
            uFaceMode: faceMode,
            uFaceCells: faceCells,
            uFaceRows: faceRows,
          });
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying vec3 vGuardianWorld;varying vec2 vGuardianUv;",
            )
            .replace(
              "#include <skinning_vertex>",
              "#include <skinning_vertex>\nvGuardianWorld=(modelMatrix*vec4(transformed,1.)).xyz;vGuardianUv=uv;",
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nuniform vec3 uFaceBase,uFaceTip;uniform float uFaceMode,uFaceCells,uFaceRows;varying vec3 vGuardianWorld;varying vec2 vGuardianUv;",
            )
            .replace(
              "#include <color_fragment>",
              "#include <color_fragment>\n if(uFaceMode<.5)diffuseColor.rgb=mix(diffuseColor.rgb*vec3(.35,.7,.45),vec3(.02,.17,.06),.75);",
            )
            .replace(
              "#include <emissivemap_fragment>",
              `#include <emissivemap_fragment>
{
 vec3 gAxis=uFaceTip-uFaceBase;float gLen=max(length(gAxis),1e-3);gAxis/=gLen;
 vec3 gRel=vGuardianWorld-uFaceBase;
 float gT=clamp(dot(gRel,gAxis)/gLen,0.,1.);
 float gU=0.;
 float gTa=gT;
 if(uFaceMode>1.5){gU=vGuardianUv.x;gT=clamp(vGuardianUv.y,0.,1.);}
 else{
  vec3 gPerp=gRel-gAxis*dot(gRel,gAxis);
  vec3 gRef=normalize(cross(gAxis,abs(gAxis.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.)));
  vec3 gRef2=cross(gAxis,gRef);
  gU=atan(dot(gPerp,gRef2),dot(gPerp,gRef))/6.2831853+.5;
 }
 float gEdge=pow(1.-saturate(dot(normal,normalize(vViewPosition))),3.);
 float gHot=exp(-pow((1.-gTa)/.14,2.));
 float gPulse=dot(emissive,vec3(.3333))/1.4;
 float gGrad=mix(.35,1.2,pow(gTa,1.5));
 if(uFaceMode<.5){
  float gLine=dot(totalEmissiveRadiance,vec3(.3333));
  diffuseColor.rgb*=1.-.7*gEdge;
  vec3 gCells=vec3(.03,.24,.09)*(.35+.85*gT)*(1.-.8*gEdge);
  totalEmissiveRadiance=gCells+(vec3(.4,1.,.56)*gLine*gGrad*1.3+vec3(.8,1.,.86)*gLine*gHot*1.8+vec3(.78,1.,.84)*gHot*gHot*.45)*(1.-.6*gEdge);
 }else{
  // Procedural net: two spiral families around the bud with the rows compressing toward
  // the tip (a pinecone net). Antialiased from a seam-free derivative: the u seam is moved
  // half a turn for the second estimate, and the cell count is even, so both estimates
  // describe the same lines. Line width is 1/8 of a cell.
  // The row coordinate bends harder toward the tip, so the two families sweep around the
  // bud and converge there like a sunflower's seed spirals; lens-shaped cells follow the flow.
  // g(t)=.6t+.4t³: the families cross at 41° at the base and tighten toward the tip (89° at
  // t=.9), never nearly parallel.
  float gH=uFaceRows*(.6*gT+.4*gT*gT*gT);
  // an azimuthal drift that dies toward the tip, so no segment stays straight
  float gDrift=.05*(1.-gT)*sin(12.566371*gU);
  float gUd=gU+gDrift;
  float gA=uFaceCells*gUd+gH,gB=uFaceCells*gUd-gH;
  float gU2=fract(gU+.5)+gDrift;
  float gA2=uFaceCells*gU2+gH,gB2=uFaceCells*gU2-gH;
  float gWa=min(fwidth(gA),fwidth(gA2)),gWb=min(fwidth(gB),fwidth(gB2));
  float gFa=fract(gA),gFb=fract(gB);
  float gDa=min(gFa,1.-gFa),gDb=min(gFb,1.-gFb);
  float gLineA=1.-smoothstep(.0625-gWa,.0625+gWa,gDa);
  float gLineB=1.-smoothstep(.0625-gWb,.0625+gWb,gDb);
  // The net fades smoothly into the tip glow before its cells could degenerate into stripes.
  float gTip=smoothstep(.65,.9,gTa);
  float gFade=(1.-smoothstep(.25,.6,max(gWa,gWb)))*(1.-gTip);
  float gLines=max(gLineA,gLineB)*gFade;
  float gDmin=min(gDa,gDb);
  // Each cell is darker at its centre and lighter toward its rim (an inner glow at the lines).
  float gCellShade=mix(1.,.42,smoothstep(.05,.42,gDmin)*gFade);
  diffuseColor.rgb=vec3(.008,.07,.025)*(1.-.7*gEdge);
  // The bud glows from within: the cells brighten toward the tip and the cap rises there, so
  // the tip third blooms softly while the base stays a readable lattice.
  vec3 gCells=vec3(.015,.15,.055)*(.3+.5*gTa+1.4*gTa*gTa*gTa)*gCellShade*(1.-.8*gEdge);
  vec3 gMint=mix(vec3(.4,1.,.56),vec3(.8,1.,.86),pow(gTa,3.));
  vec3 gRad=gCells*gPulse+gMint*gLines*gGrad*1.5*gPulse*(1.-.6*gEdge);
  gRad+=vec3(.3,1.,.5)*gTip*.9*gPulse;
  gRad=min(gRad,vec3(mix(1.3,2.4,smoothstep(.7,1.,gTa))));
  // a small star at the geometric tip only (the last 5% of the bud's length)
  float gStar=exp(-pow((1.-gTa)/.05,2.));
  totalEmissiveRadiance=gRad+vec3(.8,1.,.86)*gStar*(1.2+.5*pow(abs(cos(uFaceCells*3.1415927*gU)),6.))*gPulse;
 }
}`,
            );
        };
        material.customProgramCacheKey = () => "guardian-face-lattice-v3";
        material.needsUpdate = true;
        continue;
      }
      if (family === "core") {
        cores.push({ material, base: material.emissiveIntensity });
        // The galaxy spirals glow from the centre outward along their arms, fading with
        // radius (aCoreRadius, written per vertex below), with a hot centre; no flat disc.
        material.onBeforeCompile = (shader) => {
          shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nattribute float aCoreRadius;varying float vCoreRadius;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCoreRadius=aCoreRadius;");
          shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nvarying float vCoreRadius;")
            .replace(
              "#include <color_fragment>",
              "#include <color_fragment>\n diffuseColor.rgb*=mix(1.,.55,vCoreRadius);",
            )
            .replace(
              "#include <emissivemap_fragment>",
              `#include <emissivemap_fragment>
{
 float gFall=mix(1.,.04,pow(clamp(vCoreRadius,0.,1.),.6));
 totalEmissiveRadiance*=gFall;
 totalEmissiveRadiance+=vec3(.7,1.,.78)*exp(-vCoreRadius*vCoreRadius*12.)*.7;
}`,
            );
        };
        material.customProgramCacheKey = () => "guardian-whorl-core-v2";
        material.needsUpdate = true;
        continue;
      }
      if (family === "mouth") {
        material.emissive.set("#39ff7a");
        material.emissiveIntensity = 0;
        mouths.push(material);
        continue;
      }
      if (family === "horn") {
        // Glossy black horns (lacquer / obsidian): near-black, low roughness for a sharp
        // highlight, a faint green rim from the scene light. No lift, no ink tint.
        if (material.color.r + material.color.g + material.color.b > 0.3 && !material.map)
          material.color.setRGB(0.008, 0.011, 0.008);
        material.roughness = Math.min(material.roughness, 0.18);
        material.metalness = 0;
        material.metalnessMap = null;
        material.envMapIntensity = 0;
        material.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, uniforms);
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nuniform float uToonRange;uniform vec3 uKeyDir;",
            )
            .replace("#include <color_fragment>", "#include <color_fragment>\n diffuseColor.rgb=vec3(.5);")
            .replace(
              "#include <aomap_fragment>",
              `#include <aomap_fragment>
{
 // Lacquer: near-black in three tones, one crisp highlight band, a thin mint rim.
 float gIrr=dot(reflectedLight.directDiffuse+reflectedLight.indirectDiffuse,vec3(.2126,.7152,.0722))*PI*2.;
 float gN=gIrr/uToonRange;
 float gMid=smoothstep(.2,.34,gN),gHi=smoothstep(.56,.72,gN);
 vec3 gTone=mix(mix(vec3(.004,.006,.004),vec3(.012,.02,.013),gMid),vec3(.03,.05,.034),gHi);
 vec3 gV=normalize(vViewPosition);
 float gNdV=saturate(dot(normal,gV));
 float gRim=smoothstep(.5,.58,pow(1.-gNdV,1.5));
 gTone+=vec3(.18,.5,.26)*gRim*.6;
 vec3 gH=normalize(uKeyDir+gV);
 float gSpec=pow(saturate(dot(normal,gH)),96.);
 reflectedLight.directDiffuse=gTone;
 reflectedLight.indirectDiffuse=vec3(0.);
 reflectedLight.directSpecular=vec3(.78,.95,.84)*smoothstep(.6,.7,gSpec)*.9*gMid;
 reflectedLight.indirectSpecular=vec3(0.);
}`,
            );
        };
        material.customProgramCacheKey = () => "guardian-horn-v2";
        material.needsUpdate = true;
        patched++;
        continue;
      }
      if (family === "glass") {
        // Pale translucent green glass (the big arms' ladder rungs and their flame-shaped
        // hooks in 05): alpha-blended over what lies behind, more opaque and lighter at the
        // edges (fresnel), wrap-lit with a faint inner glow, low roughness. No transmission
        // pass, so phones pay only the blend.
        material.transparent = true;
        material.opacity = 0.74;
        material.depthWrite = false;
        material.side = THREE.DoubleSide;
        material.roughness = Math.min(material.roughness, 0.3);
        material.metalness = 0;
        material.metalnessMap = null;
        if (material.color.r > 0.9 && material.color.g > 0.9 && material.color.b > 0.9 && !material.map)
          material.color.setRGB(0.42, 0.78, 0.5);
        material.envMapIntensity = 0.25;
        material.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, uniforms);
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nuniform float uToonRange,uTranslucency;uniform vec3 uKeyDir;float gGlassFres;",
            )
            .replace("#include <color_fragment>", "#include <color_fragment>\n diffuseColor.rgb=vec3(.5);")
            .replace(
              "#include <emissivemap_fragment>",
              `#include <emissivemap_fragment>
{
 vec3 gV=normalize(vViewPosition);
 float gNdV=saturate(dot(normal,gV));
 gGlassFres=pow(1.-gNdV,2.2);
 float gWrap=saturate((dot(normal,uKeyDir)+.7)/1.7);
 // a soft inner light and a lighter glass rim; the edges denser than the middle
 totalEmissiveRadiance+=vec3(.5,.9,.58)*(.12+.22*gWrap)*uTranslucency;
 totalEmissiveRadiance+=vec3(.78,1.,.84)*smoothstep(.35,.6,gGlassFres)*.45;
 diffuseColor.a*=.72+.28*gGlassFres;
}`,
            )
            .replace(
              "#include <aomap_fragment>",
              `#include <aomap_fragment>
{
 // Jade glass in three tones with one crisp highlight.
 float gIrr=dot(reflectedLight.directDiffuse+reflectedLight.indirectDiffuse,vec3(.2126,.7152,.0722))*PI*2.;
 float gN=gIrr/uToonRange;
 float gMid=smoothstep(.2,.34,gN),gHi=smoothstep(.56,.72,gN);
 reflectedLight.directDiffuse=mix(mix(vec3(.1,.26,.14),vec3(.24,.5,.28),gMid),vec3(.46,.76,.52),gHi);
 reflectedLight.indirectDiffuse=vec3(0.);
 vec3 gH=normalize(uKeyDir+normalize(vViewPosition));
 reflectedLight.directSpecular=vec3(.7,.95,.78)*smoothstep(.6,.7,pow(saturate(dot(normal,gH)),64.))*.5*gMid;
 reflectedLight.indirectSpecular*=.5;
}`,
            );
        };
        material.customProgramCacheKey = () => "guardian-glass-v2";
        material.needsUpdate = true;
        patched++;
        continue;
      }
      // Glassy bone and a subtle sheen on the painted skin (the authored 0.58–0.66 stays
      // the upper bound).
      material.roughness = Math.min(
        material.roughness,
        family === "bone" ? 0.5 : material.map ? 0.55 : 0.9,
      );
      // Ink is a dielectric. The 2026-10-28 ORM's blue channel gave the membranes metalness,
      // which mirrored the studio and read as grey.
      material.metalness = 0;
      material.metalnessMap = null;
      // Tile normal maps at half strength: the single crisp highlight must stay one clean shape.
      if (material.normalMap) material.normalScale.multiplyScalar(0.5);
      // Anime shading: no environment reflections on the body.
      material.envMapIntensity = 0;
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vGuardianLocal;")
          .replace("#include <skinning_vertex>", "#include <skinning_vertex>\nvGuardianLocal=position;");
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
uniform float uToonRange,uRimStrength,uTranslucency,uVeinScale;
uniform vec3 uRimDir,uKeyDir,uRimColor;
uniform vec2 uBoneRange;
varying vec3 vGuardianLocal;
float gBone,gLum,gVein,gRimBand,gWrapLight;
const float gSkinFamily=${family === "bone" ? "0." : "1."};
const float gPainted=${material.map ? "1." : "0."};
${family === "bone" ? "#define GUARDIAN_BONE" : ""}
vec3 gvHash3(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}
float gvEdge(vec3 p){vec3 i=floor(p),f=fract(p);float f1=8.,f2=8.;
 for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec3 g=vec3(float(x),float(y),float(z));vec3 o=gvHash3(i+g);float d=length(g+o-f);if(d<f1){f2=f1;f1=d;}else if(d<f2){f2=d;}}
 return f2-f1;}`,
          )
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
gVein=0.;
#ifdef GUARDIAN_BONE
{
 // Fine reticulation on bone: Voronoi edges at two scales in the bind-pose surface space
 // (stable on the skin in every pose), each fading before it could alias.
 vec3 gVp=vGuardianLocal*uVeinScale;
 float gVfw=length(fwidth(gVp));
 float gFade1=1.-smoothstep(.02,.06,gVfw),gFade2=1.-smoothstep(.008,.025,gVfw);
 if(gFade1>.01){
  float gE1=gvEdge(gVp*10.);float gV1=(1.-smoothstep(0.,.16,gE1))*gFade1;
  float gV2=0.;
  if(gFade2>.01){float gE2=gvEdge(gVp*25.);gV2=(1.-smoothstep(0.,.18,gE2))*gFade2;}
  gVein=min(1.,gV1*.8+gV2*.35);
 }
}
#endif
if(gPainted>.5){
 // The atlas only places the ridges and the pits: thresholded into clean shapes (a soft
 // edge), never used as photographic colour. Older atlases carry low-frequency blotches, so
 // a ridge is also what rises above the map's own blurred level.
 gLum=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
 // Region colours of the anime atlas (sRGB): membrane (10,25,14), head skin (36,55,41),
 // pale bone and scales (125,166,132): the threshold sits between the head skin and the bone.
 gBone=smoothstep(.06,.16,gLum);
 #ifdef USE_MAP
 // The anime tiles are about 42 % pale where 05 is about 21 %: the pale regions are eroded
 // by their own blurred level, so only the cores of the ridges stay light.
 vec2 gTs=vec2(textureSize(map,0));
 vec2 gDx=dFdx(vMapUv*gTs),gDy=dFdy(vMapUv*gTs);
 float gLod=.5*log2(max(max(dot(gDx,gDx),dot(gDy,gDy)),1e-8));
 float gBlurL=dot(textureLod(map,vMapUv,gLod+2.).rgb*diffuse,vec3(.2126,.7152,.0722));
 gBone*=smoothstep(.22,.33,gBlurL);
 #endif
}else{
 // Vertex-colour parts: bone is pale OR grey-green (low saturation); ink is saturated green.
 gLum=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
 float gMax=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b));
 float gSat=(gMax-min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b)))/max(gMax,1e-4);
 float gBoneMesh=max(smoothstep(uBoneRange.x,uBoneRange.y,gLum)*(1.-smoothstep(.45,.6,gSat)),1.-smoothstep(.3,.5,gSat));
 float gSkinMesh=smoothstep(.2,.42,gLum);
 gBone=mix(gBoneMesh,gSkinMesh,gSkinFamily);
}
// The tones come after the lights: a neutral albedo keeps the lit irradiance recoverable.
diffuseColor.rgb=vec3(.5);`,
          )
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
#ifdef GUARDIAN_BONE
if(gVein>.001){
 // The veins also bend the normal a little (bump from screen-space derivatives).
 vec3 gSp=-vViewPosition;vec3 gSx=dFdx(gSp),gSy=dFdy(gSp);
 vec2 gHd=vec2(dFdx(gVein),dFdy(gVein))*.02;
 vec3 gR1=cross(gSy,normal),gR2=cross(normal,gSx);
 float gDet=dot(gSx,gR1)*(float(gl_FrontFacing)*2.-1.);
 normal=normalize(abs(gDet)*normal-sign(gDet)*(gHd.x*gR1+gHd.y*gR2));
}
#endif
{
 vec3 gV=normalize(vViewPosition);
 float gNdV=saturate(dot(normal,gV));
 // A clean rim band (thresholded fresnel toward the rim light), suppressed on thin bars.
 float gThinness=smoothstep(.08,.35,length(fwidth(normal)));
 float gFr=pow(1.-gNdV,1.5)*(saturate(dot(normal,uRimDir))*.6+.4);
 gRimBand=smoothstep(.4,.48,gFr)*(1.-.9*gThinness);
 gWrapLight=saturate((dot(normal,uKeyDir)+.6)/1.6);
}`,
          )
          .replace(
            "#include <aomap_fragment>",
            `#include <aomap_fragment>
{
 // Anime shading: the PBR irradiance (every light, the key's shadow) is quantised into three
 // tones and recoloured from the family's palette; ridge or pit picks the palette.
 float gIrr=dot(reflectedLight.directDiffuse+reflectedLight.indirectDiffuse,vec3(.2126,.7152,.0722))*PI*2.;
 float gN=gIrr/uToonRange;
 float gMid=smoothstep(.2,.34,gN),gHi=smoothstep(.56,.72,gN),gHiSkin=smoothstep(.66,.8,gN);
 // skin: near-black emerald (8,20,12) / (20,46,30), a narrow lit band (40,80,55); ridges and
 // bone: mint shadow / mint (146,182,143) / near-white mint.
 vec3 gPit=mix(mix(vec3(.0026,.0072,.0038),vec3(.0084,.0273,.0144),gMid),vec3(.0213,.0821,.0395),gHiSkin);
 vec3 gRdg=mix(mix(vec3(.11,.22,.12),vec3(.25,.42,.24),gMid),vec3(.36,.54,.36),gHi);
 vec3 gTone=mix(gPit,gRdg,gBone);
#ifdef GUARDIAN_BONE
 gTone*=mix(vec3(1.),vec3(.62,.8,.65),gVein);
 // a soft inner light on jade-like bone, not a realistic subsurface
 gTone+=vec3(.2,.34,.2)*gWrapLight*.3*uTranslucency*gBone;
#endif
 gTone+=uRimColor*gRimBand*mix(.16,.06,gBone)*uRimStrength*1.8;
 reflectedLight.directDiffuse=gTone;
 reflectedLight.indirectDiffuse=vec3(0.);
 // one crisp highlight on the glossy dark membranes, only a soft sheen on bone
 vec3 gV2=normalize(vViewPosition);
 vec3 gH=normalize(uKeyDir+gV2);
 float gSpec=pow(saturate(dot(normal,gH)),48.);
 reflectedLight.directSpecular=mix(vec3(.5,.72,.56)*smoothstep(.55,.65,gSpec)*.3,vec3(.3,.44,.3)*gSpec*.2,gBone)*gMid;
 reflectedLight.indirectSpecular=vec3(0.);
}`,
          );
      };
      material.customProgramCacheKey = () => `guardian-toon-surface-v1:${family}`;
      material.needsUpdate = true;
      patched++;
    }
  });
  writeCoreRadius(model);
  return {
    patched,
    families,
    update(time, strength, anticipation) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.35);
      const latticeScale = 1.0 + pulse * 0.25 + anticipation * 0.8 + strength * 0.4;
      for (const { material, base } of lattice) material.emissiveIntensity = base * latticeScale;
      // The references' cores glow white-green; the authored strength is modest, so scale it
      // up to the edge of the bloom threshold and let the breath push it over.
      const coreScale = 1.9 + pulse * 0.25 + anticipation * 0.5 + strength * 0.3;
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
        material.vertexColors = state.vertexColors;
        material.transparent = state.transparent;
        material.opacity = state.opacity;
        material.depthWrite = state.depthWrite;
        material.side = state.side;
        material.envMapIntensity = state.envMapIntensity;
        material.needsUpdate = true;
      });
      previous.clear();
    },
  };
}

/** Per-vertex radial coordinate (0 at a core's centre, 1 at its edge) for the whorl-core
 * primitives, so their glow can fade outward along the spiral arms in every pose. The
 * core vertices are clustered in the rest pose (one cluster per whorl or coil centre). */
function writeCoreRadius(model: THREE.Object3D) {
  const p = new THREE.Vector3();
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry;
    const position = geometry.getAttribute("position");
    if (!position || geometry.getAttribute("aCoreRadius")) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const groups = geometry.groups.length
      ? geometry.groups
      : [{ start: 0, count: geometry.index ? geometry.index.count : position.count, materialIndex: 0 }];
    const members = new Set<number>();
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0];
      if (!material || guardianSurfaceFamily(material) !== "core") continue;
      for (let i = group.start; i < group.start + group.count; i++)
        members.add(geometry.index ? geometry.index.getX(i) : i);
    }
    if (!members.size) return;
    const radius = new Float32Array(position.count).fill(1);
    const clusters: { centre: THREE.Vector3; n: number; max: number }[] = [];
    const merge = 0.55;
    for (const v of members) {
      p.fromBufferAttribute(position, v);
      let best: (typeof clusters)[number] | null = null,
        bestDistance = Infinity;
      for (const cluster of clusters) {
        const distance = cluster.centre.distanceTo(p);
        if (distance < bestDistance) {
          best = cluster;
          bestDistance = distance;
        }
      }
      if (best && bestDistance < merge) {
        best.centre.multiplyScalar(best.n).add(p).divideScalar(best.n + 1);
        best.n++;
      } else clusters.push({ centre: p.clone(), n: 1, max: 0 });
    }
    const owner = new Map<number, (typeof clusters)[number]>();
    for (const v of members) {
      p.fromBufferAttribute(position, v);
      let best = clusters[0],
        bestDistance = Infinity;
      for (const cluster of clusters) {
        const distance = cluster.centre.distanceTo(p);
        if (distance < bestDistance) {
          best = cluster;
          bestDistance = distance;
        }
      }
      best.max = Math.max(best.max, bestDistance);
      owner.set(v, best);
    }
    for (const [v, cluster] of owner) {
      p.fromBufferAttribute(position, v);
      radius[v] = Math.min(1, cluster.centre.distanceTo(p) / Math.max(cluster.max, 1e-4));
    }
    geometry.setAttribute("aCoreRadius", new THREE.BufferAttribute(radius, 1));
  });
}
