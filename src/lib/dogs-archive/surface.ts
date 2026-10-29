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
        const faceCells = { value: faceMode.value === 2 ? 8 : 28 };
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
 if(uFaceMode>1.5){gU=vGuardianUv.x;gT=clamp(vGuardianUv.y,0.,1.);}
 else{
  vec3 gPerp=gRel-gAxis*dot(gRel,gAxis);
  vec3 gRef=normalize(cross(gAxis,abs(gAxis.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.)));
  vec3 gRef2=cross(gAxis,gRef);
  gU=atan(dot(gPerp,gRef2),dot(gPerp,gRef))/6.2831853+.5;
 }
 float gEdge=pow(1.-saturate(dot(normal,normalize(vViewPosition))),3.);
 float gHot=exp(-pow((1.-gT)/.14,2.));
 float gPulse=dot(emissive,vec3(.3333))/1.4;
 float gGrad=mix(.35,1.2,pow(gT,1.5));
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
  float gH=uFaceRows*pow(gT,2.);
  float gA=uFaceCells*gU+gH,gB=uFaceCells*gU-gH;
  float gU2=fract(gU+.5);
  float gA2=uFaceCells*gU2+gH,gB2=uFaceCells*gU2-gH;
  float gWa=min(fwidth(gA),fwidth(gA2)),gWb=min(fwidth(gB),fwidth(gB2));
  float gFa=fract(gA),gFb=fract(gB);
  float gDa=min(gFa,1.-gFa),gDb=min(gFb,1.-gFb);
  float gLineA=1.-smoothstep(.0625-gWa,.0625+gWa,gDa);
  float gLineB=1.-smoothstep(.0625-gWb,.0625+gWb,gDb);
  float gFade=1.-smoothstep(.25,.6,max(gWa,gWb));
  float gLines=max(gLineA,gLineB)*gFade;
  float gDmin=min(gDa,gDb);
  float gCellShade=1.-.6*smoothstep(.06,.4,gDmin)*gFade;
  diffuseColor.rgb=vec3(.008,.07,.025)*(1.-.7*gEdge);
  vec3 gCells=vec3(.02,.2,.075)*(.3+.9*gT)*gCellShade*(1.-.8*gEdge);
  vec3 gMint=mix(vec3(.4,1.,.56),vec3(.86,1.,.9),pow(gT,3.));
  vec3 gStar=vec3(.8,1.,.86)*gHot*(1.4+.6*pow(abs(cos(uFaceCells*3.1415927*gU)),6.));
  totalEmissiveRadiance=gCells*gPulse+(gMint*gLines*gGrad*1.4+gStar+vec3(.78,1.,.84)*gHot*gHot*.4)*gPulse*(1.-.6*gEdge);
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
 float gFall=mix(1.1,.06,pow(clamp(vCoreRadius,0.,1.),.6));
 totalEmissiveRadiance*=gFall;
 totalEmissiveRadiance+=vec3(.7,1.,.78)*exp(-vCoreRadius*vCoreRadius*9.)*.55;
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
        material.envMapIntensity = 0.7;
        material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
{
 float gNdV=saturate(dot(normal,normalize(vViewPosition)));
 totalEmissiveRadiance+=vec3(.1,.38,.16)*pow(1.-gNdV,3.)*.35;
}`,
          );
        };
        material.customProgramCacheKey = () => "guardian-horn-v1";
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
        material.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, uniforms);
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nuniform vec3 uKeyDir;uniform float uTranslucency;",
            )
            .replace(
              "#include <emissivemap_fragment>",
              `#include <emissivemap_fragment>
