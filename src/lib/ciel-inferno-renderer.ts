/** A short-lived, self-contained effect. No page pixels are captured or changed. */
export const CIEL_INFERNO_DURATION = 9200;
export const CIEL_INFERNO_JET = "/ciel-inferno-20261019/jet.webp";
const TAU = Math.PI * 2;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (a: number, b: number, t: number) => {
  const p = clamp((t - a) / (b - a));
  return p * p * (3 - 2 * p);
};
const random = (n: number) => {
  const p = Math.sin(n * 127.1 + 77.7) * 43758.5453;
  return p - Math.floor(p);
};
const SEEDS = new Float32Array(128 * 6);
for (let i = 0; i < SEEDS.length; i++) SEEDS[i] = random(i + 3.7);

export type InfernoGeometry = {
  width: number;
  height: number;
  mouthX: number;
  mouthY: number;
  angle: number;
};

type Options = {
  field: HTMLCanvasElement;
  detail: HTMLCanvasElement;
  coarse: boolean;
  onFailure: () => void;
  onAtlasState?: (state: "ready" | "fallback") => void;
};

const NOISE = `
float hash(vec2 p) { vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z); }
float noise(vec2 p) {vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p) {float n=0.,w=.54;for(int i=0;i<4;i++){n+=w*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p+7.13;w*=.48;}return n;}
`;
const FIELD = `
precision highp float;
uniform vec2 uSize;
uniform vec2 uMouth;
uniform vec2 uDir;
uniform float uTime;
VARYING vec2 vUV;
${NOISE}
void main(){
 vec2 uv=vec2(vUV.x,1.-vUV.y), aspect=vec2(uSize.x/uSize.y,1.);
 vec2 p=(uv-uMouth)*aspect, dir=normalize(uDir), side=vec2(-dir.y,dir.x);
 float t=uTime, along=dot(p,dir), across=dot(p,side), d=length(p);
 float flow=fbm(vec2(along*4.-t*2.7,across*11.+t*.7));
 float curl=fbm(vec2(across*13.+flow*2.7,along*5.-t*3.2));
 float rib=pow(clamp(1.-abs(curl*2.-1.),0.,1.),3.);
 float jetOn=smoothstep(1.02,1.65,t)*(1.-smoothstep(4.4,5.5,t));
 float reach=mix(.05,length(aspect)*1.15,smoothstep(1.15,3.1,t));
 float breadth=.016+max(along,0.)*.17;
 float cone=(1.-smoothstep(breadth*.35,breadth*1.6,abs(across+(flow-.5)*breadth*.8)))*step(0.,along)*(1.-smoothstep(reach*.8,reach,along));
 float jet=cone*(.24+.76*rib)*jetOn;
 vec2 adv=uv*vec2(6.,8.)+vec2(fbm(uv*5.+t*.13),-t*.9);
 float billow=fbm(adv*2.+vec2(flow,-t*.35));
 float burn=smoothstep(2.1,5.25,t), radius=burn*length(aspect)*1.22;
 float front=d-radius+(billow-.5)*.21;
 float inside=(1.-smoothstep(-.045,.06,front))*smoothstep(2.1,2.4,t);
 float crown=exp(-abs(front)*27.)*(.3+.7*billow)*smoothstep(2.15,2.8,t)*(1.-smoothstep(5.3,6.5,t));
 float tongues=pow(clamp(billow*1.8-.35,0.,1.),1.6)*inside*(1.-smoothstep(5.,6.8,t));
 float cracks=pow(clamp(fbm(uv*vec2(45.,59.))-.52,0.,1.)*2.3,3.);
 float coal=smoothstep(4.3,6.25,t);
 float heat=clamp(jet*.92+crown*.9+tongues*.46,0.,1.);
 vec3 forest=vec3(.015,.11,.045), emerald=vec3(.075,.58,.17), core=vec3(.72,.96,.39);
 vec3 fire=mix(forest,emerald,smoothstep(.05,.5,heat));fire=mix(fire,core,pow(heat,3.)*.65);
 vec3 ash=vec3(.006,.012,.009)+vec3(.015,.021,.017)*fbm(uv*22.);
 vec3 colour=mix(fire*(jet+crown+tongues),ash,coal*inside);
 colour+=vec3(.1,.42,.08)*cracks*coal*(1.-smoothstep(6.1,7.8,t));
 float dim=.24*smoothstep(0.,.65,t);
 float alpha=max(dim,max(inside*.96,max(jet*.84,crown*.86)));
 // Burn remains opaque; never reveal the untouched page behind the shell.
 float black=smoothstep(6.6,9.,t);
 OUTPUT=vec4(colour*(1.-black),clamp(max(alpha,black),0.,1.));
}`;

