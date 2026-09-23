/** Safari 26+ freezes the OS token to 18.x. Prefer its browser version on
 * Apple touch devices; never classify a desktop Mac as an iPad by UA alone.
 * @param {{userAgent?: string, maxTouchPoints?: number}} device
 */
function appleRenderingMajor(device) {
  const ua = device.userAgent || "";
  const mobile = /iPhone|iPad|iPod/.test(ua);
  if (!mobile && !(/Macintosh/.test(ua) && (device.maxTouchPoints || 0) > 1)) return undefined;
  const safari = ua.match(/Version\/(\d+)(?:\.|\s|$)/);
  if (safari) return Number(safari[1]);
  // Other iOS browsers may report the real OS, without Safari's Version token.
  const os = mobile ? ua.match(/OS (\d+)(?:_|\s|;|$)/) : null;
  return os ? Number(os[1]) : undefined;
}

/** @param {{userAgent?: string, maxTouchPoints?: number}} device */
export function prefersIOS18Rendering(device) {
  return appleRenderingMajor(device) === 18;
}

/** Opt in only known iOS/iPadOS 27 clients; capabilities are checked separately.
 * @param {{userAgent?: string, maxTouchPoints?: number}} device
 */
export function supportsIOS27Enhancements(device) {
  return appleRenderingMajor(device) === 27;
}

/**
 * Select a CSS-only decorative renderer without changing gesture behavior.
 * Chosen by capability hints, never by device model: capable Android keeps full
 * motion; Android reporting 4 cores or fewer is treated as a weak budget.
 * @param {{userAgent?: string, maxTouchPoints?: number, deviceMemory?: number, hardwareConcurrency?: number,
 * connection?: {saveData?: boolean, effectiveType?: string}}} device
 */
export function prefersLightweightRendering(device) {
  return (
    prefersIOS18Rendering(device) ||
    (/Android/i.test(device.userAgent || "") &&
      (device.hardwareConcurrency || 0) > 0 &&
      device.hardwareConcurrency <= 4) ||
    device.connection?.saveData === true ||
    ["slow-2g", "2g"].includes(device.connection?.effectiveType || "") ||
    (device.deviceMemory !== undefined && device.deviceMemory <= 2) ||
    ((device.hardwareConcurrency || 0) > 0 && device.hardwareConcurrency <= 2)
  );
}
