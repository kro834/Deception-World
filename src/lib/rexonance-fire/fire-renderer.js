// A reusable WebGL fire renderer for any caller-supplied context: one body
// field texture, one noise texture, one full-rect quad for the flame and a
// small quad batch for the burst fragments. The state is a plain object and
// every draw is a top-level function with scalar arguments, so a frame
// allocates nothing and the drawing call graph can be audited.
import { FIELD_H, FIELD_W, FIRE_RECT, BODY_ASPECT } from "./fire-field.js";
import { NOISE_SIZE } from "./fire-noise.js";
import {
  FRAGMENT_STRIDE,
  POSE_BURST,
  POSE_COVER,
  POSE_DETAIL,
  POSE_EDGE,
  POSE_FLASH,
  POSE_FLICKER,
  POSE_FLOW_A,
  POSE_FLOW_B,
  POSE_FLOW_S,
  POSE_LOCAL,
  POSE_MIX,
  POSE_PATCH,
  POSE_REACH,
  POSE_RING_RADIUS,
  POSE_RING_STRENGTH,
  POSE_STRENGTH,
  POSE_TEAR_GLOW,
  POSE_TEAR_OPEN,
  POSE_TONE,
  POSE_VIEW_X0,
  POSE_VIEW_X1,
  POSE_VIEW_Y0,
  POSE_VIEW_Y1,
  POSE_WARP,
} from "./fire-pose.js";
import { FIRE_FRAGMENT, FIRE_VERTEX, SPARK_FRAGMENT, SPARK_VERTEX } from "./fire-shaders.js";
import { FIRE_TUNING } from "./fire-tuning.js";
import { NANITE_FIRE_FRAGMENTS } from "../rexonance-ignition.js";

const SPARK_FLOATS = 8;
const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const SPARK_INDEX = new Uint16Array(NANITE_FIRE_FRAGMENTS * 6);
for (let i = 0; i < NANITE_FIRE_FRAGMENTS; i += 1) {
  const v = i * 4;
  SPARK_INDEX.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
}
const CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}
function link(gl, vertex, fragment) {
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  const program = vs && fs ? gl.createProgram() : null;
  if (program) {
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
  }
  if (vs) gl.deleteShader(vs);
  if (fs) gl.deleteShader(fs);
  if (!program) return null;
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}
function texture(gl, wrap) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

/**
 * Compiles both programs and allocates the buffers and textures on `gl`.
 * Returns null when the context cannot run them (the caller then falls
 * back). Upload the body field and the noise table before drawing.
 */
export function createFireRenderer(gl) {
  if (!gl || typeof gl.createShader !== "function") return null;
  const fire = link(gl, FIRE_VERTEX, FIRE_FRAGMENT);
  const spark = link(gl, SPARK_VERTEX, SPARK_FRAGMENT);
  if (!fire || !spark) {
    if (fire) gl.deleteProgram(fire);
    if (spark) gl.deleteProgram(spark);
    return null;
  }
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
  const sparkData = new Float32Array(NANITE_FIRE_FRAGMENTS * 4 * SPARK_FLOATS);
  const sparks = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, sparks);
  gl.bufferData(gl.ARRAY_BUFFER, sparkData, gl.DYNAMIC_DRAW);
  const sparkIndex = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sparkIndex);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, SPARK_INDEX, gl.STATIC_DRAW);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  return {
    gl,
    fire,
    spark,
    quad,
    sparks,
    sparkIndex,
    sparkData,
    field: texture(gl, gl.CLAMP_TO_EDGE),
    noise: texture(gl, gl.REPEAT),
    fieldReady: false,
    noiseReady: false,
    aPos: gl.getAttribLocation(fire, "aPos"),
    uField: gl.getUniformLocation(fire, "uField"),
    uNoise: gl.getUniformLocation(fire, "uNoise"),
    uRect: gl.getUniformLocation(fire, "uRect"),
    uLife: gl.getUniformLocation(fire, "uLife"),
    uClock: gl.getUniformLocation(fire, "uClock"),
    uRing: gl.getUniformLocation(fire, "uRing"),
    uView: gl.getUniformLocation(fire, "uView"),
    uFlow: gl.getUniformLocation(fire, "uFlow"),
    uDrift: gl.getUniformLocation(fire, "uDrift"),
    uTone: gl.getUniformLocation(fire, "uTone"),
    aCentre: gl.getAttribLocation(spark, "aCentre"),
    aCorner: gl.getAttribLocation(spark, "aCorner"),
    aData: gl.getAttribLocation(spark, "aData"),
    uSparkRect: gl.getUniformLocation(spark, "uRect"),
    uSpark: gl.getUniformLocation(spark, "uSpark"),
    uSparkTone: gl.getUniformLocation(spark, "uSparkTone"),
  };
}