#ifdef GUARDIAN_BONE
if(gVein>.001){
 // The veins also bend the normal a little (bump from screen-space derivatives).
 vec3 gSp=-vViewPosition;vec3 gSx=dFdx(gSp),gSy=dFdy(gSp);
 vec2 gHd=vec2(dFdx(gVein),dFdy(gVein))*.018;
 vec3 gR1=cross(gSy,normal),gR2=cross(normal,gSx);
 float gDet=dot(gSx,gR1)*(float(gl_FrontFacing)*2.-1.);
 normal=normalize(abs(gDet)*normal-sign(gDet)*(gHd.x*gR1+gHd.y*gR2));
}
#endif
{
 vec3 gV=normalize(vViewPosition);
 float gNdV=saturate(dot(normal,gV));
 float gFres=pow(1.-gNdV,2.2);
 float gWrap=saturate((dot(normal,uKeyDir)+.7)/1.7);
 // inner glow (wrap-lit) and a lighter glass rim
 totalEmissiveRadiance+=vec3(.55,.92,.62)*(.14+.26*gWrap)*uTranslucency;
 totalEmissiveRadiance+=vec3(.78,1.,.84)*gFres*.5;
 // edges denser than the middle, like a glass rod
 diffuseColor.a*=.72+.28*gFres;
}`,
            );
        };
        material.customProgramCacheKey = () => "guardian-glass-v1";
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
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vGuardianWorld;varying vec3 vGuardianLocal;")
          .replace(
            "#include <skinning_vertex>",
            "#include <skinning_vertex>\nvGuardianWorld=(modelMatrix*vec4(transformed,1.)).xyz;vGuardianLocal=position;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
uniform highp sampler3D uNoise;
uniform float uTime,uStrength,uAnticipation,uRimStrength,uTransStrength,uPaintedContrast,uTranslucency,uClarity;
uniform vec3 uRimDir,uKeyDir,uRimColor,uTransColor;
uniform vec2 uBoneRange;
varying vec3 vGuardianWorld;
float gBone,gLum;
const float gSkinFamily=${family === "bone" ? "0." : "1."};
const float gPainted=${material.map ? "1." : "0."};
${family === "bone" ? "#define GUARDIAN_BONE" : ""}
varying vec3 vGuardianLocal;uniform float uVeinScale;float gVein;
vec3 gvHash3(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}
float gvEdge(vec3 p){vec3 i=floor(p),f=fract(p);float f1=8.,f2=8.;
 for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec3 g=vec3(float(x),float(y),float(z));vec3 o=gvHash3(i+g);float d=length(g+o-f);if(d<f1){f2=f1;f1=d;}else if(d<f2){f2=d;}}
 return f2-f1;}
const float gAtlas=${material.map && /painted/i.test(material.name) ? "1." : "0."};`,
          )
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
#ifdef GUARDIAN_BONE
{
 // Fine reticulation on bone: Voronoi edges at two scales in the bind-pose surface space
 // (stable on the skin in every pose), each fading before it could alias.
 vec3 gVp=vGuardianLocal*uVeinScale;
 float gVfw=length(fwidth(gVp));
 float gFade1=1.-smoothstep(.02,.06,gVfw),gFade2=1.-smoothstep(.008,.025,gVfw);
 gVein=0.;
 if(gFade1>.01){
  float gE1=gvEdge(gVp*10.);float gV1=(1.-smoothstep(0.,.14,gE1))*gFade1;
  float gV2=0.;
  if(gFade2>.01){float gE2=gvEdge(gVp*25.);gV2=(1.-smoothstep(0.,.18,gE2))*gFade2;}
  gVein=gV1*.55+gV2*.45;
 }
}
#endif
if(gPainted>.5){
 // Painted albedo (the 2026-10-30 tiles now, the projected originals later): the texture
 // already says where ridge and pit are, so it passes through with a luminance curve only.
 // Pale ridges rise toward green-white and glow a little; pits stay near-black; no tint, no
 // mottling. uPaintedContrast scales the curve (1 for the tiles, lower for an atlas).
 gLum=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
 #ifdef USE_MAP
 // Clarity: the projection lands as pale low-frequency blotches. The map's own blurred
 // level (2.5 mips up) is the blotch; it is flattened toward the dark base and the detail
 // above it (ridges) is amplified, so ridges stay crisp pale lines and pits stay black.
 if(uClarity>.001){
  vec2 gTs=vec2(textureSize(map,0));
  vec2 gDx=dFdx(vMapUv*gTs),gDy=dFdy(vMapUv*gTs);
  float gLod=.5*log2(max(max(dot(gDx,gDx),dot(gDy,gDy)),1e-8));
  vec3 gBlur=textureLod(map,vMapUv,gLod+2.5).rgb;
  // The detail is read a little above the pixel's own level and soft-limited, so texel noise
  // and compression grain are not amplified into white specks (seen at 1440 and on iPhone).
  vec3 gDetail=textureLod(map,vMapUv,gLod+.9).rgb-gBlur;
  gDetail/=1.+abs(gDetail)*3.;
  vec3 gDark=vec3(.012,.03,.016);
  vec3 gClear=mix(gBlur,gDark,.5)+gDetail*1.6;
  diffuseColor.rgb=diffuse*mix(sampledDiffuseColor.rgb,max(gClear,vec3(0.)),uClarity);
  gLum=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
 }
 #endif
 // The projected atlas (gAtlas) already carries the originals' contrast: a third of the
 // curve and half the hue work; the procedural tiles take the full treatment.
 float gTouch=uPaintedContrast*mix(1.,.35,gAtlas);
 float gCurve=mix(gLum*.8,.12+.56*smoothstep(.05,.4,gLum),smoothstep(.03,.1,gLum));
 float gL2=mix(gLum,gCurve,gTouch);
 vec3 gHue=diffuseColor.rgb/max(gLum,1e-4);
 // 05 is green throughout: deep emerald darks (saturation kept, a little boosted) and pale
 // MINT ridges (146,182,143 sRGB → hue (.68,1.13,.66)), never white.
 gHue=mix(vec3(1.),gHue,1.2);
 gHue=mix(gHue,vec3(.68,1.13,.66),smoothstep(.3,.7,gL2)*mix(.9,.5,gAtlas));
 diffuseColor.rgb=gHue*gL2;
 gLum=gL2;
 gBone=smoothstep(.22,.55,gL2);
}else{
 // Bone is pale OR grey-green (low saturation); ink and membranes are saturated green.
 // Saturation survives an AO bake multiplied into the vertex colours.
 gLum=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
 float gMax=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b));
 float gSat=(gMax-min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b)))/max(gMax,1e-4);
 // Bone meshes: 2026-10-28 bone is luminance ≥ 0.12 at saturation ≈ 0.38; 2026-10-29 bone is
 // saturation 0.2–0.3 at any luminance; ink of both is saturation ≥ 0.5. Skin meshes carry
 // authored ink tiles (v8+) that are grey-green by design, so there only clearly pale texels
 // (the painted combs) count as bone and saturation is ignored.
 float gBoneMesh=max(smoothstep(uBoneRange.x,uBoneRange.y,gLum)*(1.-smoothstep(.45,.6,gSat)),1.-smoothstep(.3,.5,gSat));
 float gSkinMesh=smoothstep(.2,.42,gLum);
 gBone=mix(gBoneMesh,gSkinMesh,gSkinFamily);
 float gMottle=texture(uNoise,vGuardianWorld*.085+vec3(.3)).r;
 float gFine=texture(uNoise,vGuardianWorld*.6+vec3(1.7)).g;
 // Membranes: black-green ink. Bone: pale grey-green, lifted toward ~0.22 linear when the
 // authored value is darker (the 2026-10-28 bone), left alone when it is already pale.
 float gLift=clamp(.5/max(gLum,.02),1.,2.);
 vec3 gTint=mix(vec3(.2,.34,.24),vec3(.8,1.04,.78)*gLift,gBone);
 diffuseColor.rgb*=gTint*(.74+gMottle*.45)*(.9+gFine*.2);
 // Bone stays pale grey-green, never paper: an authored albedo that is already pale (the
 // 2026-10-29 lattice, up to 0.5) would otherwise cross the bloom threshold under the key.
 float gOut=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
 diffuseColor.rgb*=mix(1.,min(1.,.78/max(gOut,1e-4)),gBone);
}
#ifdef GUARDIAN_BONE
 diffuseColor.rgb*=mix(vec3(1.),vec3(.62,.82,.66),gVein);
