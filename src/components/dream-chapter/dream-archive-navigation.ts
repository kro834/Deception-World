import type { DreamArsenalGroup, DreamChronicleEvent } from "./dream-chapter-extra-data";

/** Link a stage only to chapters that name that stage exactly. */
export function atlasChronicleCases(records: readonly DreamChronicleEvent[], place: string) {
  return [...new Set(records.filter((event) => event.place === place).map((event) => event.case))];
}

/** Use explicit source ownership, never a loose name or quote-text match. */
export function relatedArsenalGroups(
  groups: readonly DreamArsenalGroup[],
  names: readonly string[],
) {
  return groups.flatMap((group, index) =>
    names.some(
      (name) =>
        group.group === name ||
        (name === "シエル" && group.group === "シエル / 仮面ライダーサーガ") ||
        group.entries.some((entry) => entry.owner === name),
    )
      ? [{ group: group.group, index: index + 1 }]
      : [],
  );
}
