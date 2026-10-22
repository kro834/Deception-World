/* FAR FROM SAGA — the entry transformation's seam on the page (owner,
   2026-10-22: 「遷移画面にもレクソナンスと同じ様に変身アニメーションをつけ」).

   The transformation plays in the route transition screen, the way
   Rexonance's does (src/components/load-gate.tsx: the "far-from" dive
   through src/lib/far-from-entry-gate.ts, its renderer
   far-from-entry-sequence.tsx modelled on
   src/components/rexonance-saga/rexonance-call-sequence.tsx). An in-site
   navigation to /far-from-saga covers the departure page, plays the six
   beats under the cover while this page loads beneath, and reveals it on
   FAR FROM DEUS！; a direct load, a reload and Back/Forward show the page at
   once, with no call, as /rexonance-saga does. The gate owns the tiers
   too: prefers-reduced-motion and economy rest the call on the finished
   figure, and the skip (the button, Escape) shortens the cover.

   So this component renders nothing. It stays mounted at the top of the
   page as the entry's seam, so the transformation never plays twice: the
   page carries no overlay of its own, and nothing here delays first paint
   or waits on the load gate. */

export type FarFromEntryTransitionProps = {
  /** The stage the hero shows (the entry ends on ミドル regardless). */
  stage?: "middle" | "high" | "xhigh" | "max" | "ultra";
};

export function FarFromEntryTransition(_props: FarFromEntryTransitionProps) {
  return null;
}
