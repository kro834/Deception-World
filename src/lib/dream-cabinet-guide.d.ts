import type { DreamReaderBookmark, DreamReaderCase } from "./dream-reader-state.js";

export interface DreamCabinetBookmark {
  bookmark: DreamReaderBookmark | null;
  available: boolean;
}
export function describeDreamCabinetChapter(
  chapter: DreamReaderCase,
  records: readonly { case: string }[],
): { paragraphs: number; characters: number; events: number };
export function readDreamCabinetBookmark(
  cases: readonly DreamReaderCase[],
  environment?: typeof window,
): DreamCabinetBookmark;
export function watchDreamCabinetBookmark(
  root: HTMLElement | null,
  cases: readonly DreamReaderCase[],
  onChange: (snapshot: DreamCabinetBookmark) => void,
  environment?: typeof window,
): () => void;
