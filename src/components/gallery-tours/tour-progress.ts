import { GALLERY_TOURS, getGalleryTour } from "./tour-data.ts";

export const TOUR_PROGRESS_KEY = "deception-world.gallery-tour-progress.v1";
export type TourProgress = Readonly<Record<string, { workId: string; updatedAt: number }>>;

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "getItem" | "setItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseProgress(raw: string | null): TourProgress {
  // Five short progress records need far less space; reject unexpectedly large payloads.
  if (!raw || raw.length > 16_384) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isRecord(value)) return {};

  const progress: Record<string, { workId: string; updatedAt: number }> = {};
  for (const tour of GALLERY_TOURS) {
    if (!Object.hasOwn(value, tour.id)) continue;
    const entry = value[tour.id];
    if (
      !isRecord(entry) ||
      typeof entry.workId !== "string" ||
      !isTimestamp(entry.updatedAt) ||
      !tour.stops.some((stop) => stop.artworkId === entry.workId)
    ) {
      continue;
    }
    progress[tour.id] = { workId: entry.workId, updatedAt: entry.updatedAt };
  }
  return progress;
}

export function readTourProgress(storage: ReadStorage): TourProgress {
  try {
    return parseProgress(storage.getItem(TOUR_PROGRESS_KEY));
  } catch {
    return {};
  }
}

export function saveTourProgress(
  storage: WriteStorage,
  tourId: string,
  workId: string,
  now = Date.now(),
): TourProgress {
  const tour = getGalleryTour(tourId);
  if (!tour || !tour.stops.some((stop) => stop.artworkId === workId) || !isTimestamp(now)) {
    throw new RangeError("The tour, artwork, or progress timestamp is invalid.");
  }
  // Read at mutation time so progress written by another tab is retained. An unavailable
  // read must throw here, rather than replacing other saved tours with an empty record.
  const progress = {
    ...parseProgress(storage.getItem(TOUR_PROGRESS_KEY)),
    [tourId]: { workId, updatedAt: now },
  };
  storage.setItem(TOUR_PROGRESS_KEY, JSON.stringify(progress));
  return progress;
}

export function clearTourProgress(storage: WriteStorage, tourId: string): TourProgress {
  if (!getGalleryTour(tourId)) throw new RangeError("The tour is invalid.");
  const progress = { ...parseProgress(storage.getItem(TOUR_PROGRESS_KEY)) };
  delete progress[tourId];
  storage.setItem(TOUR_PROGRESS_KEY, JSON.stringify(progress));
  return progress;
}
