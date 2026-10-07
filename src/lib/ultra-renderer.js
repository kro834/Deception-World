const VERTEX = `#version 300 es
precision highp float;
const vec2 p[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
void main(){gl_Position=vec4(p[gl_VertexID],0.,1.);}`;

const FRAGMENT = `#version 300 es
precision highp float;
out vec4 color;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uTime;
uniform vec3 uTint;
uniform int uSteps;
uniform int uSamples;
mat2 crystalXZ,crystalXY,orbitA,orbitB;
mat2 turn(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec3 emission(){return pow(clamp(uTint,0.,1.),vec3(2.5));}
vec3 crystalLocal(vec3 p){
 vec3 q=p-vec3(0.,.25,0.);
 q.xz=crystalXZ*q.xz;q.xy=crystalXY*q.xy;return q;
}
vec3 crystalDirection(vec3 d){
 d.xz=crystalXZ*d.xz;d.xy=crystalXY*d.xy;return d;
}
float crystalDistance(vec3 p){
 vec3 q=abs(crystalLocal(p));
 // Normalized plane distances form a conservative, softly bevelled cut crystal.
 float octa=(q.x+q.z+q.y*.62-1.04)*.647;
 return max(max(octa,q.y-1.19),max(q.x-.78,q.z-.78))-.006;
}
vec2 ringDistances(vec3 p){
 vec3 a=p-vec3(0.,.1,0.);a.yz=orbitA*a.yz;
 vec3 b=p-vec3(0.,.25,0.);b.xy=orbitB*b.xy;
 return vec2(length(vec2(length(a.xz)-1.69,a.y))-.024,
             length(vec2(length(b.xz)-1.43,b.y))-.016);
}
vec2 scene(vec3 p){
 vec2 d=vec2(crystalDistance(p),1.);
 vec2 rings=ringDistances(p);
 if(rings.x<d.x)d=vec2(rings.x,2.);
 if(rings.y<d.x)d=vec2(rings.y,4.);
 float floorD=p.y+1.1;if(floorD<d.x)d=vec2(floorD,3.);
 return d;
}
bool isFloor(float id){return id>2.5&&id<3.5;}
bool isRing(float id){return (id>1.5&&id<2.5)||id>3.5;}
bool isReflective(float id){return id>0.5&&!isRing(id);}
vec3 normalAt(vec3 p,float id){
 if(isFloor(id))return vec3(0.,1.,0.);
 vec2 e=vec2(.002,0.);
 vec3 g=vec3(scene(p+e.xyy).x-scene(p-e.xyy).x,
             scene(p+e.yxy).x-scene(p-e.yxy).x,
             scene(p+e.yyx).x-scene(p-e.yyx).x);
 return g*inversesqrt(max(dot(g,g),.00000001));
}
vec2 march(vec3 ro,vec3 rd){
 float t=0.;float id=0.;
 for(int i=0;i<96;i++){
  if(i>=uSteps)break;vec2 h=scene(ro+rd*t);
  if(h.x<.0025){id=h.y;break;}
  t+=max(h.x*.8,.0015);if(t>16.)break;
 }
 return vec2(t,id);
}
float shadow(vec3 p,vec3 l){
 float s=1.;float t=.04;
 for(int i=0;i<14;i++){
  float d=scene(p+l*t).x;s=min(s,9.*max(d,0.)/t);
  t+=clamp(d,.035,.34);if(t>4.8||s<.02)break;
 }
 return clamp(s,.12,1.);
}
float crystalAO(vec3 p,vec3 n){
 float occlusion=0.;
 for(int i=1;i<=3;i++){
  float h=float(i)*.07;
  occlusion+=max(h-crystalDistance(p+n*h),0.)/h*.16;
 }
 return clamp(1.-occlusion,.45,1.);
}
vec3 sky(vec3 rd){
 float key=pow(max(dot(rd,normalize(vec3(-.6,.45,-1.))),0.),32.);
 float rim=pow(max(dot(rd,normalize(vec3(.8,.3,.7))),0.),52.);
 return emission()*key*.018+mix(emission(),vec3(1.),.28)*rim*.011;
}
vec3 internalCrystal(vec3 p,vec3 rd,vec3 n){
 vec3 refracted=refract(rd,n,1./1.48);
 // A bounded analytic chord illuminates only this 3D crystal, not page pixels.
 if(dot(refracted,refracted)<.000001)refracted=reflect(rd,n);
 vec3 q=crystalLocal(p),d=crystalDirection(refracted);
 float projected=dot(q,d);
 float discriminant=projected*projected-dot(q,q)+1.38;
 float chord=clamp(-projected+sqrt(max(discriminant,0.)),0.,2.4);
 vec3 core=vec3(.04*sin(uTime*.19),.02,.04*cos(uTime*.17));
 float closest=clamp(dot(core-q,d),0.,chord);
 vec3 v=q+d*closest-core;
 // Channel offsets approximate spectral separation without three extra ray marches.
 vec3 distances=vec3(length(v+vec3(.022,0.,0.)),length(v),length(v-vec3(.022,0.,0.)));
 vec3 nucleus=exp(-distances*distances*82.);
 vec3 inclusionPosition=v-vec3(.035,.12,-.025);
 float inclusion=exp(-dot(inclusionPosition,inclusionPosition)*165.);
 float vein=exp(-abs(v.x*.7+v.z*.5)*82.)*exp(-dot(v,v)*10.);
 float innerFacet=exp(-abs(v.x*.6+v.y*.3+v.z*.4)*70.)*exp(-dot(v,v)*16.);
 vec3 absorption=exp(-mix(vec3(1.4,.75,.38),vec3(.38,.75,1.4),uTint.r)*chord);
 float pulse=.88+.12*sin(uTime*.65);
 return (mix(emission(),vec3(1.),.08)*(nucleus*1.3+inclusion*.08)+
         emission()*(vein*.14+innerFacet*.035))*absorption*pulse;
}
vec3 floorLight(vec3 p){
 vec2 q=p.xz;float radius=length(q);
 float angle=atan(q.y,q.x);
 float band=exp(-pow((radius-.89)/.055,2.));
 float facets=pow(max(.5+.5*cos(angle*8.+uTime*.14),0.),12.);
 float inner=exp(-dot(q,q)*11.)*.008;
 return emission()*(band*facets*.05+inner);
}
vec3 surface(vec3 p,vec3 rd,float id,vec3 n,bool detailed){
 vec3 l=normalize(vec3(-3.,4.,2.)-p);
 if(isRing(id)){
  vec3 ringLocal=p-vec3(0.,id>3.5?.25:.1,0.);
  if(id>3.5)ringLocal.xy=orbitB*ringLocal.xy;
  else ringLocal.yz=orbitA*ringLocal.yz;
  float angle=atan(ringLocal.z,ringLocal.x);
  float finish=.9+.1*cos(angle*8.);
  float lit=max(dot(n,l),0.);
  float rim=pow(1.-clamp(dot(n,-rd),0.,1.),3.);
  float polished=pow(max(dot(reflect(-l,n),-rd),0.),64.);
  vec3 metal=mix(emission(),vec3(1.),id>3.5?.14:.04);
  vec3 ringLight=metal*(.24+.4*lit+.16*rim)*finish+
                 mix(metal,vec3(1.),.22)*polished*.15;
  // Normals and fixed local finish give a lit metal tube, bounded by its old radiance.
  return min(ringLight,metal)*(id>3.5?2.1:3.1);
 }
 float visibility=detailed?shadow(p+n*.016,l):1.;
 float diff=max(dot(n,l),0.)*visibility;
 float fres=pow(1.-clamp(dot(n,-rd),0.,1.),5.);
 if(isFloor(id)){
  // Tight caustic-like highlights leave the surrounding page's black neutral.
  float grain=sin(p.x*81.)*sin(p.z*77.)*.5+.5;
  float spec=pow(max(dot(reflect(-l,n),-rd),0.),86.+grain*42.);
  return floorLight(p)*visibility+emission()*spec*.025;
 }
 float ao=detailed?crystalAO(p,n):1.;
 float spec=pow(max(dot(reflect(-l,n),-rd),0.),96.);
 vec3 highlight=mix(emission(),vec3(1.),.24);
 return internalCrystal(p,rd,n)*(1.-fres*.65)+
        emission()*fres*.065*ao+
        highlight*spec*.62*visibility+
        emission()*diff*.0018*ao;
}
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
vec3 atmosphere(vec3 ro,vec3 rd,float reach){
 vec3 fog=vec3(0.);float halo=0.;
 for(int i=0;i<10;i++){
  float t=(float(i)+.5)/10.*reach;vec3 v=ro+rd*t;
  float beam=exp(-dot(v.xz,v.xz)*1.2)*exp(-abs(v.y)*1.1);
  fog+=emission()*beam*.00022;
  vec3 cell=v*3.;cell.y+=uTime*.13;vec3 grid=floor(cell);
  vec3 seed=vec3(hash(grid),hash(grid+4.),hash(grid+9.));
  float spark=exp(-length(fract(cell)-seed)*78.);
  fog+=mix(emission(),vec3(1.),.12)*spark*.35;
  vec2 ring=ringDistances(v);
  halo+=(exp(-abs(ring.x)*30.)+exp(-abs(ring.y)*34.)*.65)*.036;
 }
 return fog+emission()*halo;
}
vec3 sampleSurface(vec3 ro,vec3 rd,out vec2 hit,out vec3 p,out vec3 n){
 hit=march(ro,rd);p=ro+rd*hit.x;n=vec3(0.,1.,0.);
 vec3 c=sky(rd);
 if(hit.y>0.){n=normalAt(p,hit.y);c=surface(p,rd,hit.y,n,true);}
 float reach=min(hit.x,10.);
 return c*exp(-reach*.018)+atmosphere(ro,rd,reach);
}
vec3 reflectionLight(vec3 p,vec3 rd,vec3 n){
 vec3 rr=reflect(rd,n);vec3 origin=p+n*.026;
 vec2 bounce=march(origin,rr);
 if(bounce.y<.5)return sky(rr);
 vec3 at=origin+rr*bounce.x;
 return surface(at,rr,bounce.y,normalAt(at,bounce.y),false);
}
vec3 addReflection(vec3 c,vec3 rd,vec3 n,float id,vec3 reflected){
 if(!isReflective(id))return c;
 float fres=.06+.64*pow(1.-clamp(dot(n,-rd),0.,1.),5.);
 // Emitted interior/core light stays additive, rather than disappearing in a mix.
 return c+reflected*(isFloor(id)?.35:fres);
}
void main(){
 crystalXZ=turn(uTime*.11);crystalXY=turn(.2*sin(uTime*.19));
 orbitA=turn(.64+.1*sin(uTime*.14));orbitB=turn(1.05+.12*cos(uTime*.12));
 vec3 ro=vec3(uPointer.x*.35,.75+uPointer.y*.2,5.2);
 vec3 forward=normalize(vec3(0.,-.1,0.)-ro);
 vec3 right=normalize(cross(forward,vec3(0.,1.,0.))),up=cross(right,forward);
 vec2 offset=uSamples>1?vec2(-.25,-.25):vec2(0.);
 vec2 uv=((gl_FragCoord.xy+offset)*2.-uResolution)/uResolution.y;
 vec3 rd=normalize(forward*1.65+right*uv.x+up*uv.y);
 vec2 hit;vec3 p,n;vec3 c=sampleSurface(ro,rd,hit,p,n);
 if(uSamples>1){
  vec2 uv2=((gl_FragCoord.xy+vec2(.25,.25))*2.-uResolution)/uResolution.y;
  vec3 rd2=normalize(forward*1.65+right*uv2.x+up*uv2.y);
  vec2 hit2;vec3 p2,n2;vec3 c2=sampleSurface(ro,rd2,hit2,p2,n2);
  // Smooth adjacent subpixels share a bounce. Material/facet edges need their own
  // bounded bounce so crystal light is never reused as an unrelated floor reflection.
  vec3 reflected=vec3(0.),reflected2=vec3(0.);
  if(isReflective(hit.y))reflected=reflectionLight(p,rd,n);
  if(isReflective(hit2.y)){
   if(isReflective(hit.y)&&hit.y==hit2.y&&dot(n,n2)>.98)reflected2=reflected;
   else reflected2=reflectionLight(p2,rd2,n2);
  }
  c=(addReflection(c,rd,n,hit.y,reflected)+addReflection(c2,rd2,n2,hit2.y,reflected2))*.5;
 }else if(isReflective(hit.y)){
  c=addReflection(c,rd,n,hit.y,reflectionLight(p,rd,n));
 }
 vec2 centerUV=(gl_FragCoord.xy*2.-uResolution)/uResolution.y;
 c*=1.-.16*clamp(dot(centerUV,centerUV)*.2,0.,1.);
 c=max(c-vec3(.003),vec3(0.));
 // Deterministic subpixels are averaged in linear radiance before tone mapping.
 c=c/(1.+c);c=pow(c,vec3(.4545));color=vec4(c,1.);
}`;

