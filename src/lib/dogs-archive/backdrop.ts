import * as THREE from "three";

/** The painting's ground: an ink-wash space with the green fire massed around the creature's
 * silhouette and below it. Drawn first at the far plane as one full-screen triangle, so it is
 * always behind the body and shows through every hole. Eight volume fetches per pixel. */
export function createInkBackdrop(noise: THREE.Data3DTexture) {
  const uniforms = {
    uNoise: { value: noise },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uStrength: { value: 0 },
    uAnticipation: { value: 0 },
    uIntensity: { value: 1 },
    uBody: { value: new THREE.Vector4(0.5, 0.5, 0.25, 0.4) },
    uMouth: { value: new THREE.Vector2(0.5, 0.5) },
    uJet: { value: new THREE.Vector2(1, 0) },
  };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const material = new THREE.ShaderMaterial({
    uniforms,
    glslVersion: THREE.GLSL3,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `out vec2 vUv;void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,1.,1.);}`,
    fragmentShader: `precision highp float;
uniform highp sampler3D uNoise;
uniform vec2 uResolution,uMouth,uJet;uniform vec4 uBody;
uniform float uTime,uStrength,uAnticipation,uIntensity;
in vec2 vUv;out vec4 outColor;
vec4 nz(vec3 p){return texture(uNoise,p);}
void main(){
 float aspect=uResolution.x/uResolution.y;
 vec2 p=(vUv-.5)*vec2(aspect,1.);
 vec2 e=(vUv-uBody.xy)/max(uBody.zw,vec2(.05));
 float d=length(e);
 // ink wash ground: broad slow washes, lighter toward the top, with dark blots
 float wash=nz(vec3(p*.5,uTime*.012+2.)).r;
 vec3 ink=vec3(.004,.011,.008),washDark=vec3(.02,.045,.03),washLight=vec3(.13,.17,.14);
 vec3 base=mix(ink,washDark,smoothstep(.3,.65,wash));
 base=mix(base,washLight,smoothstep(.5,.88,wash)*smoothstep(-.4,.5,p.y)*.9);
 float blot=nz(vec3(p*2.1,7.)).a;
 base*=1.-.55*smoothstep(.8,.96,blot);
 // fire mass: strongest just outside the silhouette and below it, visible through holes
 float below=smoothstep(.45,-.6,p.y);
 float ring=smoothstep(2.6,1.0,d);
 float inside=smoothstep(.1,1.05,d);
 float mass=ring*(.35+.65*below)*mix(.4,.85,inside);
 vec2 jp=(vUv-uMouth)*vec2(aspect,1.);
 vec2 jd=normalize(uJet*vec2(aspect,1.)+vec2(1e-4,0.));
 float along=dot(jp,jd),across=abs(dot(jp,vec2(-jd.y,jd.x)));
 float jet=smoothstep(-.02,.14,along)*(1.-smoothstep(.08,.4+along*1.1,across))*(1.-smoothstep(.9,1.7,along));
 mass+=jet*uStrength*.2;
 mass*=1.+uStrength*.2-uAnticipation*.3;
 mass=min(mass,1.05);
 // two rising, domain-warped fbm layers plus a fine ragged edge
 // Tongues: the noise is compressed along y so features stretch upward.
 vec2 q=p*vec2(1.3,.85);q.y-=uTime*.08;
 vec2 w=nz(vec3(q*.7,uTime*.04)).ba-.5;
 float f1=nz(vec3((q+w*.6)*1.2,uTime*.055+3.)).r;
 vec2 q2=p*vec2(2.7,1.9);q2.y-=uTime*.15;
 float f2=nz(vec3((q2+w.yx*.8)*1.,uTime*.09+9.)).g;
 float f3=nz(vec3(p*5.5+vec2(0.,-uTime*.25),uTime*.12+17.)).r;
 float fire=(f1*.6+f2*.4-.5)*1.7+.5+(f3-.5)*.3;
 float e1=fire*(.35+mass)-.5;
 // The painting's fire is a pale wash with hard ink edges, cut by dark veins and holes.
 float flame=smoothstep(0.,.12,e1);
 float core=smoothstep(.1,.26,e1);
 float hot=smoothstep(.26,.48,e1);
 float hotter=smoothstep(.5,.72,e1);
 float edge=smoothstep(-.06,0.,e1)*(1.-smoothstep(0.,.03,e1));
 // Broad ink pools from the coarse ridge, finer veins from the mid one.
 float ridge=1.-abs(2.*f2-1.),ridge2=1.-abs(2.*f1-1.);
 float veins=min(.8,smoothstep(.6,1.,ridge2)*hot*.7+smoothstep(.72,1.,ridge)*core*.35);
 float wisps=smoothstep(.86,1.,ridge)*flame*(1.-hot)*.6;
 vec3 flameDeep=vec3(.04,.15,.06),flameMid=vec3(.17,.5,.2),flamePale=vec3(.44,.66,.42),flameCore=vec3(.78,.95,.72);
 vec3 col=mix(base,flameDeep,flame);
 col=mix(col,flameMid,core);
 col=mix(col,flamePale,hot);
 col=mix(col,flameCore,hotter*.8);
 col=mix(col,flamePale,wisps);
 col*=1.-veins;
 col=mix(col,ink,edge*.85);
 // fine particulate drifting upward; the lookup is warped so the specks leave the noise lattice
 vec2 s=p*17.;s.y-=uTime*.5;
 s+=(nz(vec3(p*1.4,uTime*.03+21.)).rg-.5)*2.5;
 float spark=nz(vec3(s,uTime*.22+13.)).a*nz(vec3(s.yx*1.7+3.,uTime*.17)).b;
 float dots=smoothstep(.6,.78,spark)*(.15+mass)*smoothstep(.6,-.2,p.y);
 col+=vec3(.6,1.,.7)*dots*.6;
 outColor=vec4(col*uIntensity,1.);
}`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "InkWashBackdrop";
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  const ndc = new THREE.Vector3();
  const corner = new THREE.Vector3();
  return {
    mesh,
    uniforms,
    setSize(width: number, height: number) {
      uniforms.uResolution.value.set(width, height);
    },
    /** Project the creature's bounds, mouth and jet into uv space for the fire mass. */
    update(
      time: number,
      strength: number,
      anticipation: number,
      camera: THREE.Camera,
      bounds: THREE.Box3,
      boundsMatrix: THREE.Matrix4,
      mouth: THREE.Vector3,
      direction: THREE.Vector3,
    ) {
      uniforms.uTime.value = time;
      uniforms.uStrength.value = strength;
      uniforms.uAnticipation.value = anticipation;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            corner.set(x, y, z).applyMatrix4(boundsMatrix).project(camera);
            minX = Math.min(minX, corner.x);
            maxX = Math.max(maxX, corner.x);
            minY = Math.min(minY, corner.y);
            maxY = Math.max(maxY, corner.y);
          }
      uniforms.uBody.value.set(
        (minX + maxX) * 0.25 + 0.5,
        (minY + maxY) * 0.25 + 0.5,
        Math.max(0.05, (maxX - minX) * 0.25),
        Math.max(0.05, (maxY - minY) * 0.25),
      );
      ndc.copy(mouth).project(camera);
      uniforms.uMouth.value.set(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5);
      corner.copy(mouth).addScaledVector(direction, 1.5).project(camera);
      uniforms.uJet.value.set(corner.x - ndc.x, corner.y - ndc.y);
      if (uniforms.uJet.value.lengthSq() < 1e-6) uniforms.uJet.value.set(1, 0);
      else uniforms.uJet.value.normalize();
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