/** Uploads the packed body field (RGBA bytes, FIELD_W × FIELD_H). */
export function uploadFireField(state, bytes) {
  const gl = state.gl;
  gl.bindTexture(gl.TEXTURE_2D, state.field);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, FIELD_W, FIELD_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  state.fieldReady = true;
}

/** Uploads the tileable noise table (RGBA bytes, NOISE_SIZE square). */
export function uploadFireNoise(state, bytes) {
  const gl = state.gl;
  gl.bindTexture(gl.TEXTURE_2D, state.noise);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    NOISE_SIZE,
    NOISE_SIZE,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    bytes,
  );
  state.noiseReady = true;
}

/** True once both textures are resident and the context is alive. */
export function fireRendererReady(state) {
  return Boolean(state && state.fieldReady && state.noiseReady && !state.gl.isContextLost());
}

/**
 * Draws one layer of the body fire (0 back: plumes, flash and ring plus a
 * share of the suit's skin; 1 front: the rest of the skin and the rim) into
 * the viewport (x, y, w, h) of the current framebuffer, overwriting it with
 * premultiplied emission + absorption. The caller clears first.
 */
export function drawFireLayer(state, pose, layer, x, y, w, h) {
  const gl = state.gl;
  gl.useProgram(state.fire);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.SCISSOR_TEST);
  gl.viewport(x, y, w, h);
  gl.scissor(x, y, w, h);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.field);
  gl.uniform1i(state.uField, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, state.noise);
  gl.uniform1i(state.uNoise, 1);
  gl.uniform4f(
    state.uRect,
    FIRE_RECT.x,
    FIRE_RECT.y * BODY_ASPECT,
    FIRE_RECT.width,
    FIRE_RECT.height * BODY_ASPECT,
  );
  gl.uniform4f(state.uLife, pose[POSE_COVER], pose[POSE_MIX], pose[POSE_BURST], pose[POSE_FLASH]);
  gl.uniform4f(state.uClock, pose[POSE_FLICKER], pose[POSE_STRENGTH], layer, pose[POSE_DETAIL]);
  gl.uniform4f(
    state.uRing,
    pose[POSE_RING_RADIUS],
    pose[POSE_RING_STRENGTH],
    pose[POSE_TEAR_OPEN],
    pose[POSE_TEAR_GLOW],
  );
  gl.uniform4f(
    state.uView,
    pose[POSE_VIEW_X0],
    pose[POSE_VIEW_Y0],
    pose[POSE_VIEW_X1],
    pose[POSE_VIEW_Y1],
  );
  gl.uniform4f(
    state.uFlow,
    pose[POSE_FLOW_A],
    pose[POSE_FLOW_B],
    pose[POSE_WARP],
    pose[POSE_REACH],
  );
  gl.uniform4f(
    state.uDrift,
    pose[POSE_EDGE],
    pose[POSE_LOCAL],
    pose[POSE_PATCH],
    pose[POSE_FLOW_S],
  );
  gl.uniform2f(state.uTone, pose[POSE_TONE], 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.quad);
  gl.enableVertexAttribArray(state.aPos);
  gl.vertexAttribPointer(state.aPos, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/**
 * Adds the burst fragments (fire-pose.js layout, `count` of them) to the
 * viewport, additively over whatever the framebuffer holds there.
 */
export function drawFireSparks(state, pose, fragments, count, x, y, w, h) {
  const gl = state.gl;
  const data = state.sparkData;
  let quads = 0;
  for (let i = 0; i < count; i += 1) {
    const k = i * FRAGMENT_STRIDE;
    const heat = fragments[k + 2];
    if (heat <= 0) continue;
    const base = quads * 4 * SPARK_FLOATS;
    for (let c = 0; c < 4; c += 1) {
      const at = base + c * SPARK_FLOATS;
      data[at] = fragments[k];
      data[at + 1] = fragments[k + 1];
      data[at + 2] = CORNERS[c * 2];
      data[at + 3] = CORNERS[c * 2 + 1];
      data[at + 4] = heat;
      data[at + 5] = fragments[k + 3];
      data[at + 6] = fragments[k + 4];
      data[at + 7] = fragments[k + 5];
    }
    quads += 1;
  }
  if (!quads) return;
  gl.useProgram(state.spark);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.enable(gl.SCISSOR_TEST);
  gl.viewport(x, y, w, h);
  gl.scissor(x, y, w, h);
  gl.uniform4f(
    state.uSparkRect,
    FIRE_RECT.x,
    FIRE_RECT.y * BODY_ASPECT,
    FIRE_RECT.width,
    FIRE_RECT.height * BODY_ASPECT,
  );
  gl.uniform2f(
    state.uSpark,
    pose[POSE_STRENGTH] * sparkEmerge(pose[POSE_BURST]),
    sparkStretch(pose[POSE_BURST]),
  );
  gl.uniform2f(state.uSparkTone, pose[POSE_TONE], 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.sparks);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  gl.enableVertexAttribArray(state.aCentre);
  gl.vertexAttribPointer(state.aCentre, 2, gl.FLOAT, false, SPARK_FLOATS * 4, 0);
  gl.enableVertexAttribArray(state.aCorner);
  gl.vertexAttribPointer(state.aCorner, 2, gl.FLOAT, false, SPARK_FLOATS * 4, 8);
  gl.enableVertexAttribArray(state.aData);
  gl.vertexAttribPointer(state.aData, 4, gl.FLOAT, false, SPARK_FLOATS * 4, 16);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.sparkIndex);
  gl.drawElements(gl.TRIANGLES, quads * 6, gl.UNSIGNED_SHORT, 0);
  gl.disable(gl.BLEND);
}