function createField(canvas: HTMLCanvasElement) {
  const attributes: WebGLContextAttributes = {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "default",
  };
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  let version2 = false;
  try {
    gl = canvas.getContext("webgl2", attributes);
    version2 = Boolean(gl);
    gl ||= canvas.getContext("webgl", attributes);
  } catch {
    return null;
  }
  if (!gl) return null;
  const context = gl;
  const prefix = version2 ? "#version 300 es\n" : "";
  const vertex = version2
    ? `${prefix}in vec2 position;out vec2 vUV;void main(){vUV=position*.5+.5;gl_Position=vec4(position,0,1);}`
    : "attribute vec2 position;varying vec2 vUV;void main(){vUV=position*.5+.5;gl_Position=vec4(position,0,1);}";
  const fragment =
    prefix +
    FIELD.replace("VARYING", version2 ? "in" : "varying")
      .replace("OUTPUT", version2 ? "outColor" : "gl_FragColor")
      .replace("void main(){", `${version2 ? "out vec4 outColor;" : ""}\nvoid main(){`);
  const compile = (type: number, source: string) => {
    const shader = context.createShader(type);
    if (!shader) throw new Error("shader unavailable");
    context.shaderSource(shader, source);
    context.compileShader(shader);
    if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
      context.deleteShader(shader);
      throw new Error("shader compilation unavailable");
    }
    return shader;
  };
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  const shaders: WebGLShader[] = [];
  try {
    shaders.push(compile(context.VERTEX_SHADER, vertex));
    shaders.push(compile(context.FRAGMENT_SHADER, fragment));
    program = context.createProgram();
    if (!program) throw new Error("program unavailable");
    shaders.forEach((shader) => context.attachShader(program!, shader));
    context.linkProgram(program);
    if (!context.getProgramParameter(program, context.LINK_STATUS))
      throw new Error("link unavailable");
    context.useProgram(program);
    buffer = context.createBuffer();
    if (!buffer) throw new Error("geometry unavailable");
    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.bufferData(
      context.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      context.STATIC_DRAW,
    );
    const location = context.getAttribLocation(program, "position");
    context.enableVertexAttribArray(location);
    context.vertexAttribPointer(location, 2, context.FLOAT, false, 0, 0);
    const size = context.getUniformLocation(program, "uSize");
    const mouth = context.getUniformLocation(program, "uMouth");
    const direction = context.getUniformLocation(program, "uDir");
    const time = context.getUniformLocation(program, "uTime");
    context.disable(context.DEPTH_TEST);
    context.disable(context.BLEND);
    return {
      backend: version2 ? "webgl2" : "webgl",
      render(geometry: InfernoGeometry, seconds: number) {
        context.viewport(0, 0, canvas.width, canvas.height);
        context.uniform2f(size, canvas.width, canvas.height);
        context.uniform2f(
          mouth,
          geometry.mouthX / geometry.width,
          geometry.mouthY / geometry.height,
        );
        context.uniform2f(direction, Math.cos(geometry.angle), Math.sin(geometry.angle));
        context.uniform1f(time, seconds);
        context.drawArrays(context.TRIANGLES, 0, 6);
      },
      dispose() {
        if (buffer) context.deleteBuffer(buffer);
        if (program) context.deleteProgram(program);
        shaders.forEach((shader) => context.deleteShader(shader));
        context.getExtension("WEBGL_lose_context")?.loseContext();
      },
    };
  } catch {
    if (buffer) context.deleteBuffer(buffer);
    if (program) context.deleteProgram(program);
    shaders.forEach((shader) => context.deleteShader(shader));
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
}

