export const NANITE_SURFACE_SOURCES: Readonly<Record<string, string>>;
export function refinedNaniteKit<
  T extends { cells?: { src: string }; cellsB?: { src: string } } | null,
>(kit: T): T;

export function refinedNaniteSource(source: string): string;