/** GPU-only background scene; web ray marching, not hardware ray tracing. */
export function createUltraRenderer(canvas, options = {}) {
  const status = (value) => options.onStatus?.(value);
  let gl;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
  } catch {
    status("unsupported");
    return null;
  }
  if (!gl) {
    status("unsupported");
    return null;
  }
  const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);
  const requestedQuality = options.quality === "cinema" ? "cinema" : "high";
  const cinema = requestedQuality === "cinema";
  const maxPixels = Math.max(
    100_000,
    Math.min(2_400_000, finite(options.maxPixels, cinema ? 2_400_000 : 1_600_000)),
  );
  const maxDpr = Math.max(0.5, Math.min(2, finite(options.maxDpr, cinema ? 2 : 1.6)));
  const steps = Math.max(24, Math.min(96, Math.round(finite(options.steps, cinema ? 96 : 64))));
  const fps = Math.max(15, Math.min(60, finite(options.maxFps, 60)));
  let program,
    vao,
    uniforms,
    frame = 0,
    running = false,
    disposed = false,
    lost = false;
  let elapsed = 0,
    last = 0,
    previousDraw = 0;
  let ready = false,
    quality = 1,
    actualFps = fps;
  let previousRaf = 0,
    intervalEma = 0,
    slowSince = 0,
    backoffAt = 0;
  let pointer = [0, 0],
    smoothPointer = [0, 0],
    tint = [0.24, 0.72, 1];
  function release() {
    if (program) gl.deleteProgram(program);
    if (vao) gl.deleteVertexArray(vao);
    program = null;
    vao = null;
  }
  function build() {
    const shaders = [];
    try {
      program = gl.createProgram();
      for (const [kind, source] of [
        [gl.VERTEX_SHADER, VERTEX],
        [gl.FRAGMENT_SHADER, FRAGMENT],
      ]) {
        const shader = gl.createShader(kind);
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) || "Shader link failed");
      vao = gl.createVertexArray();
      uniforms = Object.fromEntries(
        ["uResolution", "uPointer", "uTime", "uTint", "uSteps", "uSamples"].map((name) => [
          name,
          gl.getUniformLocation(program, name),
        ]),
      );
      ready = false;
      return true;
    } catch {
      release();
      status("error");
      return false;
    } finally {
      shaders.forEach((shader) => gl.deleteShader(shader));
    }
  }
  function resize() {
    if (disposed || lost) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.min(32768, finite(rect.width, 1))),
      height = Math.max(1, Math.min(32768, finite(rect.height, 1)));
    const dpr = Math.max(0.1, finite(globalThis.devicePixelRatio, 1));
    const scale = Math.min(dpr, maxDpr, Math.sqrt(maxPixels / (width * height))) * quality;
    const nextWidth = Math.max(1, Math.floor(width * scale));
    const nextHeight = Math.max(1, Math.floor(height * scale));
    if (canvas.width !== nextWidth) canvas.width = nextWidth;
    if (canvas.height !== nextHeight) canvas.height = nextHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  function render(now) {
    frame = 0;
    if (!running || disposed || lost || !program) return;
    frame = requestAnimationFrame(render);
    if (previousRaf) {
      const interval = Math.min(200, Math.max(0, now - previousRaf));
      intervalEma = intervalEma ? intervalEma * 0.94 + interval * 0.06 : interval;
      if (intervalEma > (1000 / actualFps) * 1.45) {
        if (!slowSince) slowSince = now;
        if (now - slowSince > 2500 && now - backoffAt > 4000 && quality > 0.6) {
          quality = quality > 0.8 ? 0.8 : 0.6;
          actualFps = Math.min(fps, quality === 0.8 ? 45 : 30);
          backoffAt = now;
          slowSince = 0;
          resize();
        }
      } else slowSince = 0;
    }
    previousRaf = now;
    if (previousDraw && now - previousDraw < 1000 / actualFps - 0.5) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    previousDraw = now;
    elapsed += dt;
    const blend = 1 - Math.exp(-dt * 5);
    smoothPointer[0] += (pointer[0] - smoothPointer[0]) * blend;
    smoothPointer[1] += (pointer[1] - smoothPointer[1]) * blend;
    try {
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
      gl.uniform2f(uniforms.uPointer, ...smoothPointer);
      gl.uniform1f(uniforms.uTime, elapsed);
      gl.uniform3f(uniforms.uTint, ...tint);
      gl.uniform1i(uniforms.uSteps, Math.max(24, Math.round(steps * quality)));
      gl.uniform1i(uniforms.uSamples, cinema && quality === 1 ? 2 : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!ready) {
        if (typeof gl.getError === "function" && gl.getError() !== gl.NO_ERROR)
          throw new Error("Initial GPU draw failed");
        ready = true;
        status("ready");
      }
    } catch {
      pause();
      status("error");
    }
  }
  function pause() {
    running = false;
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    previousDraw = 0;
    previousRaf = 0;
    intervalEma = 0;
    slowSince = 0;
  }
  function start() {
    if (disposed || running) return;
    running = true;
    if (!lost) {
      if (!program && !build()) {
        running = false;
        return;
      }
      resize();
      last = 0;
      frame = requestAnimationFrame(render);
    }
  }
  function onLost(event) {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    frame = 0;
    status("context-lost");
  }
  function onRestored() {
    if (disposed) return;
    lost = false;
    release();
    ready = false;
    last = 0;
    previousDraw = 0;
    previousRaf = 0;
    intervalEma = 0;
    slowSince = 0;
    if (running) {
      if (build()) {
        resize();
        frame = requestAnimationFrame(render);
      } else running = false;
    }
  }
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  if (!build()) {
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
  resize();
  return {
    start,
    pause,
    resize,
    getDiagnostics() {
      return {
        requestedQuality,
        effectiveSamples: cinema && quality === 1 ? 2 : 1,
        steps: Math.max(24, Math.round(steps * quality)),
        requestedFps: fps,
        actualFps,
        measuredRafFps: intervalEma > 0 ? 1000 / intervalEma : null,
        resolutionScale: quality,
        maxPixels,
        width: canvas.width,
        height: canvas.height,
        ready,
        running,
        lost,
      };
    },
    setPointer(x, y) {
      pointer = [
        Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0,
        Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0,
      ];
    },
    setTheme(theme) {
      if (Array.isArray(theme) && theme.length === 3 && theme.every(Number.isFinite))
        tint = theme.map((v) => Math.max(0, Math.min(1, v)));
    },
    dispose() {
      if (disposed) return;
      pause();
      disposed = true;
      ready = false;
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      release();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
