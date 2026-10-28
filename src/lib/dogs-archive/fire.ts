import * as THREE from "three";

// A ray travels through an actual volume. Both the silhouette and the hot core
// are evaluated in three dimensions, so orbiting above or behind the jet never
// reveals a crossed plane. The mouth occupies local z = -1.
const noise = `
float hash(vec3 p){p=fract(p*.3183099+vec3(.17,.31,.73));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return .55*noise3(p)+.27*noise3(p*2.03+4.7)+.125*noise3(p*4.11-8.3);}
float fbm2(vec3 p){return .67*noise3(p)+.33*noise3(p*2.03+4.7);}
`;

export function createBreathVolume(mobile: boolean) {
  const uniforms = {
    uTime: { value: 0 },
    uStrength: { value: 0 },
    uWorldInverse: { value: new THREE.Matrix4() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `precision highp float;
varying vec3 vWorld;uniform float uTime,uStrength;uniform mat4 uWorldInverse;
${noise}
vec2 boxHit(vec3 ro,vec3 rd){vec3 a=(-vec3(1)-ro)/rd,b=(vec3(1)-ro)/rd;vec3 n=min(a,b),f=max(a,b);return vec2(max(max(n.x,n.y),n.z),min(min(f.x,f.y),f.z));}
void main(){
vec3 ro=(uWorldInverse*vec4(cameraPosition,1.)).xyz;
bool inside=all(lessThanEqual(abs(ro),vec3(1.)));
if(inside==gl_FrontFacing)discard;
vec3 rd=normalize((uWorldInverse*vec4(normalize(vWorld-cameraPosition),0.)).xyz);
vec2 hit=boxHit(ro,rd);float start=max(0.,hit.x),end=hit.y;if(end<=start)discard;
vec4 sum=vec4(0.);float stepSize=(end-start)/float(${mobile ? 44 : 48});
for(int i=0;i<${mobile ? 44 : 48};i++){
 vec3 p=ro+rd*(start+(float(i)+.5)*stepSize);
 float z=(p.z+1.)*.5;
 float travel=uTime*1.6;
 vec3 flow=vec3(p.xy*8.5,z*6.5-travel*2.4);
 vec2 curl=vec2(fbm2(flow+vec3(0,0,7.)),fbm2(flow+vec3(8.,3.,0.)))-.5;
 vec3 macroFlow=vec3(p.xy*4.,z*2.5-uTime*1.25);
 float macroA=noise3(macroFlow+vec3(7.,2.,0.));
 float macroB=noise3(macroFlow+vec3(-3.,5.,8.));
 float macroC=noise3(macroFlow+vec3(3.,-7.,4.));
 vec2 driftA=vec2(macroA,macroB)-.5;
 vec2 driftB=vec2(macroC,macroA*.55+macroB*.45)-.5;
 vec2 center=(driftA*.32+curl*.30)*z;
 float radius=(.042+pow(z,.72)*.43)*(1.-smoothstep(.6,1.,z)*.42);
 float r=length((p.xy-center)/vec2(1.,.83));
 float turbulence=fbm(flow+curl.xyy*2.7);
 float edge=radius*(.35+turbulence*1.5)-r;
 float envelope=smoothstep(-.025,.075,edge);
 vec2 forkA=center+driftA*(.12+pow(z,1.1)*1.05);
 vec2 forkB=center+driftB*(.15+pow(z,1.2)*1.2);
 float macroNoise=macroA*.67+noise3(macroFlow*2.03+curl.xyy*2.3+4.7)*.33;
 float forkRadius=(.035+z*.18)*(.35+macroNoise*1.1);
 float branchA=1.-smoothstep(forkRadius*.25,forkRadius,length(p.xy-forkA));
 float branchB=1.-smoothstep(forkRadius*.15,forkRadius,length(p.xy-forkB));
 branchA*=smoothstep(.43+z*.1,.62+z*.1,macroNoise);
 branchB*=smoothstep(.41+z*.12,.61+z*.12,macroNoise*.64+macroB*.36);
 float head=1.-smoothstep(.62+uStrength*.20,1.,z+turbulence*.12);
 float folded=sin((turbulence+noise3(flow*1.6)*.08)*9.+z*2.-uTime*1.6);
 float filaments=pow(1.-abs(folded),2.5);
 float billow=pow(max(0.,1.-abs(turbulence-.46)*3.3),3.);
 float downstream=smoothstep(.2,.75,z);
 float pockets=smoothstep(.2,.64,macroB);
 float macroSheet=smoothstep(.4,.57,macroNoise+curl.x*.2)*(1.-smoothstep(.62,.77,macroNoise));
 float density=(envelope*(.018+billow*.25+filaments*.50+macroSheet*.32)+branchA*.42+branchB*.33)*head*uStrength;
 density*=mix(1.,pockets,downstream*.9);
 float core=exp(-r*r/(.0015+z*.003))*(1.-smoothstep(.06,.28,z));
 vec3 forest=vec3(.133,.545,.133);
 vec3 color=mix(forest*.24,vec3(.14,2.,.30),max(filaments*.5,macroSheet*.88));
 color+=vec3(.08,.55,.15)*(branchA+branchB)*.25;
 color*=1.2-z*.55;
 color=mix(color,vec3(.65,2.3,.9),pow(core,1.4)*.97);
 float alpha=1.-exp(-density*stepSize*2.6);
 sum.rgb+=(1.-sum.a)*color*alpha;sum.a+=(1.-sum.a)*alpha;
 if(sum.a>.97)break;
}
if(sum.a<.005)discard;gl_FragColor=vec4(sum.rgb/max(sum.a,.001),sum.a);
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
  const sparksCount = mobile ? 110 : 220;
  const sparkGeometry = new THREE.BufferGeometry();
  const sparkPhases = new Float32Array(sparksCount);
  for (let i = 0; i < sparksCount; i++) sparkPhases[i] = (i * 0.61803398875) % 1;
  sparkGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(sparksCount * 3), 3),
  );
  sparkGeometry.setAttribute("aPhase", new THREE.BufferAttribute(sparkPhases, 1));
  const sparkMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `attribute float aPhase;uniform float uTime,uStrength;varying float vLife,vHeat;
void main(){float u=fract(aPhase+uTime*.42);float angle=aPhase*127.+u*7.;float spread=pow(u,1.4)*(.22+fract(aPhase*37.)*.68);vec3 p=vec3(cos(angle)*spread,sin(angle)*spread,-.96+u*2.4);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((18.+fract(aPhase*31.)*22.)/max(1.,-mv.z),1.,5.);vLife=sin(u*3.14159)*uStrength;vHeat=fract(aPhase*7.);}`,
    fragmentShader: `varying float vLife,vHeat;void main(){vec2 p=gl_PointCoord-.5;float a=exp(-dot(p,p)*19.)*vLife*.65;if(a<.025)discard;gl_FragColor=vec4(mix(vec3(.05,1.1,.16),vec3(.8,2.4,1.),pow(vHeat,4.)),a);}`,
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
    update(time: number, strength: number, origin: THREE.Vector3, direction: THREE.Vector3) {
      uniforms.uTime.value = time;
      uniforms.uStrength.value = strength;
      mesh.visible = strength > 0.002;
      const length = 5.3 + strength * 1.1;
      mesh.position.copy(origin).addScaledVector(direction, length * 0.5 - 0.035);
      mesh.quaternion.setFromUnitVectors(z, direction);
      mesh.scale.set(3.2, 3.2, length * 0.5);
      mesh.updateMatrixWorld(true);
      uniforms.uWorldInverse.value.copy(mesh.matrixWorld).invert();
    },
  };
}

export function createMantle(model: THREE.Object3D, mobile: boolean) {
  model.updateMatrixWorld(true);
  const groups = new Map<THREE.Object3D, THREE.Vector3[]>();
  const flameSources = new Map<
    THREE.Object3D,
    { position: THREE.Vector3; normal: THREE.Vector3 }[]
  >();
  const p = new THREE.Vector3();
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const position = node.geometry.getAttribute("position");
    if (!position) return;
    let anchor: THREE.Object3D = model;
    for (let parent = node.parent; parent && parent !== model; parent = parent.parent) {
      if (/Pivot/.test(parent.name)) {
        anchor = parent;
        break;
      }
    }
    const inv = anchor.matrixWorld.clone().invert();
    const normalTransform = new THREE.Matrix3().getNormalMatrix(
      inv.clone().multiply(node.matrixWorld),
    );
    const normals = node.geometry.getAttribute("normal");
    const carriesFlame =
      /Frond|Volute|Fan|scapular|Reverse/i.test(node.name) &&
      !/HeadPivot|JawPivot/.test(anchor.name);
    const candidates = groups.get(anchor) ?? [];
    groups.set(anchor, candidates);
    const stride = Math.max(1, Math.floor(position.count / 160));
    for (let i = 0; i < position.count; i += stride) {
      p.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld).applyMatrix4(inv);
      candidates.push(p.clone());
      if (carriesFlame) {
        const normal = normals
          ? new THREE.Vector3()
              .fromBufferAttribute(normals, i)
              .applyMatrix3(normalTransform)
              .normalize()
          : p.clone().normalize();
        const sources = flameSources.get(anchor) ?? [];
        sources.push({ position: p.clone(), normal });
        flameSources.set(anchor, sources);
      }
    }
  });
  const total = [...groups.values()].reduce((sum, candidates) => sum + candidates.length, 0);
  const budget = mobile ? 900 : 1800;
  const uniforms = { uTime: { value: 0 }, uStrength: { value: 0 }, uDpr: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `attribute float aPhase;uniform float uTime,uStrength,uDpr;varying float vLife,vPhase;
void main(){float age=fract(aPhase+uTime*.13);vLife=sin(age*3.14159);vPhase=aPhase;
vec3 p=position;float amp=.035+age*.16; p+=vec3(sin(aPhase*97.+uTime*1.3),age*3.,cos(aPhase*43.+uTime))*amp;
vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
gl_PointSize=clamp((13.+uStrength*11.)*(.25+vLife*.75)*uDpr/max(1.,-mv.z),1.,9.);}`,
    fragmentShader: `varying float vLife,vPhase;uniform float uStrength;
void main(){float r=length(gl_PointCoord-.5);float a=exp(-r*r*24.)*vLife*(.27+uStrength*.22);if(a<.015)discard;
vec3 color=mix(vec3(.133,.545,.133),vec3(.55,1.3,.68),pow(vPhase,5.));gl_FragColor=vec4(color,a);}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points: THREE.Points[] = [];
  for (const [anchor, candidates] of groups) {
    const count = Math.min(
      candidates.length,
      Math.max(1, Math.round((budget * candidates.length) / total)),
    );
    const positions = new Float32Array(count * 3),
      phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      candidates[Math.floor((i / count) * candidates.length)].toArray(positions, i * 3);
      phases[i] = (i * 0.61803398875 + points.length * 0.38196) % 1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    const cloud = new THREE.Points(geometry, material);
    cloud.name = "SurfacePhosphorMantle";
    cloud.frustumCulled = false;
    anchor.add(cloud);
    points.push(cloud);
  }
  // Each instanced wisp is a small ray-marched volume, so its side profile
  // cannot turn into a flat blade and its curled silhouette stays organic.
  const flameGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const flameMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `attribute float aSeed,aIntensity;varying vec3 vFlameSurface,vFlameCamera;varying float vFlameSeed,vFlameIntensity;
void main(){vFlameSurface=position;vFlameSeed=aSeed;vFlameIntensity=aIntensity;vFlameCamera=(inverse(modelMatrix*instanceMatrix)*vec4(cameraPosition,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `precision highp float;uniform float uTime,uStrength;varying vec3 vFlameSurface,vFlameCamera;varying float vFlameSeed,vFlameIntensity;
${noise}
void main(){vec3 ro=vFlameCamera,rd=normalize(vFlameSurface-ro);bool inside=ro.y>=0.&&ro.y<=1.&&abs(ro.x)<=.5&&abs(ro.z)<=.5;if(inside==gl_FrontFacing)discard;
vec3 a=(vec3(-.5,0.,-.5)-ro)/rd,b=(vec3(.5,1.,.5)-ro)/rd,nr=min(a,b),fr=max(a,b);float start=max(0.,max(max(nr.x,nr.y),nr.z)),end=min(min(fr.x,fr.y),fr.z);if(end<=start)discard;
float ds=(end-start)/float(${mobile ? 14 : 20});vec4 sum=vec4(0.);float phase=vFlameSeed*61.;
for(int i=0;i<${mobile ? 14 : 20};i++){vec3 p=ro+rd*(start+(float(i)+.5)*ds);float h=p.y;vec3 flow=p*vec3(6.,2.5,7.)+vec3(vFlameSeed*29.,-uTime*1.6,vFlameSeed*17.);float n=fbm(flow);float macro=fbm(flow*.58+vec3(7.,3.,uTime*.2));
vec2 center=vec2(sin(uTime*1.3+phase+h*5.),cos(uTime*1.1+phase+h*6.))*pow(h,1.15)*.22;
center+=(vec2(n,macro)-.45)*h*.28;
float radius=(.3*pow(max(0.,1.-h),.72)+.012)*(.25+macro*1.5);float r=length((p.xz-center)*vec2(1.,1.15));float skin=smoothstep(-.025,.065,radius-r);
float root=1.-smoothstep(.03,.22,h);float threshold=.28+h*.29;float tear=smoothstep(threshold,threshold+.12,macro+n*.14);float tongue=mix(.55,tear,1.-root);float fade=1.-smoothstep(.7,1.,h+n*.12);float density=skin*tongue*fade*vFlameIntensity*(1.+uStrength*.3);
float core=exp(-r*r/(.006+(1.-h)*.007))*(1.-h);float heat=core*smoothstep(.39,.64,n);vec3 color=mix(vec3(.015,.2,.03),vec3(.07,1.3,.16),heat);color=mix(color,vec3(.35,1.8,.5),pow(heat,2.)*.6);float alpha=1.-exp(-density*ds*1.25);sum.rgb+=(1.-sum.a)*color*alpha;sum.a+=(1.-sum.a)*alpha;}
if(sum.a<.008)discard;gl_FragColor=vec4(sum.rgb/max(sum.a,.001),sum.a);}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
  });
  const flameTotal = [...flameSources.values()].reduce((sum, sources) => sum + sources.length, 0);
  const flameBudget = mobile ? 90 : 150;
  const flamePose = new THREE.Object3D(),
    growth = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  const anchorUp = new THREE.Vector3(),
    anchorQuaternion = new THREE.Quaternion();
  for (const [anchor, sources] of flameSources) {
    const targetCount = Math.min(
      sources.length,
      Math.max(1, Math.round((flameBudget * sources.length) / flameTotal)),
    );
    const selected: typeof sources = [];
    for (let attempt = 0; attempt < sources.length && selected.length < targetCount; attempt++) {
      const source = sources[Math.floor(((attempt * 0.61803398875) % 1) * sources.length)];
      if (selected.every((other) => other.position.distanceToSquared(source.position) > 0.07))
        selected.push(source);
    }
    const count = selected.length;
    if (!count) continue;
    const geometry = flameGeometry.clone(),
      seeds = new Float32Array(count),
      intensities = new Float32Array(count);
    const wisps = new THREE.InstancedMesh(geometry, flameMaterial, count);
    anchor.getWorldQuaternion(anchorQuaternion).invert();
    anchorUp.copy(up).applyQuaternion(anchorQuaternion);
    for (let i = 0; i < count; i++) {
      const seed = (i * 0.61803398875 + points.length * 0.139) % 1;
      seeds[i] = seed;
      const source = selected[i];
      const patch =
        0.5 +
        0.5 * Math.sin(source.position.x * 2.1 + source.position.y * 1.8 + source.position.z * 1.7);
      intensities[i] = 0.18 + patch * patch * 1.05;
      growth.copy(source.normal).multiplyScalar(0.28).addScaledVector(anchorUp, 0.95).normalize();
      flamePose.position.copy(source.position).addScaledVector(source.normal, 0.018);
      flamePose.quaternion.setFromUnitVectors(up, growth);
      flamePose.scale.set(
        0.45 + ((seed * 17) % 1) * 0.34,
        0.3 + ((seed * 13) % 1) * 0.8 * (0.4 + patch * 0.6),
        0.45 + ((seed * 11) % 1) * 0.34,
      );
      flamePose.updateMatrix();
      wisps.setMatrixAt(i, flamePose.matrix);
    }
    geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    geometry.setAttribute("aIntensity", new THREE.InstancedBufferAttribute(intensities, 1));
    wisps.name = "LivingSurfaceFlameMantle";
    wisps.frustumCulled = false;
    wisps.renderOrder = 3;
    wisps.instanceMatrix.needsUpdate = true;
    anchor.add(wisps);
  }
  flameGeometry.dispose();
  return {
    points,
    update(time: number, strength: number, dpr: number) {
      uniforms.uTime.value = time;
      uniforms.uStrength.value = strength;
      uniforms.uDpr.value = dpr;
    },
  };
}
