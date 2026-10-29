import * as THREE from "three";

/** Per-tier budgets. Counts and steps only: motion is never removed by a tier. */
export type FireTier = {
  jetSteps: number;
  cards: number;
  embers: number;
  sparks: number;
};
export const FIRE_TIERS: Record<"high" | "mobile" | "low", FireTier> = {
  high: { jetSteps: 34, cards: 80, embers: 420, sparks: 300 },
  mobile: { jetSteps: 24, cards: 56, embers: 260, sparks: 180 },
  low: { jetSteps: 16, cards: 36, embers: 150, sparks: 110 },
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
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    glslVersion: THREE.GLSL3,
    defines: { STEPS: tier.jetSteps },
    vertexShader: `out vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `precision highp float;
uniform highp sampler3D uNoise;
uniform float uTime,uStrength;uniform mat4 uWorldInverse;
in vec3 vWorld;out vec4 outColor;
vec2 boxHit(vec3 ro,vec3 rd){vec3 a=(-vec3(1)-ro)/rd,b=(vec3(1)-ro)/rd;vec3 n=min(a,b),f=max(a,b);return vec2(max(max(n.x,n.y),n.z),min(min(f.x,f.y),f.z));}
void main(){
 vec3 ro=(uWorldInverse*vec4(cameraPosition,1.)).xyz;
 bool inside=all(lessThanEqual(abs(ro),vec3(1.)));
 if(inside==gl_FrontFacing)discard;
 vec3 rd=normalize((uWorldInverse*vec4(normalize(vWorld-cameraPosition),0.)).xyz);
 vec2 hit=boxHit(ro,rd);float start=max(0.,hit.x),end=hit.y;if(end<=start)discard;
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
  float radius=.1+pow(z,.85)*.8;
  vec2 c=warp.xy*z*.9;
  float r=length((p.xy-c)/radius);
  float env=1.-smoothstep(.35,1.05,r+(n-.5)*.9);
  float head=1.-smoothstep(.6+uStrength*.35,1.,z+(n2-.5)*.25);
  float lobes=smoothstep(.55,.85,n*.7+n2*.4+(1.-z)*.12);
  float dens=env*head*lobes;
  float axis=exp(-r*r*(3.+z*7.))*(1.-z*.55)*head;
  float fil=pow(1.-abs(2.*n2-1.),7.)*env*head;
  float ink=smoothstep(.62,1.,1.-abs(2.*n2-1.))*dens+smoothstep(.7,1.,1.-abs(2.*n-1.))*dens*.6;
  vec3 col=mix(vec3(.015,.07,.03),vec3(.1,.45,.18),smoothstep(0.,.45,dens));
  col=mix(col,vec3(.42,.72,.46),smoothstep(.4,.85,dens+axis*.7));
  col+=vec3(.7,.9,.72)*(axis*1.1+fil*.6);
  col*=1.-min(ink,.85);
  float a=1.-exp(-(dens*.8+axis*1.4+fil*.5)*uStrength*stepSize*.8);
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
vHeat=fract(aPhase*7.);gl_PointSize=clamp((14.+vHeat*26.)*uDpr/max(1.,-mv.z),1.,6.5);vLife=sin(u*3.14159)*uStrength;}`,
    fragmentShader: `varying float vLife,vHeat;void main(){vec2 p=gl_PointCoord-.5;float a=exp(-dot(p,p)*22.)*vLife*.85;if(a<.02)discard;gl_FragColor=vec4(mix(vec3(.2,1.2,.4),vec3(1.2,2.2,1.4),pow(vHeat,3.)),a);}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.name = "DetachedForestFireEmbers";
  sparks.frustumCulled = false;
  sparks.renderOrder = 6;
  mesh.add(sparks);
  const z = new THREE.Vector3(0, 0, 1);
  return {
    mesh,
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
      mesh.visible = strength > 0.002;
      const length = 5.6 + strength * 1.3;
      mesh.position.copy(origin).addScaledVector(direction, length * 0.5 - 0.035);
      mesh.quaternion.setFromUnitVectors(z, direction);
      mesh.scale.set(3.0, 3.0, length * 0.5);
      mesh.updateMatrixWorld(true);
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

type FlameSource = { position: THREE.Vector3; normal: THREE.Vector3; facing: number };

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
    if (node instanceof THREE.SkinnedMesh) {
      // Rest-pose samples would not follow the skin; keep the deforming neck clear.
      skippedDeforming++;
      return;
    }
    const inv = anchor.matrixWorld.clone().invert();
    const normalToWorld = new THREE.Matrix3().getNormalMatrix(node.matrixWorld);
    const normalToAnchor = new THREE.Matrix3().getNormalMatrix(inv);
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
void main(){
 vec3 wo=(modelMatrix*vec4(iOrigin,1.)).xyz;
 vec3 wa=normalize(mat3(modelMatrix)*iAxis);
 vec3 wn=normalize(mat3(modelMatrix)*iNormal);
 vec3 toCam=cameraPosition-wo;
 vec3 side=cross(wa,toCam);
 vec3 right=length(side)>1e-4?normalize(side):vec3(1.,0.,0.);
 float h=position.y+.5;
 float ph=iSeed*6.2831;
 float sway=sin(uTime*1.1+ph+h*2.5)*.16*h*h+sin(uTime*2.3+ph*2.)*.05*h;
 float lift=1.+uStrength*.3-uAnticipation*.25;
 vec3 wp=wo+right*((position.x+sway)*iSize.x)+wa*(h*iSize.y*lift);
 vQ=vec2(position.x,h);vSeed=iSeed;
 // Fire reads behind and around the silhouette: cards on surfaces that face the camera fade.
 float facing=clamp(dot(wn,normalize(toCam)),0.,1.);
 vFade=1.-.9*smoothstep(.05,.7,facing);
 vIntensity=(.5+fract(iSeed*17.)*.45)*(1.+uStrength*.25);
 gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);
}`,
    fragmentShader: `precision highp float;
uniform highp sampler3D uNoise;uniform float uTime;
in vec2 vQ;in float vSeed,vFade,vIntensity;out vec4 outColor;
void main(){
 float h=vQ.y,x=vQ.x;
 float t=uTime*(.5+fract(vSeed*3.1)*.3);
 vec3 np=vec3(x*1.4+vSeed*9.,h-t*.5,t*.1+vSeed*4.);
 vec2 w=texture(uNoise,np*.7).ba-.5;
 float n=(texture(uNoise,np+vec3(w*.6,0.)).r-.5)*1.7+.5;
 float n2=(texture(uNoise,np*2.1+vec3(3.3)).g-.5)*1.6+.5;
 // A soft wash tongue: wide base, a tip that bends with the noise, curled edges from the
 // fine noise, a thin ink rim, translucent so overlapping tongues build depth.
 float width=(.42-h*.34)*(.8+n2*.4);
 float cx=(n-.5)*.3*h;
 float curl=(n2-.5)*.18*(.3+h);
 float r=abs(x-cx)/max(width,.03)+curl;
 float env=(1.-smoothstep(.35,1.,r))*(1.-smoothstep(.38,.5,abs(x)));
 float tip=(1.-smoothstep(.4,1.,h+(n-.5)*.45))*(1.-smoothstep(.82,1.,h));
 float root=smoothstep(0.,.15,h);
 float d=env*tip*root*(.6+n*.5)*vIntensity;
 float body=smoothstep(.08,.42,d);
 float pale=smoothstep(.3,.72,d);
 float white=smoothstep(.66,.95,d);
 float inkEdge=smoothstep(.05,.11,d)*(1.-smoothstep(.11,.2,d));
 float shade=smoothstep(.75,1.,1.-abs(2.*n-1.))*pale*.25;
 vec3 col=mix(vec3(.015,.05,.025),vec3(.1,.36,.14),body);
 col=mix(col,vec3(.42,.68,.42),pale);
 col=mix(col,vec3(.74,.95,.72),white);
 col*=1.-shade;
 float alpha=max(body*.55,inkEdge*.45)*vFade;
 if(alpha<.01)discard;
 outColor=vec4(col,alpha);
}`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  const plane = new THREE.PlaneGeometry(1, 1, 1, 6);
  type Group = {
    mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
    anchor: THREE.Object3D;
    origins: Float32Array;
    axes: Float32Array;
    normals: Float32Array;
    sizes: Float32Array;
    seeds: Float32Array;
    count: number;
  };
  const groups: Group[] = [];
  const total = [...sourcesByAnchor.values()].reduce((sum, sources) => sum + sources.length, 0);
  const anchorUp = new THREE.Vector3(),
    anchorQuaternion = new THREE.Quaternion(),
    growth = new THREE.Vector3();
  const emberOrigins: number[] = [],
    emberNormals: number[] = [];
  const emberMatrix = new THREE.Matrix4();
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
      if (selected.every((other) => other.position.distanceToSquared(source.position) > 0.1))
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
      seeds = new Float32Array(count);
    emberMatrix.copy(anchor.matrixWorld).premultiply(model.matrixWorld.clone().invert());
    for (let i = 0; i < count; i++) {
      const source = selected[i];
      const seed = (i * GOLDEN + groups.length * 0.139) % 1;
      // Tongues radiate from the silhouette and drift upward, like the halo in the painting.
      growth
        .copy(source.normal)
        .multiplyScalar(0.8 + ((seed * 7) % 1) * 0.5)
        .addScaledVector(anchorUp, 0.9)
        .normalize();
      p.copy(source.position).addScaledVector(source.normal, 0.06).toArray(origins, i * 3);
      growth.toArray(axes, i * 3);
      source.normal.toArray(normals, i * 3);
      const big = seed > 0.7 ? 1 : 0;
      sizes[i * 2] = (0.4 + ((seed * 13) % 1) * 0.35) * (1 + big * 0.5);
      sizes[i * 2 + 1] = (0.5 + ((seed * 17) % 1) * 0.55) * (1 + big * 0.6);
      seeds[i] = seed;
      // Embers share the anchor-space points, expressed in model space.
      p.copy(source.position).applyMatrix4(emberMatrix);
      emberOrigins.push(p.x, p.y, p.z);
      n.copy(source.normal).applyQuaternion(anchor.getWorldQuaternion(new THREE.Quaternion()));
      emberNormals.push(n.x, n.y, n.z);
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
    const root = Math.floor(((i * GOLDEN) % 1) * roots) * 3;
    emberPositions.set(emberOrigins.slice(root, root + 3), i * 3);
    emberDirs.set(emberNormals.slice(root, root + 3), i * 3);
    emberPhases[i] = (i * 0.38196) % 1;
    emberSeeds[i] = ((i * 7.31) % 1) * 0.98 + 0.01;
  }
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
      if (camera.position.distanceToSquared(lastCamera) > 0.0025 || frames % 24 === 0) {
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
