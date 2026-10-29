/** Test-only reference look: `?look=reference&view=front|back|left|right` renders the creature
 * alone (no fire, backdrop or grade) on a white ground under even neutral light, from the
 * owner's four turnaround directions, for side-by-side judgement against the hi-res originals.
 * Nothing in the page UI changes; the viewer reads the flag once when it mounts. */
export type GuardianReferenceView = "front" | "back" | "left" | "right";
export type GuardianLook = { look: "reference"; view: GuardianReferenceView } | { look: "page" };

/** Camera directions (unit vectors toward the camera) for the four turnaround sheets. The
 * creature faces +Z; its left side is +X, so the 左側面 sheet is seen from +X. */
export const GUARDIAN_REFERENCE_DIRECTIONS: Record<GuardianReferenceView, [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [1, 0, 0],
  right: [-1, 0, 0],
};

export function parseGuardianLook(search: string): GuardianLook {
  const params = new URLSearchParams(search);
  if (params.get("look") !== "reference") return { look: "page" };
  const view = params.get("view");
  return {
    look: "reference",
    view:
      view === "back" || view === "left" || view === "right" || view === "front" ? view : "front",
  };
}
