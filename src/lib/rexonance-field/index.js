/* RESONANCE FIELD (owner, 2026-10-21): one chunk for both scenes, imported
   lazily by the entry's engine and the scroll scene's module loader — never
   on the startup path, never by a still tier. */

export { fieldHash, fieldTake, fieldVisitSeed } from "./field-seed.js";
export {
  FIELD_FLASH_SHARE,
  FIELD_STATE,
  FIELD_WAKE_RISE,
  fieldScore,
  fieldState,
  fieldStateBuffer,
} from "./field-score.js";
export {
  FIELD_CAMERA,
  FIELD_IMPACT,
  drawFieldImpact,
  fieldCamera,
  fieldCameraBuffer,
  fieldCameraView,
  fieldPunch,
} from "./field-camera.js";
export {
  FIELD_BIRTH,
  FIELD_FIGURE_ASPECT,
  FIELD_SEEDS,
  FIELD_SHAPE,
  fieldFling,
  fieldFragment,
  fieldFragmentSeed,
  fieldPose,
  fieldSeeds,
} from "./field-pose.js";
export {
  FIELD_WAKE,
  FIELD_WAKE_BIRTHS,
  REXONANCE_SCROLL_FLAME,
  scrollFlameAt,
  scrollFlamePhase,
} from "./field-clock.js";
export {
  FIELD_FRAGMENT_SHADER,
  FIELD_GL,
  FIELD_TONES,
  FIELD_VERTEX_SHADER,
  createFieldLayer,
  fieldContext,
  fieldIndices,
  fieldVertexBytes,
} from "./field-gl.js";
