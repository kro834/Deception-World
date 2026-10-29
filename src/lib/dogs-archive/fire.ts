import * as THREE from "three";

/** Per-tier budgets. Counts and steps only: motion is never removed by a tier. */
export type FireTier = {
  jetSteps: number;
  cards: number;
  embers: number;
  sparks: number;
};
export const FIRE_TIERS: Record<"high" | "mobile" | "low", FireTier> = {
  high: { jetSteps: 34, cards: 88, embers: 420, sparks: 620 },
  mobile: { jetSteps: 24, cards: 64, embers: 260, sparks: 380 },
  low: { jetSteps: 16, cards: 44, embers: 150, sparks: 220 },
};

const GOLDEN = 0.61803398875;

/** The breath: a ray-marched volume whose mouth sits at local z = -1. Density is built from
 * the shared noise volume (three fetches per step): turbulent lobes separated by ink-dark
 * gaps, a white-hot axis near the mouth and thin bright filaments, as in the breath painting. */
export function createBreathJet(noise: THREE.Data3DTexture, tier: FireTier) {
  const uniforms = {
    uNoise: { value: noise },
    uTime: { value: 0 },
    uStrength: { value: 0 },
    uWorldInverse: { value: new THREE.Matrix4() },
    uDpr: { value: 1 },
    // Scene depth (from the volume pass): the march ends at the creature's surface.
    uDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.1 },
    uFar: { value: 100 },
    uForward: { value: new THREE.Vector3(0, 0, -1) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    glslVersion: THREE.GLSL3,
    defines: { STEPS: tier.jetSteps },
    vertexShader: `out vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `precision highp float;
uniform highp sampler3D uNoise;
uniform highp sampler2D uDepth;
uniform float uTime,uStrength,uNear,uFar;uniform mat4 uWorldInverse;uniform vec2 uResolution;uniform vec3 uForward;
in vec3 vWorld;out vec4 outColor;
vec2 boxHit(vec3 ro,vec3 rd){vec3 a=(-vec3(1)-ro)/rd,b=(vec3(1)-ro)/rd;vec3 n=min(a,b),f=max(a,b);return vec2(max(max(n.x,n.y),n.z),min(min(f.x,f.y),f.z));}
void main(){
 vec3 ro=(uWorldInverse*vec4(cameraPosition,1.)).xyz;
 bool inside=all(lessThanEqual(abs(ro),vec3(1.)));
 if(inside==gl_FrontFacing)discard;
 vec3 rdWorld=normalize(vWorld-cameraPosition);
 vec3 rdLocal=(uWorldInverse*vec4(rdWorld,0.)).xyz;
 float localPerWorld=length(rdLocal);
 vec3 rd=rdLocal/localPerWorld;
 vec2 hit=boxHit(ro,rd);float start=max(0.,hit.x),end=hit.y;
 float sceneDepth=texture(uDepth,gl_FragCoord.xy/uResolution).r;
 float viewZ=(uNear*uFar)/((uFar-uNear)*sceneDepth-uFar);
 end=min(end,-viewZ/max(dot(rdWorld,uForward),1e-3)*localPerWorld);
 if(end<=start)discard;
 float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
 float stepSize=(end-start)/float(STEPS);
 float t=start+stepSize*jitter;
 vec4 sum=vec4(0.);
 for(int i=0;i<STEPS;i++){
  vec3 p=ro+rd*t;t+=stepSize;
  // Clamped: a jittered first sample can sit a hair outside the box, and pow(z<0) is NaN,
  // which the bloom blur would smear over the whole frame.
  float z=clamp((p.z+1.)*.5,0.,1.);
  vec3 fp=vec3(p.xy*1.5,z*2.4-uTime*1.5);
  vec3 warp=texture(uNoise,fp*.5+vec3(0.,0.,uTime*.15)).rgb-.5;
  float n=(texture(uNoise,fp+warp*.55).r-.5)*1.6+.5;
  float n2=(texture(uNoise,fp*2.2+vec3(5.)+warp.zxy*.35).g-.5)*1.6+.5;
  // Narrow at the mouth, widening into the turbulent cloud only well away from the body.
  float radius=.07+pow(z,1.1)*.95;
  vec2 c=warp.xy*z*.9;
  float r=length((p.xy-c)/radius);
  float env=1.-smoothstep(.4,.95,r+(n-.5)*.9);
  float head=1.-smoothstep(.6+uStrength*.35,1.,z+(n2-.5)*.25);
  // Turbulent lobes with hard dark gaps, a near-white axis and bright filaments.
  float lobes=smoothstep(.32,.56,n*.7+n2*.4+(1.-z)*.12);
  float dens=env*head*lobes*2.2;
  float axis=exp(-r*r*(3.+z*7.))*(1.-z*.5)*head;
  float fil=pow(1.-abs(2.*n2-1.),6.)*env*head;
  float ink=smoothstep(.62,1.,1.-abs(2.*n2-1.))*dens+smoothstep(.7,1.,1.-abs(2.*n-1.))*dens*.6;
  vec3 col=mix(vec3(.015,.07,.03),vec3(.14,.6,.22),smoothstep(0.,.4,dens));
  col=mix(col,vec3(.62,.97,.64),smoothstep(.35,.8,dens+axis*.7));
  col+=vec3(1.2,1.5,1.2)*(axis*1.3+fil*.9);
  col*=1.-min(ink,.85);
  // Dense: lobes saturate into opaque pale masses with dark gaps between them.
  float a=1.-exp(-(dens*1.4+axis*2.+fil*1.)*uStrength*stepSize*1.3);
  sum.rgb+=(1.-sum.a)*col*a;sum.a+=(1.-sum.a)*a;
  if(sum.a>.96)break;
 }
 if(sum.a<.005)discard;
 outColor=vec4(max(sum.rgb,vec3(0.))/max(sum.a,.001),clamp(sum.a,0.,1.));
}`,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
    forceSinglePass: true,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  mesh.name = "ForestGreenBreathVolume";
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  const sparkGeometry = new THREE.BufferGeometry();
  const sparkPhases = new Float32Array(tier.sparks);
  for (let i = 0; i < tier.sparks; i++) sparkPhases[i] = (i * GOLDEN) % 1;
  sparkGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(tier.sparks * 3), 3),
  );
  sparkGeometry.setAttribute("aPhase", new THREE.BufferAttribute(sparkPhases, 1));
  const sparkMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `attribute float aPhase;uniform float uTime,uStrength,uDpr;varying float vLife,vHeat;
void main(){float speed=.38+fract(aPhase*53.)*.3;float u=fract(aPhase+uTime*speed);float angle=aPhase*127.+u*5.;float spread=pow(u,1.3)*(.18+fract(aPhase*37.)*.75);
vec3 p=vec3(cos(angle)*spread,sin(angle)*spread+u*u*.25,-.98+u*2.5);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
vHeat=fract(aPhase*7.);gl_PointSize=clamp((18.+vHeat*34.)*uDpr/max(1.,-mv.z),1.,9.);vLife=sin(u*3.14159)*uStrength;}`,
    fragmentShader: `varying float vLife,vHeat;void main(){vec2 p=gl_PointCoord-.5;float a=exp(-dot(p,p)*20.)*vLife;if(a<.02)discard;gl_FragColor=vec4(mix(vec3(.3,1.3,.5),vec3(1.4,2.4,1.5),pow(vHeat,2.5)),a);}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  // The sparks live in the main scene (depth-tested against the body); the volume is drawn by
  // the volume pass. Both share the jet's transform.
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.name = "DetachedForestFireEmbers";
  sparks.frustumCulled = false;
  sparks.renderOrder = 6;
  sparks.visible = false;
  const z = new THREE.Vector3(0, 0, 1);
  return {
    mesh,
    sparks,
    uniforms,
    update(
      time: number,
      strength: number,
      origin: THREE.Vector3,
      direction: THREE.Vector3,
      dpr: number,
    ) {
      uniforms.uTime.value = time;
      uniforms.uStrength.value = strength;
      uniforms.uDpr.value = dpr;
      mesh.visible = sparks.visible = strength > 0.002;
      const length = 7.2 + strength * 1.5;
      mesh.position.copy(origin).addScaledVector(direction, length * 0.5 - 0.035);
      mesh.quaternion.setFromUnitVectors(z, direction);
      mesh.scale.set(2.8, 2.8, length * 0.5);
      mesh.updateMatrixWorld(true);
      sparks.position.copy(mesh.position);
      sparks.quaternion.copy(mesh.quaternion);
      sparks.scale.copy(mesh.scale);
      uniforms.uWorldInverse.value.copy(mesh.matrixWorld).invert();
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
      sparkGeometry.dispose();
      sparkMaterial.dispose();
    },
  };
}

type FlameSkin = {
  mesh: THREE.SkinnedMesh;
  index: number;
  rest: THREE.Vector3;
  restNormal: THREE.Vector3;
  toAnchor: THREE.Matrix4;
};
type FlameSource = {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  facing: number;
  /** Set for vertices of a skinned mesh: the anchor follows the bones each frame. */
  skin?: FlameSkin;
};

/** Fire around the body: large flame cards anchored on outward-facing surface points. Each
 * card is a cylindrical billboard (its growth axis fixed, turned about it to face the camera),
 * shaded with the noise volume into ink-edged tongues with bright cores, drawn with normal
 * blending so dark edges can ink over what lies behind. Instances are depth-sorted on the CPU
 * when the camera moves. Embers rise from the same surface points. Cards on surfaces that face
 * the camera fade, so most fire reads behind and around the silhouette. */
export function createFlameMantle(model: THREE.Object3D, noise: THREE.Data3DTexture, tier: FireTier) {
  model.updateMatrixWorld(true);
  const sourcesByAnchor = new Map<THREE.Object3D, FlameSource[]>();
  const p = new THREE.Vector3(),
    n = new THREE.Vector3(),
    centre = new THREE.Vector3();
  const bounds = new THREE.Box3().setFromObject(model);
  bounds.getCenter(centre);
  let skippedDeforming = 0,
    skippedFace = 0,
    candidates = 0;
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const position = node.geometry.getAttribute("position");
    const normals = node.geometry.getAttribute("normal");
    if (!position || !normals) return;
    let anchor: THREE.Object3D = model;
    for (let parent = node.parent; parent && parent !== model; parent = parent.parent) {
      if (/Pivot/.test(parent.name)) {
        anchor = parent;
        break;
      }
    }
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (
      /HeadPivot|JawPivot/.test(anchor.name) ||
      /head|face|jaw|mouth|lattice|rune/i.test(node.name) ||
      materials.some((material) => /rune|mouth|cavity|emission/i.test(material.name))
    ) {
      skippedFace++;
      return;
    }
    const skinned = node instanceof THREE.SkinnedMesh ? node : null;
    if (skinned && !(node.geometry.getAttribute("skinIndex") && node.geometry.getAttribute("skinWeight"))) {
      skippedDeforming++;
      return;
    }
    const inv = anchor.matrixWorld.clone().invert();
    const normalToWorld = new THREE.Matrix3().getNormalMatrix(node.matrixWorld);
    const normalToAnchor = new THREE.Matrix3().getNormalMatrix(inv);
    const toAnchor = skinned ? inv.clone().multiply(node.matrixWorld) : null;
    const sources = sourcesByAnchor.get(anchor) ?? [];
    sourcesByAnchor.set(anchor, sources);
    const stride = Math.max(1, Math.floor(position.count / 400));
    for (let i = 0; i < position.count; i += stride) {
      p.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
      n.fromBufferAttribute(normals, i).applyMatrix3(normalToWorld).normalize();
      // Outward-facing surface points only: fire wraps the silhouette, not the inner cells.
      const facing = n.dot(p.clone().sub(centre).normalize());
      if (facing < 0.15) continue;
      candidates++;
      sources.push({
        position: p.clone().applyMatrix4(inv),
        normal: n.clone().applyMatrix3(normalToAnchor).normalize(),
        facing,
        skin:
          skinned && toAnchor
            ? {
                mesh: skinned,
                index: i,
                rest: new THREE.Vector3().fromBufferAttribute(position, i),
                restNormal: new THREE.Vector3().fromBufferAttribute(normals, i),
                toAnchor,
              }
            : undefined,
      });
    }
  });
  const uniforms = {
    uNoise: { value: noise },
    uTime: { value: 0 },
    uStrength: { value: 0 },
    uAnticipation: { value: 0 },
    uDpr: { value: 1 },
  };
  const cardMaterial = new THREE.ShaderMaterial({
    uniforms,
    glslVersion: THREE.GLSL3,
    vertexShader: `in vec3 iOrigin,iAxis,iNormal;in vec2 iSize;in float iSeed;
uniform float uTime,uStrength,uAnticipation;
out vec2 vQ;out float vSeed,vFade,vIntensity;
// A painted tongue's centreline in the (axis, right) plane, in units of its length: a stem
// with an S bend, then a hook that curls back and tightens, like the licks in the painting.
void tongue(float s,float side,float ph,out vec2 p,out vec2 t){
 float sway=sin(uTime*1.1+ph)*.06+sin(uTime*2.1+ph*2.)*.025;
 float hs=.62;
 float ss=min(s,hs);
 float v=side*(.17*sin(ss*3.1416)+.08*ss*ss)+sway*ss;
 vec2 e=vec2(ss,v);
 vec2 et=normalize(vec2(1.,side*(.17*3.1416*cos(ss*3.1416)+.16*ss)+sway));
 if(s<=hs){p=e;t=et;return;}
 float k=(s-hs)/(1.-hs);
 vec2 n=vec2(-et.y,et.x)*(-side);
 float r0=.17,r=r0*(1.-.45*k),phi=k*2.7;
 vec2 c=e+n*r0;
 p=c+r*(-n*cos(phi)+et*sin(phi));
 t=normalize(n*sin(phi)+et*cos(phi));
}
void main(){
 vec3 wo=(modelMatrix*vec4(iOrigin,1.)).xyz;
 vec3 wa=normalize(mat3(modelMatrix)*iAxis);
 vec3 wn=normalize(mat3(modelMatrix)*iNormal);
 vec3 toCam=cameraPosition-wo;
 vec3 toCamDir=normalize(toCam);
 vec3 sideV=cross(wa,toCam);
 vec3 right=length(sideV)>1e-4?normalize(sideV):vec3(1.,0.,0.);
 float s=position.y+.5;
 float side=fract(iSeed*5.3)>.5?1.:-1.;
 float ph=iSeed*6.2831;
 vec2 p,t;
 tongue(s,side,ph,p,t);
 float L=iSize.y*(1.+uStrength*.3-uAnticipation*.25);
 float w=iSize.x*pow(max(0.,1.-s),.55)*(.55+.45*smoothstep(0.,.25,s));
 vec2 perp=vec2(-t.y,t.x);
 vec3 wp=wo+wa*(p.x*L+perp.x*position.x*w)+right*(p.y*L+perp.y*position.x*w);
 vQ=vec2(position.x*2.,s);vSeed=iSeed;
 // Tongues frame the figure: they fade on surfaces that face the camera and when their own
 // axis points at the camera (a ribbon seen end-on is a stick).
 float facing=clamp(dot(wn,toCamDir),0.,1.);
 float endOn=abs(dot(wa,toCamDir));
 vFade=(1.-.95*smoothstep(0.,.55,facing))*(1.-smoothstep(.55,.85,endOn));
 vIntensity=(.6+fract(iSeed*17.)*.4)*(1.+uStrength*.25);
 gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);
}`,
    fragmentShader: `precision highp float;
uniform highp sampler3D uNoise;uniform float uTime;
in vec2 vQ;in float vSeed,vFade,vIntensity;out vec4 outColor;
void main(){
 float x=vQ.x,s=vQ.y;
 float t=uTime*(.45+fract(vSeed*3.1)*.3);
 vec3 np=vec3(x*.8+vSeed*9.,s*1.6-t*.5,t*.08+vSeed*4.);
 float n=(texture(uNoise,np).r-.5)*1.6+.5;
 float n2=(texture(uNoise,np*2.3+vec3(3.3)).g-.5)*1.6+.5;
 // Frayed edge, a hard ink rim, a mid-green wash, a pale core line, soft marbling.
 float r=abs(x)+(n2-.5)*.28*(.3+s);
 float inside=(1.-smoothstep(.8,1.,r))*(1.-smoothstep(.9,1.,abs(x)));
 float rim=smoothstep(.56,.84,r)*inside;
 float wash=inside*(1.-rim);
 float core=exp(-x*x*5.)*(1.-s*.5)*(.45+n*.75)*vIntensity;
 float marb=smoothstep(.7,1.,1.-abs(2.*n2-1.))*.5;
 vec3 col=mix(vec3(.012,.04,.02),vec3(.12,.4,.17),wash);
 col=mix(col,vec3(.5,.78,.5),wash*smoothstep(.3,.8,core));
 col=mix(col,vec3(.86,1.,.82),wash*smoothstep(.8,1.15,core));
 col*=1.-marb*wash;
 col=mix(col,vec3(.01,.03,.015),rim);
 float a=(inside*.78+rim*.17)*vFade*smoothstep(0.,.06,s);
 if(a<.01)discard;
 outColor=vec4(col,a);
}`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  const plane = new THREE.PlaneGeometry(1, 1, 1, 18);
  type Group = {
    mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
    anchor: THREE.Object3D;
    origins: Float32Array;
    axes: Float32Array;
    normals: Float32Array;
    sizes: Float32Array;
    seeds: Float32Array;
    count: number;
    up: THREE.Vector3;
    axisBlend: Float32Array;
    skinned: { slot: number; skin: FlameSkin; emberMatrix: THREE.Matrix4; embers: number[] }[];
  };
  const groups: Group[] = [];
  const total = [...sourcesByAnchor.values()].reduce((sum, sources) => sum + sources.length, 0);
  const anchorUp = new THREE.Vector3(),
    anchorQuaternion = new THREE.Quaternion(),
    growth = new THREE.Vector3();
  const emberOrigins: number[] = [],
    emberNormals: number[] = [];
  const emberMatrix = new THREE.Matrix4();
  const emberRoots: { slot: number; group: number }[] = [];
  let cards = 0;
  for (const [anchor, sources] of sourcesByAnchor) {
    if (!sources.length) continue;
    const target = Math.min(
      sources.length,
      Math.max(1, Math.round((tier.cards * sources.length) / total)),
    );
    const selected: FlameSource[] = [];
    for (let attempt = 0; attempt < sources.length * 2 && selected.length < target; attempt++) {
      const source = sources[Math.floor(((attempt * GOLDEN) % 1) * sources.length)];
      if (selected.every((other) => other.position.distanceToSquared(source.position) > 0.2))
        selected.push(source);
    }
    const count = selected.length;
    if (!count) continue;
    anchor.getWorldQuaternion(anchorQuaternion).invert();
    anchorUp.set(0, 1, 0).applyQuaternion(anchorQuaternion);
    const origins = new Float32Array(count * 3),
      axes = new Float32Array(count * 3),
      normals = new Float32Array(count * 3),
      sizes = new Float32Array(count * 2),
      seeds = new Float32Array(count),
      axisBlend = new Float32Array(count);
    const skinnedSlots: Group["skinned"] = [];
    emberMatrix.copy(anchor.matrixWorld).premultiply(model.matrixWorld.clone().invert());
    for (let i = 0; i < count; i++) {
      const source = selected[i];
      const seed = (i * GOLDEN + groups.length * 0.139) % 1;
      // Tongues lick upward along the body, leaning only a little away from the surface.
      axisBlend[i] = 0.25 + ((seed * 7) % 1) * 0.2;
      growth
        .copy(source.normal)
        .multiplyScalar(axisBlend[i])
        .addScaledVector(anchorUp, 1)
        .normalize();
      p.copy(source.position).addScaledVector(source.normal, 0.06).toArray(origins, i * 3);
      growth.toArray(axes, i * 3);
      source.normal.toArray(normals, i * 3);
      // Tongues are a hand's length on a 6.8-unit creature; a few bigger ones lead the halo.
      const big = seed > 0.78 ? 1 : 0;
      sizes[i * 2] = (0.25 + ((seed * 13) % 1) * 0.18) * (1 + big * 0.5);
      sizes[i * 2 + 1] = (0.58 + ((seed * 17) % 1) * 0.55) * (1 + big * 0.5);
      seeds[i] = seed;
      // Embers share the anchor-space points, expressed in model space.
      p.copy(source.position).applyMatrix4(emberMatrix);
      emberOrigins.push(p.x, p.y, p.z);
      n.copy(source.normal).applyQuaternion(anchor.getWorldQuaternion(new THREE.Quaternion()));
      emberNormals.push(n.x, n.y, n.z);
      emberRoots.push({ slot: i, group: groups.length });
      if (source.skin)
        skinnedSlots.push({
          slot: i,
          skin: source.skin,
          emberMatrix: emberMatrix.clone(),
          embers: [],
        });
    }
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = plane.index;
    geometry.setAttribute("position", plane.getAttribute("position"));
    geometry.setAttribute("iOrigin", new THREE.InstancedBufferAttribute(origins, 3));
    geometry.setAttribute("iAxis", new THREE.InstancedBufferAttribute(axes, 3));
    geometry.setAttribute("iNormal", new THREE.InstancedBufferAttribute(normals, 3));
    geometry.setAttribute("iSize", new THREE.InstancedBufferAttribute(sizes, 2));
    geometry.setAttribute("iSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    geometry.instanceCount = count;
    const mesh = new THREE.Mesh(geometry, cardMaterial);
    mesh.name = "InkFlameMantle";
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    anchor.add(mesh);
    groups.push({
      mesh,
      anchor,
      origins: origins.slice(),
      axes: axes.slice(),
      normals: normals.slice(),
      sizes: sizes.slice(),
      seeds: seeds.slice(),
      count,
      up: anchorUp.clone(),
      axisBlend,
      skinned: skinnedSlots,
    });
    cards += count;
  }
  // Embers: one cloud in model space, cycling from the flame roots upward.
  const emberCount = Math.min(tier.embers, Math.max(1, emberOrigins.length / 3) * 4);
  const emberGeometry = new THREE.BufferGeometry();
  const emberPositions = new Float32Array(emberCount * 3),
    emberDirs = new Float32Array(emberCount * 3),
    emberPhases = new Float32Array(emberCount),
    emberSeeds = new Float32Array(emberCount);
  const roots = Math.max(1, emberOrigins.length / 3);
  for (let i = 0; i < emberCount; i++) {
    const rootIndex = Math.floor(((i * GOLDEN) % 1) * roots);
    const root = rootIndex * 3;
    emberPositions.set(emberOrigins.slice(root, root + 3), i * 3);
    emberDirs.set(emberNormals.slice(root, root + 3), i * 3);
    emberPhases[i] = (i * 0.38196) % 1;
    emberSeeds[i] = ((i * 7.31) % 1) * 0.98 + 0.01;
    const owner = emberRoots[rootIndex];
    const entry = owner && groups[owner.group]?.skinned.find((item) => item.slot === owner.slot);
    if (entry) entry.embers.push(i);
  }
  const skinnedMeshes = new Set<THREE.SkinnedMesh>();
  for (const group of groups) for (const entry of group.skinned) skinnedMeshes.add(entry.skin.mesh);
  const skinVector = new THREE.Vector4();
  const skinPoint = (skin: FlameSkin, out: THREE.Vector3) => {
    skinVector.set(skin.rest.x, skin.rest.y, skin.rest.z, 1);
    skin.mesh.applyBoneTransform(skin.index, skinVector);
    return out.set(skinVector.x, skinVector.y, skinVector.z).applyMatrix4(skin.toAnchor);
  };
  const skinNormal = (skin: FlameSkin, out: THREE.Vector3) => {
    skinVector.set(skin.restNormal.x, skin.restNormal.y, skin.restNormal.z, 0);
    skin.mesh.applyBoneTransform(skin.index, skinVector);
    return out.set(skinVector.x, skinVector.y, skinVector.z).transformDirection(skin.toAnchor);
  };
  /** Anchors on skinned meshes follow the bones, so the fire rides the body in every pose. */
  const followSkins = () => {
    if (!skinnedMeshes.size) return false;
    for (const mesh of skinnedMeshes) mesh.skeleton.update();
    for (const group of groups) {
      for (const { slot, skin, emberMatrix: toModel, embers: owned } of group.skinned) {
        skinPoint(skin, p);
        skinNormal(skin, n).normalize();
        growth
          .copy(n)
          .multiplyScalar(group.axisBlend[slot])
          .addScaledVector(group.up, 1)
          .normalize();
        p.addScaledVector(n, 0.06).toArray(group.origins, slot * 3);
        growth.toArray(group.axes, slot * 3);
        n.toArray(group.normals, slot * 3);
        p.applyMatrix4(toModel);
        n.transformDirection(toModel);
        for (const ember of owned) {
          p.toArray(emberPositions, ember * 3);
          n.toArray(emberDirs, ember * 3);
        }
      }
    }
    (emberGeometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (emberGeometry.getAttribute("aDir") as THREE.BufferAttribute).needsUpdate = true;
    return true;
  };
  emberGeometry.setAttribute("position", new THREE.BufferAttribute(emberPositions, 3));
  emberGeometry.setAttribute("aDir", new THREE.BufferAttribute(emberDirs, 3));
  emberGeometry.setAttribute("aPhase", new THREE.BufferAttribute(emberPhases, 1));
  emberGeometry.setAttribute("aSeed", new THREE.BufferAttribute(emberSeeds, 1));
  const emberMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `attribute vec3 aDir;attribute float aPhase,aSeed;uniform float uTime,uStrength,uDpr;varying float vLife,vHeat;
void main(){float speed=.12+aSeed*.1;float life=fract(aPhase+uTime*speed);float rise=life*(1.4+aSeed*1.6)*(1.+uStrength*.4);
vec3 p=position+aDir*(.08+life*.35)+vec3(sin(uTime*1.2+aSeed*40.)*.3*life,rise,cos(uTime*.9+aSeed*23.)*.3*life);
vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;vHeat=fract(aSeed*9.);vLife=sin(life*3.14159)*(.55+uStrength*.45);
gl_PointSize=clamp((7.+vHeat*9.)*(.45+vLife*.55)*uDpr/max(1.,-mv.z),1.,6.);}`,
    fragmentShader: `varying float vLife,vHeat;void main(){vec2 q=gl_PointCoord-.5;float a=exp(-dot(q,q)*24.)*vLife*.9;if(a<.02)discard;gl_FragColor=vec4(mix(vec3(.35,1.1,.5),vec3(1.3,2.,1.4),pow(vHeat,2.5)),a);}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const embers = new THREE.Points(emberGeometry, emberMaterial);
  embers.name = "SurfaceEmberCloud";
  embers.frustumCulled = false;
  embers.renderOrder = 5;
  model.add(embers);
  const lastCamera = new THREE.Vector3(Infinity, Infinity, Infinity);
  const depths: { index: number; depth: number }[] = [];
  const view = new THREE.Vector3(),
    world = new THREE.Vector3();
  let frames = 0;
  const sortGroups = (camera: THREE.Camera) => {
    camera.getWorldDirection(view);
    for (const group of groups) {
      group.anchor.updateWorldMatrix(true, false);
      depths.length = 0;
      for (let i = 0; i < group.count; i++) {
        world.fromArray(group.origins, i * 3).applyMatrix4(group.anchor.matrixWorld);
        depths.push({ index: i, depth: world.sub(camera.position).dot(view) });
      }
      depths.sort((a, b) => b.depth - a.depth);
      const geometry = group.mesh.geometry;
      const origins = geometry.getAttribute("iOrigin") as THREE.InstancedBufferAttribute,
        axes = geometry.getAttribute("iAxis") as THREE.InstancedBufferAttribute,
        normals = geometry.getAttribute("iNormal") as THREE.InstancedBufferAttribute,
        sizes = geometry.getAttribute("iSize") as THREE.InstancedBufferAttribute,
        seeds = geometry.getAttribute("iSeed") as THREE.InstancedBufferAttribute;
      depths.forEach(({ index }, slot) => {
        (origins.array as Float32Array).set(group.origins.subarray(index * 3, index * 3 + 3), slot * 3);
        (axes.array as Float32Array).set(group.axes.subarray(index * 3, index * 3 + 3), slot * 3);
        (normals.array as Float32Array).set(
          group.normals.subarray(index * 3, index * 3 + 3),
          slot * 3,
        );
        (sizes.array as Float32Array).set(group.sizes.subarray(index * 2, index * 2 + 2), slot * 2);
        (seeds.array as Float32Array)[slot] = group.seeds[index];
      });
      origins.needsUpdate = axes.needsUpdate = normals.needsUpdate = true;
      sizes.needsUpdate = seeds.needsUpdate = true;
    }
  };
  return {
    diagnostics: {
      cards,
      embers: emberCount,
      groups: groups.length,
      candidates,
      skippedDeforming,
      skippedFace,
    },
    update(time: number, strength: number, anticipation: number, dpr: number, camera: THREE.Camera) {
      uniforms.uTime.value = time;
      uniforms.uStrength.value = strength;
      uniforms.uAnticipation.value = anticipation;
      uniforms.uDpr.value = dpr;
      frames++;
      const followed = followSkins();
      if (followed || camera.position.distanceToSquared(lastCamera) > 0.0025 || frames % 24 === 0) {
        lastCamera.copy(camera.position);
        sortGroups(camera);
      }
    },
    dispose() {
      for (const group of groups) {
        group.mesh.removeFromParent();
        group.mesh.geometry.dispose();
      }
      cardMaterial.dispose();
      plane.dispose();
      embers.removeFromParent();
      emberGeometry.dispose();
      emberMaterial.dispose();
    },
  };
}
