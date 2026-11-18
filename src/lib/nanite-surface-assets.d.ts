export const NANITE_FORGE_SHEETS: Readonly<
  Record<"rexonance" | "far-from" | "illusionculum", string>
>;
export const REXONANCE_CLASP_ATLAS: string;
export const NANITE_FORGE_DELIVERIES: readonly string[];
export const NANITE_SURFACE_SOURCES: Readonly<Record<string, string>>;
export function refinedNaniteKit<
  T extends { cells?: { src: string }; cellsB?: { src: string } } | null,
>(kit: T): T;

export function refinedNaniteSource(source: string): string;
