/** FAR FROM SAGA — scroll suit-up runway hook (scaffold, 2026-10-22).
 *
 * 準備中. This module is the typed seam the /far-from-saga `#suitup` section
 * mounts today; it does nothing yet. The real runway is to be ported from the
 * Rexonance site, whose pieces are:
 *
 * - src/lib/rexonance-resonance.js — `mountRexonanceAssembly(host, beats)`:
 *   the scroll-driven assembly (one requestAnimationFrame loop while the
 *   runway is in view, nanite motes gathering into the suit, the reactor
 *   formation), gated by prefers-reduced-motion and the page's motion flag.
 * - src/lib/rexonance-assembly-nanites.js — the nanite swarm's geometry,
 *   motion and material landing for that assembly.
 * - src/components/rexonance-saga/rexonance-saga.tsx — the `.rzn-suitup`
 *   runway markup (`runwayRef`, `SUIT_UP` beats) that calls the mount.
 *
 * When ported, keep the contract below so the section needs no change: the
 * host is the runway element, `beats` are scroll-fraction keyframes, and the
 * returned function tears everything down. Until then the section is a
 * static, lightweight placeholder: no canvas, no WebGL, no per-frame work.
 */

export type FarFromAssemblyBeat = {
  /** 0–1 along the runway's scroll. */
  at: number;
  /** What settles at this beat (e.g. "bits", "undersuit", "crystal"). */
  part: string;
};

export type FarFromAssemblyOptions = {
  beats?: readonly FarFromAssemblyBeat[];
  /** Observe the viewer's prefers-reduced-motion (the port must honour it). */
  reducedMotion?: boolean;
};

/** TODO(port): the five-stage suit-up's beats — ミドル's black-silver and gold,
 * the 水色 crystal, then the bits' ring. Empty until the choreography exists. */
export const FAR_FROM_ASSEMBLY_BEATS: readonly FarFromAssemblyBeat[] = [];

/**
 * Mounts the suit-up runway on `host`. Currently a no-op that marks the host
 * as pending (`data-ffs-assembly="pending"`) and returns a disposer that
 * clears the mark. Safe to call with a null host.
 */
export function mountFarFromAssembly(
  host: HTMLElement | null | undefined,
  _opts: FarFromAssemblyOptions = {},
): () => void {
  if (!host) return () => {};
  host.dataset.ffsAssembly = "pending";
  return () => {
    delete host.dataset.ffsAssembly;
  };
}
