export type LabRider = "rexonance" | "far-from" | "illusionculum" | "meta-unitas";
export type AssemblyRider = "rexonance" | "far-from";
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
export function assemblyComparisonSearch(
  rider: AssemblyRider,
  form?: string,
): { rider: AssemblyRider; form: string; compare: AssemblyRider; at: number };
export function parseLabState(search: string): LabState;
export function labSearch(state: LabState): string;
export function advanceLab(
  progress: number,
  milliseconds: number,
  speed: number,
  direction: number,
  rider?: LabRider,
  form?: string,
): number;

export const LAB_NAMES: Record<LabRider, string>;

export const LAB_FORMS: Record<LabRider, [string, string][]>;
export function validLabForm(rider: LabRider, form: string): string;
export interface LabUrlWriter {
  write(url: string | URL): void;
  flush(): void;
  cancel(): void;
}
export function createLabUrlWriter(
  history: Pick<History, "state" | "replaceState">,
  options?: {
    delay?: number;
    schedule?: (callback: () => void, delay: number) => unknown;
    cancel?: (timer: never) => void;
  },
): LabUrlWriter;
