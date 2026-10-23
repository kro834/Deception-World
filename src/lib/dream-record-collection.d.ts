export const DREAM_RECORD_COLLECTION_KEY: string;
export type DreamRecordCollectionState = { ids: number[]; available: boolean };
export function validateDreamRecordCollection(
  value: unknown,
  canonicalIds: readonly number[],
): number[];
export function dreamRecordCollectionFocus(ids: readonly number[], removed: number): number | null;
export function createDreamRecordCollection(
  canonicalIds: readonly number[],
  environment?: { readonly localStorage?: Pick<Storage, "getItem" | "setItem"> },
): {
  snapshot(): DreamRecordCollectionState;
  refresh(): DreamRecordCollectionState;
  setSaved(id: number, saved: boolean): DreamRecordCollectionState;
};
export function watchDreamRecordCollection(
  collection: ReturnType<typeof createDreamRecordCollection>,
  onChange: (state: DreamRecordCollectionState) => void,
  environment?: Pick<Window, "addEventListener" | "removeEventListener">,
): () => void;
