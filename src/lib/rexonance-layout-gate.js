/** Snapshot before layout/fragment restoration, never midway through a visit.
 * The explicit economy choice stays aligned with the pre-paint page profile. */
export function syncRexonanceLayoutGate(environment = window) {
  const constrained = environment.document.documentElement.dataset.worldEffects === "economy";
  environment.document.documentElement.toggleAttribute("data-rzn-constrained", constrained);
}

export const REXONANCE_LAYOUT_BOOT_SCRIPT = `(${syncRexonanceLayoutGate.toString()})(window);`;
