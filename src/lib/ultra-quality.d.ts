export type UltraQuality = "high" | "cinema";
export interface UltraQualitySnapshot {
  readonly quality: UltraQuality;
  readonly ready: boolean;
  readonly storageAvailable: boolean;
}
export const ULTRA_QUALITY_STORAGE_KEY: string;
export function getUltraQualitySnapshot(): UltraQualitySnapshot;
export function getUltraQualityServerSnapshot(): UltraQualitySnapshot;
export function subscribeUltraQuality(notify: () => void): () => void;
export function setUltraQuality(value: UltraQuality): void;
