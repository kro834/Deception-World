/** One navigation owns both the scene's clock and the cover's lifetime.
 * Owner (2026-10-24): 「他と同じく、事前にデータを読み込む方式にして」 — the
 * clock starts on the renderer's first frame, as Rexonance/Illusionculum;
 * the engine is warmed ahead (menu open, hover, idle) and joins the running
 * scene when ready. A slow download never cuts the scene short: completion
 * waits for the live engine (the cover is held), bounded by the watchdog.
 * A failed/stalled scene returns to the source page with a retry link;
 * only completion or an explicit skip may advance to the destination. */
export const META_UNITAS_ENTRY_DURATION_MS = 3090;
export {
  ENTRY_PREPARE_MS as META_UNITAS_ENTRY_PREPARE_MS,
  createEntryPlayback as createMetaUnitasEntryPlayback,
  type EntryResult as MetaUnitasEntryResult,
  type EntryPlayback as MetaUnitasEntryPlayback,
} from "./entry-playback.ts";