#endif`,
          )
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
{
 vec3 gV=normalize(vViewPosition);
 float gNdV=saturate(dot(normal,gV));
 // Rims belong to silhouettes of broad surfaces. On thin bars (the 2026-10-29 lattice) the
 // normal turns within a few pixels and nearly every pixel is grazing, so a plain fresnel
 // paints the whole bar: fwidth(normal) measures that thinness and suppresses the rim there.
 // Bone that is already pale needs less rim than ink.
 float gThinness=smoothstep(.08,.35,length(fwidth(normal)));
 float gFres=pow(1.-gNdV,3.)*(1.-.9*gThinness);
 float gRimFace=saturate(dot(normal,uRimDir))*.75+.25;
 float gPaleness=smoothstep(.12,.35,gLum);
 float gRim=min(gFres*gRimFace*(.22+.78*gBone)*mix(1.,.45,gPaleness)*uRimStrength,.4);
 // Thin membranes glow where the fire is behind the surface itself, and mostly at their
 // edges: without occlusion a broad back-lit term would wash the whole body green.
 float gBack=saturate(dot(-uRimDir,gV));
 float gThin=saturate(dot(normal,-uRimDir));
 float gEdge=.12+.88*pow(1.-gNdV,2.5);
 float gTrans=pow(gThin,2.)*pow(gBack,1.5)*gEdge*(1.-gBone)*uTransStrength;
 float gKey=saturate(dot(normal,uKeyDir));
 totalEmissiveRadiance+=uRimColor*gRim*(1.+uStrength*.25)+uTransColor*gTrans*(1.+uStrength*.4);
 totalEmissiveRadiance+=uRimColor*gKey*gFres*gBone*.18;
 // Translucent ridges and bone glow a little from within, most where the key wraps around.
 float gWrap=saturate((dot(normal,uKeyDir)+.6)/1.6);
 totalEmissiveRadiance+=vec3(.62,.98,.64)*gBone*(.16+.34*gWrap)*uTranslucency;
}`,
          )
          .replace(
            "#include <aomap_fragment>",
            `#include <aomap_fragment>
{
 // Ink outline: membranes darken at grazing angles like a brush edge.
 float gNdV2=saturate(dot(normal,normalize(vViewPosition)));
 float gInk=1.-pow(1.-gNdV2,5.)*mix(.75,.25,gBone);
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
  writeCoreRadius(model);
  return {
    patched,
    families,
    update(time, strength, anticipation) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.35);
      const latticeScale = 1.25 + pulse * 0.3 + anticipation * 1.0 + strength * 0.5;
      for (const { material, base } of lattice) material.emissiveIntensity = base * latticeScale;
      // The references' cores glow white-green; the authored strength is modest, so scale it
      // up to the edge of the bloom threshold and let the breath push it over.
      const coreScale = 2.5 + pulse * 0.3 + anticipation * 0.6 + strength * 0.4;
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
