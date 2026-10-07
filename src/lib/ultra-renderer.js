const VERTEX = `#version 300 es
precision highp float;
const vec2 p[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
void main(){gl_Position=vec4(p[gl_VertexID],0.,1.);}`;

const FRAGMENT = `#version 300 es
precision highp float;
out vec4 color;
uniform vec2 uResolution;
uniform vec2 uLogicalSize;
uniform vec2 uPointer;
uniform vec3 uTint;
uniform float uTime;
uniform float uFrameWidthPx;
uniform int uSamples;
uniform sampler2D uNormal;
uniform sampler2D uRoughness;
const float PI=3.14159265359;
vec2 openingInset(){
 // Reserve rounding tolerance plus one backing-pixel footprint for CSS resampling.
 vec2 transparentGuard=vec2(1.)+uLogicalSize/uResolution;
 return max(vec2(0.),vec2(uFrameWidthPx)-transparentGuard);
}
bool inArtwork(vec2 p){
 vec2 inset=openingInset();
 return p.x>=inset.x&&p.y>=inset.y&&
        p.x<=uLogicalSize.x-inset.x&&p.y<=uLogicalSize.y-inset.y;
}
vec3 fresnel(float cosine,vec3 f0){
 return f0+(1.-f0)*pow(1.-clamp(cosine,0.,1.),5.);
}
float distribution(float nh,float roughness){
 float a=roughness*roughness,a2=a*a;
 float d=nh*nh*(a2-1.)+1.;
 return a2/max(PI*d*d,.00001);
}
float geometry(float nv,float nl,float roughness){
 float k=pow(roughness+1.,2.)*.125;
 return nv/(nv*(1.-k)+k)*nl/(nl*(1.-k)+k);
}
vec3 light(vec3 n,vec3 v,vec3 l,vec3 f0,float roughness,vec3 radiance){
 vec3 h=normalize(v+l);
 float nv=max(dot(n,v),.001),nl=max(dot(n,l),0.),nh=max(dot(n,h),0.);
 vec3 f=fresnel(max(dot(h,v),0.),f0);
 return f*distribution(nh,roughness)*geometry(nv,nl,roughness)*
        radiance*nl/max(4.*nv*nl,.001);
}
vec3 environment(vec3 r){
 float sky=smoothstep(-.5,.85,r.y);
 vec3 studioWindow=vec3(-.4+.05*sin(uTime*.09),.7+.03*sin(uTime*.061),1.);
 float windowLight=pow(max(dot(r,normalize(studioWindow)),0.),42.);
 return mix(vec3(.026,.03,.037),vec3(.18,.195,.21),sky)+vec3(.1)*windowLight;
}
vec4 frameSample(vec2 pixel){
 vec2 p=pixel/uResolution*uLogicalSize;
 if(inArtwork(p)||any(lessThan(p,vec2(0.)))||any(greaterThan(p,uLogicalSize)))return vec4(0.);
 vec4 edges=vec4(p.x,uLogicalSize.x-p.x,p.y,uLogicalSize.y-p.y);
 float nearest=min(min(edges.x,edges.y),min(edges.z,edges.w));
 vec2 inset=openingInset();
 vec2 inward=vec2(1.,0.);float along=p.y,usableWidth=inset.x;
 if(nearest==edges.y){inward=vec2(-1.,0.);along=uLogicalSize.y-p.y;}
 if(nearest==edges.z){inward=vec2(0.,1.);along=uLogicalSize.x-p.x;usableWidth=inset.y;}
 if(nearest==edges.w){inward=vec2(0.,-1.);along=p.x;usableWidth=inset.y;}
 float across=clamp(nearest/max(usableWidth,.001),0.,1.);
 // Analytic bevel normals; no scene, ray marching, or source-art sampling.
 float slope=.82*(1.-smoothstep(.08,.28,across))-.62*smoothstep(.72,.96,across);
 vec3 n=normalize(vec3(-inward*slope,1.));
 vec3 tangent=vec3(-inward.y,inward.x,0.);
 vec3 bitangent=normalize(cross(n,tangent));
 // V grows toward the outer edge, matching this right-handed tangent basis.
 vec2 materialUV=vec2(along*.012,1.-across);
 vec3 baked=texture(uNormal,materialUV).xyz*2.-1.;
 // Blender OpenGL +Y normals are data; the green channel is not inverted.
 n=normalize(n*max(baked.z,.25)+tangent*baked.x*.12+bitangent*baked.y*.12);
 float roughness=clamp(texture(uRoughness,materialUV).r,.31,.46);
 vec3 v=normalize(vec3(uPointer*.22,2.5));
 vec3 f0=clamp(vec3(.66,.685,.71)+clamp(uTint,0.,1.)*.025,0.,.8);
 vec3 radiance=fresnel(max(dot(n,v),0.),f0)*environment(reflect(-v,n));
 // Two bounded studio-light taps soften the highlight. Only its direction drifts,
 // slowly; the artwork aperture still returns transparent before any lighting.
 vec3 studioKey=vec3(-.6+.07*sin(uTime*.09),.9+.04*sin(uTime*.061),1.2);
 radiance+=light(n,v,normalize(studioKey+vec3(-.1,.04,0.)),f0,roughness,vec3(.25,.265,.285));
 radiance+=light(n,v,normalize(studioKey+vec3(.1,-.04,0.)),f0,roughness,vec3(.25,.265,.285));
 radiance+=light(n,v,normalize(vec3(.8,-.35,.9)),f0,roughness,vec3(.11,.115,.13));
 // A narrow glass lip belongs to the outside gutter, never across original pixels.
 float lip=exp(-pow((usableWidth-nearest-.65)/.42,2.));
 float glass=pow(1.-clamp(dot(n,v),0.,1.),5.);
 radiance+=vec3(.08,.095,.11)*lip*(.25+glass);
 float alpha=smoothstep(0.,.7,nearest);
 return vec4(radiance*alpha,alpha);
}
void main(){
 // Hard guard precedes AA: even a subpixel sample can never tint original art.
 vec2 logical=gl_FragCoord.xy/uResolution*uLogicalSize;
 if(inArtwork(logical)){color=vec4(0.);return;}
 if(uSamples>1)color=(frameSample(gl_FragCoord.xy-vec2(.25))+
                     frameSample(gl_FragCoord.xy+vec2(.25)))*.5;
 else color=frameSample(gl_FragCoord.xy);
 // Average covered linear radiance first, then encode premultiplied canvas color.
 vec3 radiance=color.rgb/max(color.a,.00001);
 color.rgb=pow(max(radiance/(1.+radiance),vec3(0.)),vec3(.4545))*color.a;
}`;

