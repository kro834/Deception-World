/** iPad desktop mode hides its OS version, but exposes Safari's major version.
 * @param {{userAgent?: string, maxTouchPoints?: number}} device
 */
export function prefersIOS18Rendering(device) {
  const ua = device.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return /OS 18(?:[_\s;]|$)/.test(ua);
  return (
    /Macintosh/.test(ua) && (device.maxTouchPoints || 0) > 1 && /Version\/18(?:\.|\s)/.test(ua)
  );
}

/**
 * Select a CSS-only decorative renderer without changing gesture behavior.
 * Core count / RAM alone are not a reliable proxy for an Android GPU budget.
 * @param {{userAgent?: string, maxTouchPoints?: number, deviceMemory?: number, hardwareConcurrency?: number,
 * connection?: {saveData?: boolean, effectiveType?: string}}} device
 */
export function prefersLightweightRendering(device) {
  return (
    prefersIOS18Rendering(device) ||
    /Android/i.test(device.userAgent || "") ||
    device.connection?.saveData === true ||
    ["slow-2g", "2g"].includes(device.connection?.effectiveType || "") ||
    (device.deviceMemory !== undefined && device.deviceMemory <= 2) ||
    ((device.hardwareConcurrency || 0) > 0 && device.hardwareConcurrency <= 2)
  );
}
