export interface DreamReaderBookmark {
  caseNo: string;
  paragraph: number;
}
export interface DreamReaderState {
  size: "standard" | "large";
  spacing: "standard" | "comfortable";
  bookmark: DreamReaderBookmark | null;
  available: boolean;
}
export interface DreamReaderCase {
  no: string;
  paragraphs: readonly string[];
}
export const DREAM_READER_STORAGE_KEY: string;
export const DREAM_READER_DEFAULTS: Omit<DreamReaderState, "available">;
export function mountDreamReadingVisibility(
  root: HTMLElement | null,
  environment?: typeof window,
): () => void;
export function parseDreamReaderHash(hash: string): DreamReaderBookmark | null;
export function validateDreamReaderState(
  value: unknown,
  cases: readonly DreamReaderCase[],
): Omit<DreamReaderState, "available">;
export function mountDreamReader(
  root: HTMLElement | null,
  cases: readonly DreamReaderCase[],
  onChange: (state: DreamReaderState) => void,
  environment?: typeof window,
): {
  setSize(size: DreamReaderState["size"]): void;
  setSpacing(spacing: DreamReaderState["spacing"]): void;
  clearBookmark(): void;
  dispose(): void;
};
