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
mat2 turn(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec3 emission(){return pow(clamp(uTint,0.,1.),vec3(2.5));}
vec2 scene(vec3 p){
  vec3 q=p-vec3(0.,.25,0.);q.xz=turn(uTime*.14)*q.xz;
  q.xy=turn(.23*sin(uTime*.22))*q.xy;
  float crystal=(abs(q.x)+abs(q.y)*.72+abs(q.z)-1.05)*.57;
  vec3 r=p-vec3(0.,.05,0.);r.yz=turn(.72)*r.yz;
  float ring=length(vec2(length(r.xz)-1.65,r.y))-.032;
  vec2 d=vec2(crystal,1.);
  if(ring<d.x)d=vec2(ring,2.);
  float floorD=p.y+1.1;if(floorD<d.x)d=vec2(floorD,3.);
  return d;
}
vec3 normalAt(vec3 p){vec2 e=vec2(.002,0.);return normalize(vec3(
 scene(p+e.xyy).x-scene(p-e.xyy).x,
 scene(p+e.yxy).x-scene(p-e.yxy).x,
 scene(p+e.yyx).x-scene(p-e.yyx).x));}
vec2 march(vec3 ro,vec3 rd){float t=0.;float id=0.;for(int i=0;i<96;i++){
 if(i>=uSteps)break;vec2 h=scene(ro+rd*t);if(h.x<.003){id=h.y;break;}
 t+=max(h.x*.82,.002);if(t>16.)break;}return vec2(t,id);}
float shadow(vec3 p,vec3 l){float s=1.;float t=.035;for(int i=0;i<18;i++){
 float d=scene(p+l*t).x;s=min(s,10.*d/t);t+=clamp(d,.03,.3);if(t>5.||s<.01)break;}
 return clamp(s,.12,1.);}
vec3 sky(vec3 rd){float halo=pow(max(0.,dot(rd,normalize(vec3(-.6,.45,-1.)))),12.);
 return emission()*halo*.006;}
vec3 shade(vec3 p,vec3 rd,float id){
 if(id>1.5&&id<2.5)return emission()*3.5;
 vec3 n=normalAt(p),l=normalize(vec3(-3.,4.,2.)-p);
 float diff=max(dot(n,l),0.)*shadow(p+n*.012,l);
 float fres=pow(1.-max(dot(n,-rd),0.),4.);
 float spec=pow(max(dot(reflect(-l,n),-rd),0.),72.);
 vec3 base=id>2.5?vec3(.001,.0015,.002):emission()*.012;
 float highlight=id>2.5?.025:1.;
 return base*(.08+diff*.4)+emission()*fres*.5*highlight
   +mix(emission(),vec3(1.),.12)*spec*.9*highlight;
}
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
void main(){
 vec2 uv=(gl_FragCoord.xy*2.-uResolution)/uResolution.y;
 vec3 ro=vec3(uPointer.x*.35,.75+uPointer.y*.2,5.2);
 vec3 target=vec3(0.,-.1,0.);vec3 forward=normalize(target-ro);
 vec3 right=normalize(cross(forward,vec3(0.,1.,0.))),up=cross(right,forward);
 vec3 rd=normalize(forward*1.65+right*uv.x+up*uv.y);
 vec2 hit=march(ro,rd);vec3 c=sky(rd);vec3 p=ro+rd*hit.x;
 if(hit.y>0.){
  c=shade(p,rd,hit.y);
  vec3 n=normalAt(p),rr=reflect(rd,n);
  vec2 bounce=march(p+n*.025,rr);
  vec3 reflected=bounce.y>0.?shade(p+n*.025+rr*bounce.x,rr,bounce.y):sky(rr);
  float fres=.12+.65*pow(1.-max(dot(n,-rd),0.),5.);
  c=mix(c,reflected,hit.y>2.5?.48:fres);
 }
 // Bounded volumetric samples provide light mist and drifting GPU particles.
 float reach=min(hit.x,10.);vec3 fog=vec3(0.);
 for(int i=0;i<14;i++){
  float t=(float(i)+.5)/14.*reach;vec3 v=ro+rd*t;
  float beam=exp(-dot(v.xz,v.xz)*.55)*exp(-abs(v.y)*.65);
  fog+=emission()*beam*.0015;
  vec3 cell=v*3.;cell.y+=uTime*.18;vec3 grid=floor(cell);
  vec3 seed=vec3(hash(grid),hash(grid+4.),hash(grid+9.));
  float spark=exp(-length(fract(cell)-seed)*65.);
  fog+=mix(emission(),vec3(1.),.08)*spark*.65;
 }
 // Analytic emissive halo is a bloom approximation, without a full-screen blur pass.
 float ringGlow=0.;for(int i=0;i<10;i++){
  float t=(float(i)+.5)/10.*reach;vec3 v=ro+rd*t-vec3(0.,.05,0.);
  v.yz=turn(.72)*v.yz;float d=length(vec2(length(v.xz)-1.65,v.y));
  ringGlow+=exp(-d*10.)*.08;
 }
 c=c*exp(-reach*.022)+fog+emission()*ringGlow;
 c*=1.-.16*clamp(dot(uv,uv)*.2,0.,1.);
 // Screen compositing needs a true black neutral, not a gamma-lifted ambient field.
 c=max(c-vec3(.003),vec3(0.));
 c=c/(1.+c);c=pow(c,vec3(.4545));
 color=vec4(c,1.);
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
  const maxPixels = Math.max(100_000, Math.min(2_400_000, finite(options.maxPixels, 1_600_000)));
  const maxDpr = Math.max(0.5, Math.min(2, finite(options.maxDpr, 1.6)));
  const steps = Math.max(24, Math.min(96, Math.round(finite(options.steps, 64))));
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
        ["uResolution", "uPointer", "uTime", "uTint", "uSteps"].map((name) => [
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
      gl.uniform1i(uniforms.uSteps, steps);
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
