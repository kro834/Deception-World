/**
 * Select a CSS-only decorative renderer without changing gesture behavior.
 * Core count / RAM alone are not a reliable proxy for an Android GPU budget.
 * @param {{userAgent?: string, deviceMemory?: number, hardwareConcurrency?: number,
 * connection?: {saveData?: boolean, effectiveType?: string}}} device
 */
export function prefersLightweightRendering(device) {
  return (
    /Android/i.test(device.userAgent || "") ||
    device.connection?.saveData === true ||
    ["slow-2g", "2g"].includes(device.connection?.effectiveType || "") ||
    (device.deviceMemory !== undefined && device.deviceMemory <= 2) ||
    ((device.hardwareConcurrency || 0) > 0 && device.hardwareConcurrency <= 2)
  );
}
