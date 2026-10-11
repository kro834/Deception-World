/** Snapshot before layout/fragment restoration, never midway through a visit.
 * Network changes can stop motion immediately, but must not move the reader.
 * The next route entry picks up the new connection preference. */
export function syncRexonanceLayoutGate(environment = window) {
  const connection = environment.navigator?.connection;
  const constrained =
    Boolean(connection?.saveData) || /^(slow-)?2g$/.test(connection?.effectiveType || "");
  environment.document.documentElement.toggleAttribute("data-rzn-constrained", constrained);
}

export const REXONANCE_LAYOUT_BOOT_SCRIPT = `(${syncRexonanceLayoutGate.toString()})(window);`;