const NORMAL_PATH = "/ultra-materials/brushed-alloy-normal.png";
const ROUGHNESS_PATH = "/ultra-materials/brushed-alloy-roughness.png";

/** Local transparent picture-frame optics. The source artwork is never a texture. */
export function createUltraRenderer(canvas, options = {}) {
  const status = (value) => options.onStatus?.(value);
  let gl;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
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
  const frameWidthPx = Math.max(4, Math.min(24, finite(options.frameWidthPx, 12)));
  const fps = Math.max(15, Math.min(60, finite(options.maxFps, 60)));
  let program,
    vao,
    uniforms,
    frame = 0;
  let running = false,
    disposed = false,
    lost = false,
    ready = false;
  let logicalWidth = 1,
    logicalHeight = 1;
  let quality = 1,
    actualFps = fps;
  let last = 0,
    previousDraw = 0,
    previousRaf = 0,
    intervalEma = 0,
    slowSince = 0,
    backoffAt = 0;
  let elapsed = 0;
  let pointer = [0, 0],
    smoothPointer = [0, 0],
    tint = [0.24, 0.72, 1];
  let generation = 0,
    loadGeneration = 0;
  let materialState = "pending";
  let materialReported = false;
  const requests = new Set();
  const maps = [
    {
      path: NORMAL_PATH,
      neutral: [128, 128, 255, 255],
      texture: null,
      bitmap: null,
      state: "idle",
      uploaded: -1,
    },
    {
      path: ROUGHNESS_PATH,
      neutral: [102, 102, 102, 255],
      texture: null,
      bitmap: null,
      state: "idle",
      uploaded: -1,
    },
  ];
  function reportMaterial(value) {
    if (disposed || (materialReported && materialState === value)) return;
    materialState = value;
    materialReported = true;
    options.onMaterialState?.(value);
  }
  function isVisible() {
    if (
      (Number.isFinite(canvas.clientWidth) && canvas.clientWidth <= 0) ||
      (Number.isFinite(canvas.clientHeight) && canvas.clientHeight <= 0)
    )
      return false;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(0, finite(rect.width, 0)),
      height = Math.max(0, finite(rect.height, 0));
    const left = finite(rect.left, 0),
      top = finite(rect.top, 0);
    return (
      width > 0 &&
      height > 0 &&
      left + width > 0 &&
      top + height > 0 &&
      left < finite(globalThis.innerWidth, Infinity) &&
      top < finite(globalThis.innerHeight, Infinity)
    );
  }
  let visible = isVisible();
  function release() {
    if (program) gl.deleteProgram(program);
    if (vao) gl.deleteVertexArray(vao);
    for (const map of maps) {
      if (map.texture) gl.deleteTexture(map.texture);
      map.texture = null;
      map.uploaded = -1;
    }
    program = null;
    vao = null;
  }
  function build() {
    const shaders = [];
    generation++;
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
        [
          "uResolution",
          "uLogicalSize",
          "uPointer",
          "uTint",
          "uTime",
          "uFrameWidthPx",
          "uSamples",
          "uNormal",
          "uRoughness",
        ].map((name) => [name, gl.getUniformLocation(program, name)]),
      );
      maps.forEach((map, index) => {
        map.texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, map.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          1,
          1,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          new Uint8Array(map.neutral),
        );
      });
      ready = false;
      if (materialState === "baked") reportMaterial("pending");
      return true;
    } catch {
      release();
      status("error");
      return false;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }
  function schedule() {
    if (running && visible && !lost && !disposed && !frame) frame = requestAnimationFrame(render);
  }
  function loadMaps() {
    if (!running || !visible || lost || disposed) return;
    reportMaterial(materialState);
    for (const map of maps) {
      if (map.state !== "idle") continue;
      if (
        typeof globalThis.fetch !== "function" ||
        typeof globalThis.createImageBitmap !== "function" ||
        typeof globalThis.AbortController !== "function"
      ) {
        map.state = "failed";
        reportMaterial("fallback");
        continue;
      }
      map.state = "pending";
      const token = loadGeneration;
      const controller = new AbortController();
      requests.add(controller);
      let request;
      try {
        request = globalThis.fetch(map.path, {
          credentials: "same-origin",
          signal: controller.signal,
        });
      } catch {
        requests.delete(controller);
        map.state = "failed";
        reportMaterial("fallback");
        continue;
      }
      void Promise.resolve(request)
        .then((response) => {
          if (disposed || token !== loadGeneration) return null;
          if (!response.ok) throw new Error("Material texture unavailable");
          return response.blob();
        })
        .then((blob) => {
          if (!blob || disposed || token !== loadGeneration) return null;
          return globalThis.createImageBitmap(blob, {
            imageOrientation: "flipY",
            premultiplyAlpha: "none",
            colorSpaceConversion: "none",
          });
        })
        .then((bitmap) => {
          if (!bitmap) return;
          if (disposed || token !== loadGeneration) {
            bitmap.close?.();
            return;
          }
          map.bitmap = bitmap;
          map.state = "decoded";
          // Decoding may finish during pause/loss. Upload only in a live render.
          schedule();
        })
        .catch(() => {
          if (disposed || token !== loadGeneration) return;
          map.state = "failed";
          reportMaterial("fallback");
        })
        .finally(() => requests.delete(controller));
    }
  }
  function uploadMaps() {
    if (!running || !visible || lost || disposed) return;
    maps.forEach((map, index) => {
      if (!map.bitmap || map.uploaded === generation || map.state === "failed") return;
      try {
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, map.texture);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, map.bitmap);
        if (typeof gl.getError === "function" && gl.getError() !== gl.NO_ERROR)
          throw new Error("Material texture upload failed");
        map.uploaded = generation;
      } catch {
        map.state = "failed";
        reportMaterial("fallback");
      }
    });
  }
  function resize() {
    if (disposed || lost) return;
    const layoutWidth = canvas.clientWidth;
    const layoutHeight = canvas.clientHeight;
    const hasLayout = Number.isFinite(layoutWidth) && Number.isFinite(layoutHeight);
    if (hasLayout && (layoutWidth <= 0 || layoutHeight <= 0)) {
      visible = false;
      cancelAnimationFrame(frame);
      frame = 0;
      resetClock();
      return;
    }
    // CSS gutters live in layout coordinates. Transformed/perspective rects only
    // describe screen visibility; the rect fallback supports non-DOM test canvases.
    const rect = hasLayout ? null : canvas.getBoundingClientRect();
    logicalWidth = Math.max(1, Math.min(32768, hasLayout ? layoutWidth : finite(rect.width, 1)));
    logicalHeight = Math.max(1, Math.min(32768, hasLayout ? layoutHeight : finite(rect.height, 1)));
    const dpr = Math.max(0.1, finite(globalThis.devicePixelRatio, 1));
    const scale =
      Math.min(dpr, maxDpr, Math.sqrt(maxPixels / (logicalWidth * logicalHeight))) * quality;
    const width = Math.max(1, Math.floor(logicalWidth * scale));
    const height = Math.max(1, Math.floor(logicalHeight * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  function resetClock() {
    last = previousDraw = previousRaf = intervalEma = slowSince = 0;
  }
  function render(now) {
    frame = 0;
    if (!running || !visible || disposed || lost || !program) return;
    schedule();
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
    last = previousDraw = now;
    elapsed += dt;
    const blend = 1 - Math.exp(-dt * 5);
    smoothPointer[0] += (pointer[0] - smoothPointer[0]) * blend;
    smoothPointer[1] += (pointer[1] - smoothPointer[1]) * blend;
    try {
      uploadMaps();
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
      gl.uniform2f(uniforms.uLogicalSize, logicalWidth, logicalHeight);
      gl.uniform2f(uniforms.uPointer, ...smoothPointer);
      gl.uniform3f(uniforms.uTint, ...tint);
      gl.uniform1f(uniforms.uTime, elapsed);
      gl.uniform1f(uniforms.uFrameWidthPx, frameWidthPx);
      gl.uniform1i(uniforms.uSamples, cinema && quality === 1 ? 2 : 1);
      maps.forEach((map, index) => {
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, map.texture);
      });
      gl.uniform1i(uniforms.uNormal, 0);
      gl.uniform1i(uniforms.uRoughness, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const mapsUploaded = maps.every((map) => map.uploaded === generation);
      if (!ready || (materialState !== "baked" && mapsUploaded)) {
        if (typeof gl.getError === "function" && gl.getError() !== gl.NO_ERROR)
          throw new Error("GPU draw failed");
      }
      if (!ready) {
        ready = true;
        status("ready");
      }
      if (mapsUploaded) reportMaterial("baked");
    } catch {
      pause();
      status("error");
    }
  }
  function pause() {
    running = false;
    cancelAnimationFrame(frame);
    frame = 0;
    resetClock();
  }
  function start() {
    if (disposed || running) return;
    running = true;
    visible = isVisible();
    if (lost) return;
    if (!program && !build()) {
      running = false;
      return;
    }
    if (!visible) return;
    resize();
    loadMaps();
    schedule();
  }
  function onLost(event) {
    event.preventDefault();
    lost = true;
    ready = false;
    cancelAnimationFrame(frame);
    frame = 0;
    status("context-lost");
  }
  function onRestored() {
    if (disposed) return;
    lost = false;
    release();
    resetClock();
    if (materialState === "baked") reportMaterial("pending");
    if (running && visible) {
      if (!build()) {
        running = false;
        return;
      }
      resize();
      loadMaps();
      schedule();
    }
  }
  let visibilityObserver = null;
  const updateVisibility = (next) => {
    if (disposed) return;
    visible = next;
    if (!visible) {
      cancelAnimationFrame(frame);
      frame = 0;
      resetClock();
    } else if (running && !lost) {
      if (!program && !build()) {
        running = false;
        return;
      }
      resize();
      loadMaps();
      schedule();
    }
  };
  const measureVisibility = () => updateVisibility(isVisible());
  let stopVisibility = () => {};
  if (typeof globalThis.IntersectionObserver === "function") {
    visibilityObserver = new globalThis.IntersectionObserver((entries) => {
      if (disposed) return;
      const entry = entries.find((item) => item.target === canvas);
      if (!entry) return;
      updateVisibility(entry.isIntersecting && entry.intersectionRatio > 0);
    });
    visibilityObserver.observe(canvas);
    stopVisibility = () => visibilityObserver.disconnect();
  } else if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("scroll", measureVisibility, { passive: true, capture: true });
    globalThis.addEventListener("resize", measureVisibility, { passive: true });
    stopVisibility = () => {
      globalThis.removeEventListener("scroll", measureVisibility, true);
      globalThis.removeEventListener("resize", measureVisibility);
    };
  }
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  if (!build()) {
    stopVisibility();
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
        steps: 0,
        frameWidthPx,
        materialState,
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
      loadGeneration++;
      ready = false;
      stopVisibility();
      for (const request of requests) request.abort();
      requests.clear();
      for (const map of maps) {
        map.bitmap?.close?.();
        map.bitmap = null;
      }
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      release();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.width = canvas.height = 1;
    },
  };
}