/** Streak length per unit speed at a burst progress: a fragment's streak
 * grows with its flight, from a point at the detonation. */
export function sparkStretch(burst) {
  const t = Math.max(0, Math.min(1, burst / FIRE_TUNING.sparkGrow));
  return FIRE_TUNING.sparkStretch * t * t * (3 - 2 * t);
}

/** How far a fragment has come out of its tear at a burst progress: at
 * the detonation's first instant they are still inside the incandescent
 * tears (so no line of separate dots stands on the body), and they show
 * as they fly clear of them. */
export function sparkEmerge(burst) {
  const t = Math.max(
    0,
    Math.min(
      1,
      (burst - FIRE_TUNING.sparkEmergeFrom) /
        (FIRE_TUNING.sparkEmergeTo - FIRE_TUNING.sparkEmergeFrom),
    ),
  );
  return t * t * (3 - 2 * t);
}

/** Frees every GPU object this renderer created. */
export function releaseFireRenderer(state) {
  if (!state) return;
  const gl = state.gl;
  gl.deleteProgram(state.fire);
  gl.deleteProgram(state.spark);
  gl.deleteBuffer(state.quad);
  gl.deleteBuffer(state.sparks);
  gl.deleteBuffer(state.sparkIndex);
  gl.deleteTexture(state.field);
  gl.deleteTexture(state.noise);
  state.fieldReady = false;
  state.noiseReady = false;
}