/** Canvas2D is a real lower-cost alternative, not a blank error screen. */
function paintFallback(context: CanvasRenderingContext2D, g: InfernoGeometry, t: number) {
  const { width: w, height: h, mouthX: x, mouthY: y } = g;
  const black = ease(6.6, 9, t);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = Math.max(ease(0, 0.65, t) * 0.24, black);
  context.fillStyle = "#020a07";
  context.fillRect(0, 0, w, h);
  const radius = ease(2.1, 5.25, t) * Math.hypot(w, h) * 1.22;
  if (t > 2.1) {
    context.globalAlpha = 0.97 + black * 0.03;
    context.fillStyle = t < 5.3 ? "#07351b" : "#000";
    context.beginPath();
    for (let i = 0; i <= 80; i++) {
      const angle = (i / 80) * TAU;
      const edge =
        radius +
        (Math.sin(angle * 13 + t * 2.3) * 18 + Math.sin(angle * 27 - t * 3.1) * 9) *
          ease(2.1, 2.8, t);
      const px = x + Math.cos(angle) * edge;
      const py = y + Math.sin(angle) * edge;
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
    if (t < 6.3) {
      context.globalAlpha = (1 - ease(5.3, 6.3, t)) * 0.65;
      context.strokeStyle = "#56be49";
      context.lineWidth = 15 + 9 * Math.sin(t * 2);
      context.stroke();
    }
  }
}

export function createCielInfernoRenderer(options: Options) {
  const { field, detail, coarse, onFailure } = options;
  const context = detail.getContext("2d", { alpha: true });
  if (!context) throw new Error("Ciel canvas unavailable");
  const background = createField(field);
  field.hidden = !background;
  let disposed = false;
  let jet: HTMLImageElement | null = null;
  let loaded = false;
  let geometry: InfernoGeometry = { width: 1, height: 1, mouthX: 0, mouthY: 0, angle: 2.45 };
  let ratio = 1;
  let quality = 1;
  let lastFrame = 0;
  let slowFrames = 0;
  let sizing = false;
  const lost = (event: Event) => {
    event.preventDefault();
    if (!disposed) onFailure();
  };
  // A failed shader/context deliberately falls back to 2D. Its explicitly
  // lost failed context must not be mistaken for a live renderer failing.
  if (background) field.addEventListener("webglcontextlost", lost);
  // The decoder is local to the secret. A missing sprite uses the pressure
  // ribbons below, while the shader/ash/escape controls continue normally.
  jet = new Image();
  jet.decoding = "async";
  jet.fetchPriority = "high";
  const image = jet;
  image.onload = () => {
    const ready = () => {
      if (disposed) return;
      loaded = image.naturalWidth === 2048 && image.naturalHeight === 512;
      options.onAtlasState?.(loaded ? "ready" : "fallback");
    };
    if (image.decode)
      void Promise.resolve()
        .then(() => image.decode())
        .then(ready, () => {
          if (!disposed) options.onAtlasState?.("fallback");
        });
    else ready();
  };
  image.onerror = () => {
    if (!disposed) options.onAtlasState?.("fallback");
  };
  image.src = CIEL_INFERNO_JET;

  const resize = (next: InfernoGeometry) => {
    if (disposed || sizing) return;
    sizing = true;
    geometry = next;
    // Limited pixel count, DPR and cadence prevent a nine-second effect
    // becoming an unbounded high-DPR tablet workload.
    ratio =
      Math.min(
        coarse ? 1 : 1.35,
        globalThis.devicePixelRatio || 1,
        Math.sqrt((coarse ? 780000 : 1300000) / (next.width * next.height)),
      ) * quality;
    field.width = Math.max(1, Math.round(next.width * ratio));
    field.height = Math.max(1, Math.round(next.height * ratio));
    detail.width = field.width;
    detail.height = field.height;
    sizing = false;
  };
  const sprite = (
    x: number,
    y: number,
    length: number,
    thickness: number,
    angle: number,
    phase: number,
    alpha: number,
  ) => {
    if (!loaded || !jet || alpha <= 0.002) return;
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    const frame = ((phase % 32) + 32) % 32;
    const first = Math.floor(frame);
    const next = (first + 1) % 32;
    const blend = frame - first;
    const left = (-length * 7.5) / 255;
    context.globalAlpha = alpha * (1 - blend);
    context.drawImage(
      jet,
      (first % 8) * 256 + 0.5,
      (first >> 3) * 128 + 0.5,
      255,
      127,
      left,
      -thickness * 0.5,
      length,
      thickness,
    );
    context.globalAlpha = alpha * blend;
    context.drawImage(
      jet,
      (next % 8) * 256 + 0.5,
      (next >> 3) * 128 + 0.5,
      255,
      127,
      left,
      -thickness * 0.5,
      length,
      thickness,
    );
    context.restore();
  };
  const render = (milliseconds: number) => {
    if (disposed) return;
    const seconds = milliseconds / 1000;
    const delta = milliseconds - lastFrame;
    if (delta < 1000 / (coarse ? 40 : 50)) return;
    if (lastFrame > 0 && delta > 48) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 15 && quality > 0.65) {
      quality *= 0.82;
      resize(geometry);
      slowFrames = 0;
    }
    lastFrame = milliseconds;
    const { width: w, height: h, mouthX: x, mouthY: y, angle } = geometry;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, detail.width, detail.height);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (background) background.render(geometry, seconds);
    else paintFallback(context, geometry, seconds);
    const pressure = ease(1.02, 1.65, seconds) * (1 - ease(4.6, 5.6, seconds));
    const emberFade = 1 - ease(6.8, 8.7, seconds);
    const reach = Math.hypot(w, h) * (0.13 + ease(1.1, 3.2, seconds) * 0.97);
    context.globalCompositeOperation = "lighter";
    if (pressure > 0) {
      if (loaded) {
        // Keep the volume's proportions: a short pressure throat feeds
        // broad, independently advected curls, never one stretched pencil.
        const throat = Math.min(reach, Math.min(w, h) * 0.82);
        const sway = Math.sin(seconds * 1.8) * 0.025;
        context.globalCompositeOperation = "screen";
        sprite(x, y, throat, throat * 0.48, angle + sway, seconds * 16, pressure * 0.7);
        const packets = coarse ? 4 : 6;
        for (let i = 0; i < packets; i++) {
          const k = i * 6;
          const age = (seconds * 0.61 + i / packets) % 1;
          const distance = age * reach * 0.92;
          const curl = Math.sin(seconds * 2.4 - age * 6 + SEEDS[k] * 2) * distance * 0.09;
          const px = x + Math.cos(angle) * distance - Math.sin(angle) * curl;
          const py = y + Math.sin(angle) * distance + Math.cos(angle) * curl;
          const length = throat * (0.46 + age * 0.2);
          if (px < -length || py < -length || px > w + length || py > h + length) continue;
          sprite(
            px,
            py,
            length,
            length * (0.49 + age * 0.23),
            angle + Math.sin(seconds * 2.1 - age * 6 + i) * 0.09,
            seconds * 16 * (0.83 + SEEDS[k + 1] * 0.3) + SEEDS[k + 2] * 32,
            pressure * Math.sin(age * Math.PI) * 0.48,
          );
        }
        // The white-green core occupies only the short mouth nozzle.
        context.globalCompositeOperation = "lighter";
        sprite(x, y, throat * 0.22, throat * 0.1, angle + sway, seconds * 16 + 11, pressure * 0.26);
      } else {
        // Six tapered, pressure-driven ribbons replace an unavailable atlas.
        for (let ribbon = 0; ribbon < 6; ribbon++) {
          context.save();
          context.translate(x, y);
          context.rotate(angle);
          context.globalAlpha = pressure * (0.33 - ribbon * 0.035);
          context.fillStyle = ribbon < 2 ? "#b7ef8c" : "#218842";
          context.beginPath();
          context.moveTo(0, 0);
          for (let j = 1; j < 30; j++) {
            const p = j / 29;
            context.lineTo(
              p * reach,
              Math.sin(p * 18 - seconds * 8 + ribbon) * p * 29 + p * (ribbon - 2.5) * 15,
            );
          }
          for (let j = 29; j > 0; j--) {
            const p = j / 29;
            context.lineTo(
              p * reach,
              Math.sin(p * 18 - seconds * 8 + ribbon) * p * 29 + p * (ribbon - 2.5) * 15 + 13 * p,
            );
          }
          context.closePath();
          context.fill();
          context.restore();
        }
      }
    }
    // The burn front is one continuous shader volume (or the 2D field),
    // never a circular necklace of isolated, leaf-shaped jet sprites.
    // Embers become fine ash and fall; no random state or React updates.
    const count = coarse ? 64 : 104;
    const ash = ease(4.2, 6.5, seconds);
    context.globalCompositeOperation = "source-over";
    context.fillStyle = ash > 0.6 ? "#9caca0" : "#9de475";
    for (let i = 0; i < count; i++) {
      const k = i * 6;
      const life = (((seconds * (0.16 + SEEDS[k] * 0.2) + SEEDS[k + 1]) % 1) + 1) % 1;
      const px = SEEDS[k + 2] * w + Math.sin(life * 8 + i) * 24;
      const py = (SEEDS[k + 3] * h + life * h * (ash > 0.6 ? 0.5 : -0.4) + h) % h;
      context.globalAlpha =
        Math.sin(life * Math.PI) * emberFade * ease(1.8, 3, seconds) * (0.36 + ash * 0.12);
      const size = 0.7 + SEEDS[k + 4] * (ash > 0.6 ? 1.3 : 2);
      context.fillRect(px, py, size, size * (ash > 0.6 ? 1.3 : 2.4));
    }
    context.globalAlpha = 1;
  };
  return {
    backend: background?.backend ?? "2d",
    resize,
    render,
    dispose() {
      if (disposed) return;
      disposed = true;
      field.removeEventListener("webglcontextlost", lost);
      if (jet) jet.onload = jet.onerror = null;
      jet = null;
      background?.dispose();
      field.width = field.height = detail.width = detail.height = 1;
    },
  };
}
