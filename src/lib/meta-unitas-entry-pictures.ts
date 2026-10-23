/** META UNITAS SAGA — ミドル's decoded pictures, shared by the entry sequence
 * (one decode per session; the gate warms them before the call starts). */
import { META_UNITAS_MIDDLE_PICTURES, loadPictures } from "./meta-unitas-partition.ts";

type MiddlePictures = Record<keyof typeof META_UNITAS_MIDDLE_PICTURES, HTMLImageElement>;
let decoded: Promise<MiddlePictures | null> | null = null;

export function metaUnitasPictures(): Promise<MiddlePictures | null> {
  if (!decoded)
    decoded = loadPictures(META_UNITAS_MIDDLE_PICTURES).then(
      (pictures) => pictures,
      () => {
        decoded = null;
        return null;
      },
    );
  return decoded;
}

export const warmMetaUnitasPictures = () => metaUnitasPictures().then(Boolean);
