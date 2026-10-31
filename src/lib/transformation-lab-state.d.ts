export type LabRider = "rexonance" | "far-from" | "illusionculum" | "meta-unitas";
export type LabZoom = "full" | "head" | "reactor" | "legs";
export interface LabState {
  rider: LabRider;
  form: string;
  compareForm: string;
  loop: boolean;
  compare: LabRider | "";
  progress: number;
  zoom: LabZoom;
  speed: number;
}
export const LAB_RIDERS: LabRider[];
export const LAB_ZOOMS: LabZoom[];
export const LAB_BEATS: { label: string; at: number }[];
export function clampProgress(value: unknown): number;
export function parseLabState(search: string): LabState;
export function labSearch(state: LabState): string;
export function advanceLab(
  progress: number,
  milliseconds: number,
  speed: number,
  direction: number,
): number;

export const LAB_NAMES: Record<LabRider, string>;

export const LAB_FORMS: Record<LabRider, [string, string][]>;
export function validLabForm(rider: LabRider, form: string): string;
