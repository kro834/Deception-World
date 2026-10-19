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
 float t=uTime, along=dot(p,dir), across=dot(p,side);
 float flow=fbm(vec2(along*4.-t*2.7,across*11.+t*.7));
 float curl=fbm(vec2(across*13.+flow*2.7,along*5.-t*3.2));
 float rib=pow(clamp(1.-abs(curl*2.-1.),0.,1.),3.);
 float jetOn=smoothstep(1.02,1.65,t)*(1.-smoothstep(4.4,5.5,t));
 float reach=mix(.05,length(aspect)*1.15,smoothstep(1.15,3.1,t));
 float breadth=.016+max(along,0.)*.17;
 float cone=(1.-smoothstep(breadth*.35,breadth*1.6,abs(across+(flow-.5)*breadth*.8)))*step(0.,along)*(1.-smoothstep(reach*.8,reach,along));
 float jet=cone*(.24+.76*rib)*jetOn;
 // The pressure jet ignites along its axis first, then crawls sideways and
 // back toward its source. Unlike a radial wipe, each region has a burn age.
 float distanceToFire=max(along,0.)*.48+abs(across)*1.28+max(-along,0.)*1.65;
 float travel=smoothstep(2.05,5.65,t)*length(aspect)*1.95;
 vec2 adv=uv*aspect*vec2(8.,6.5)+vec2(0.,t*1.22);
 vec2 warp=vec2(fbm(adv*.8+vec2(t*.14,0.)),fbm(adv*.73+vec2(9.1,t*.23)));
 float billow=fbm(adv*1.9+warp*3.4);
 float detail=noise(adv*7.+warp*5.);
 float front=distanceToFire-travel+(billow-.5)*.22;
 float inside=(1.-smoothstep(-.04,.065,front))*smoothstep(2.05,2.4,t);
 float age=max(0.,-front);
 float life=(1.-smoothstep(5.25,6.7,t));
 // Tall, split tongues flow upward in screen space, not sideways with the
 // ignition mask. Dark valleys retain depth between the luminous folds.
 float tongues=pow(smoothstep(.38,.77,billow),2.)*(.5+.5*detail);
 float crown=exp(-abs(front+.055)*13.)*smoothstep(.25,.7,billow);
 float fuel=(1.-smoothstep(.15,1.7,age))*.8+.2;
 float flame=(tongues*inside*fuel+crown*.85)*life;
 float heat=clamp(jet*.82+flame,0.,1.);
 vec3 forest=vec3(.008,.075,.024), emerald=vec3(.04,.48,.105), core=vec3(.5,.98,.38);
 vec3 fire=mix(forest,emerald,smoothstep(.025,.6,heat));
 fire=mix(fire,core,pow(heat,4.)*.8);
 float charred=smoothstep(.12,.7,age)*inside;
 float cracks=pow(1.-abs(noise(uv*vec2(91.,117.))*2.-1.),16.);
 vec3 ash=vec3(.004,.009,.006)+vec3(.012,.018,.012)*detail;
 vec3 colour=ash*inside+fire*(jet+flame)*1.25;
 colour+=vec3(.08,.24,.025)*cracks*charred*exp(-age*2.)*life;
 // Transparent rolling smoke precedes the edge, never an opaque green disc.
 float smoke=exp(-abs(front-.16)*5.)*billow*.2*smoothstep(2.,3.,t)*life;
 colour+=vec3(.018,.035,.022)*smoke;
 float dim=.24*smoothstep(0.,.65,t);
 float alpha=max(dim,max(inside*.96,max(jet*.84,max(flame*.8,smoke))));
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
  const travel = ease(2.05, 5.65, t) * Math.hypot(w, h) * 1.95;
  if (t > 2.1) {
    context.globalAlpha = 0.97 + black * 0.03;
    context.fillStyle = t < 5.3 ? "#03140b" : "#000";
    context.beginPath();
    for (let i = 0; i <= 80; i++) {
      const angle = (i / 80) * TAU;
      const along = Math.cos(angle - g.angle);
      const across = Math.sin(angle - g.angle);
      const resistance =
        Math.max(along, 0) * 0.48 + Math.abs(across) * 1.28 + Math.max(-along, 0) * 1.65;
      const edge =
        travel / resistance +
        (Math.sin(angle * 13 + t * 2.3) * 18 + Math.sin(angle * 27 - t * 3.1) * 9) *
          ease(2.1, 2.8, t);
      const px = x + Math.cos(angle) * edge;
      const py = y + Math.sin(angle) * edge;
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fill();
    // Independently rising, split flame tips replace the flat outlined wipe.
    const fade = ease(2.1, 2.8, t) * (1 - ease(5.2, 6.7, t));
    for (let i = 0; i < 18; i++) {
      const phase = i * 2.39996;
      const along = Math.cos(phase - g.angle);
      const resistance =
        Math.max(along, 0) * 0.48 +
        Math.abs(Math.sin(phase - g.angle)) * 1.28 +
        Math.max(-along, 0) * 1.65;
      const r = (travel / resistance) * (0.65 + SEEDS[i * 6] * 0.3);
      const px = x + Math.cos(phase) * r;
      const py = y + Math.sin(phase) * r;
      const height = Math.min(h, w) * (0.16 + SEEDS[i * 6 + 1] * 0.32);
      const width = height * 0.22;
      const curl = Math.sin(t * 2.8 + phase) * width;
      if (px < -height || px > w + height || py < -height || py > h + height) continue;
      for (let layer = 0; layer < 3; layer++) {
        const scale = 1 - layer * 0.24;
        context.globalAlpha = fade * (layer === 0 ? 0.3 : 0.42);
        context.fillStyle = ["#116b32", "#36b448", "#b9eb82"][layer];
        context.beginPath();
        context.moveTo(px - width * scale, py);
        context.bezierCurveTo(
          px - width * 2,
          py - height * 0.32,
          px + curl,
          py - height * 0.62,
          px + curl * 2,
          py - height * scale,
        );
        context.bezierCurveTo(
          px + width * 2,
          py - height * 0.43,
          px + width * scale,
          py - height * 0.35,
          px + width * scale,
          py,
        );
        context.closePath();
        context.fill();
      }
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
  let atlasStarted = -1;
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
    if (loaded && atlasStarted < 0) atlasStarted = seconds;
    const atlasMix = loaded ? ease(atlasStarted, atlasStarted + 0.24, seconds) : 0;
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
        sprite(x, y, throat, throat * 0.48, angle + sway, seconds * 16, pressure * atlasMix * 0.85);
        const packets = coarse ? 4 : 6;
        for (let i = 0; i < packets; i++) {
          const k = i * 6;
          const age =
            (seconds * (0.5 + SEEDS[k + 3] * 0.14) + i / packets + SEEDS[k + 4] * 0.12) % 1;
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
            pressure * atlasMix * Math.sin(age * Math.PI) * 0.52,
          );
        }
        // The white-green core occupies only the short mouth nozzle.
        context.globalCompositeOperation = "lighter";
        sprite(
          x,
          y,
          throat * 0.22,
          throat * 0.1,
          angle + sway,
          seconds * 16 + 11,
          pressure * atlasMix * 0.24,
        );
      }
      if (atlasMix < 1) {
        // Six tapered, pressure-driven ribbons replace an unavailable atlas.
        for (let ribbon = 0; ribbon < 6; ribbon++) {
          context.save();
          context.translate(x, y);
          context.rotate(angle);
          context.globalAlpha = pressure * (1 - atlasMix) * (0.33 - ribbon * 0.035);
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
    const count = coarse ? 52 : 84;
    const ash = ease(4.2, 6.5, seconds);
    context.globalCompositeOperation = "source-over";
    for (let i = 0; i < count; i++) {
      const k = i * 6;
      const life = (((seconds * (0.16 + SEEDS[k] * 0.2) + SEEDS[k + 1]) % 1) + 1) % 1;
      const spread = (SEEDS[k + 2] - 0.5) * life * Math.min(w, h) * 0.85;
      const distance = life * reach;
      const ignition = ease(2.8, 4.8, seconds);
      const jetX = x + Math.cos(angle) * distance - Math.sin(angle) * spread;
      const jetY =
        y + Math.sin(angle) * distance + Math.cos(angle) * spread - life * life * h * 0.2;
      const ashX = SEEDS[k + 2] * w + Math.sin(life * 8 + i) * 24;
      const ashY = (SEEDS[k + 3] * h + life * h * (ash > 0.6 ? 0.5 : -0.4) + h) % h;
      const px = jetX + (ashX - jetX) * ignition;
      const py = jetY + (ashY - jetY) * ignition;
      const opacity =
        Math.sin(life * Math.PI) * emberFade * ease(1.8, 3, seconds) * (0.36 + ash * 0.12);
      if (opacity < 0.004 || px < -12 || px > w + 12 || py < -12 || py > h + 12) continue;
      context.globalAlpha = opacity;
      const size = 0.7 + SEEDS[k + 4] * (ash > 0.6 ? 1.3 : 2);
      context.fillStyle = ash > 0.6 ? "#819186" : "#a7e879";
      context.save();
      context.translate(px, py);
      context.rotate(ash > 0.6 ? seconds * (SEEDS[k + 5] - 0.5) * 3 + i : angle - life * 0.5);
      if (ash > 0.6) {
        context.beginPath();
        context.moveTo(-size, 0);
        context.lineTo(size * 0.25, -size * 0.6);
        context.lineTo(size, size * 0.3);
        context.lineTo(-size * 0.4, size);
        context.closePath();
        context.fill();
      } else {
        context.fillRect(-size * 2.6, -size * 0.35, size * 3.4, size * 0.7);
        context.globalAlpha *= 0.22;
        context.fillRect(-size * 6, -size * 0.55, size * 6, size * 1.1);
      }
      context.restore();
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
