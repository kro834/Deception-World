/* FAR FROM SAGA — nanite entry transition (scaffold, 2026-10-22).

   準備中. Mounted at the top of /far-from-saga; renders nothing and schedules
   nothing, so it can never delay or block the page. It exists so the entry
   animation has a home and a contract before it has a body.

   TODO(port) — model on the Rexonance entry:
   - src/components/rexonance-saga/rexonance-call-sequence.tsx: the cover →
     reveal phases (`mode: "entry"`), the call beats and the suit pieces'
     cascade; its props (`phase`, `onRevealed`) are the shape to keep.
   - src/components/rexonance-saga/rexonance-suit-nanites.tsx: the nanite
     motes that gather into the suit (the material landing).
   - src/lib/rexonance-calls.ts: REXONANCE_ENTRY_CALLS / REXONANCE_CALL_BEATS /
     REXONANCE_ENTRY_TIMINGS — FAR FROM's own calls live in
     FAR_FROM_SAGA.calls (final-stage-data.ts) and must stay verbatim.

   Rules for the port:
   - Respect prefers-reduced-motion: with it set, skip straight to `revealed`.
   - Never gate the first paint: the hero must be in the DOM and readable
     before, during and after the transition (overlay, not a wall).
   - No canvas / WebGL engine on this page; CSS transforms and opacity only,
     capped to one requestAnimationFrame loop while visible. */

export type FarFromEntryPhase = "idle" | "covering" | "revealing" | "revealed";

export type FarFromEntryTransitionProps = {
  /** The stage the hero shows; the port tints the motes by its accent. */
  stage?: "middle" | "high" | "xhigh" | "max" | "ultra";
  /** Called once when the reveal has finished (or immediately, when skipped). */
  onRevealed?: () => void;
};

/** Pending: renders nothing. */
export function FarFromEntryTransition(_props: FarFromEntryTransitionProps) {
  return null;
}
