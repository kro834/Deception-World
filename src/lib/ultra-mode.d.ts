export interface UltraModeSnapshot {
  readonly enabled: boolean;
  /** False for reduced motion/transparency, forced colors, or increased contrast. */
  readonly motionAllowed: boolean;
  readonly ready: boolean;
  readonly storageAvailable: boolean;
}
export const ULTRA_MODE_STORAGE_KEY: string;
export const ULTRA_MODE_BOOTSTRAP_SCRIPT: string;
export function getUltraModeSnapshot(): UltraModeSnapshot;
export function getUltraModeServerSnapshot(): UltraModeSnapshot;
export function subscribeUltraMode(notify: () => void): () => void;
export function setUltraMode(enabled: boolean): void;
export function watchUltraMode(): () => void;
