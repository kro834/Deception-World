// Only URL membership belongs to the shared router. The full tour descriptions
// and artwork metadata stay with the lazily loaded gallery-tour component.
export const GALLERY_TOUR_WORK_IDS: Readonly<Record<string, readonly string[]>> = {
  starlight: ["g05", "g07", "g08", "g94", "g21", "g90", "g113"],
  "rain-motion": ["g25", "g50", "g53", "g54", "g55", "g36", "g79"],
  "quiet-portraits": ["g26", "g44", "g74", "g58", "g88", "g107", "g111"],
  boundaries: ["g45", "g16", "g49", "g46", "g60", "g70", "g112"],
  "design-lines": ["g81", "g80", "g83", "g84", "g85", "g86", "g89"],
};

export function normalizeTourSearch(input: Record<string, unknown>): {
  tour?: string;
  work?: string;
} {
  const tour = input.tour;
  if (typeof tour !== "string" || !Object.hasOwn(GALLERY_TOUR_WORK_IDS, tour)) return {};
  return typeof input.work === "string" && GALLERY_TOUR_WORK_IDS[tour].includes(input.work)
    ? { tour, work: input.work }
    : { tour };
}
