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
 * Samsung Internet, read from its own UA token (the reduced UA's model is
 * always "K", so no device model is involved). Desktop-site mode, DeX and
 * tablets send "X11; Linux x86_64" instead of "Android"; a touch screen tells
 * them apart from desktop Linux. `engine` is the Chromium major it ships.
 * @param {{userAgent?: string, maxTouchPoints?: number}} device
 * @returns {{major: number, engine: number, windows: boolean, desktopMode: boolean} | null}
 */
export function samsungInternet(device) {
  const ua = device.userAgent || "";
  const si = ua.match(/SamsungBrowser\/(\d+)/);
  if (!si) return null;
  return {
    major: Number(si[1]),
    engine: Number(ua.match(/Chrome\/(\d+)/)?.[1] || 0),
    windows: /Windows NT/.test(ua),
    desktopMode: /X11; Linux x86_64/.test(ua) && (device.maxTouchPoints || 0) > 0,
  };
}

/** Android's renderer: an Android UA, or Samsung Internet in desktop-site mode or DeX.
 * @param {{userAgent?: string, maxTouchPoints?: number}} device
 */
export function isAndroidRenderer(device) {
  return /Android/i.test(device.userAgent || "") || Boolean(samsungInternet(device)?.desktopMode);
}

/** Samsung Internet on a Galaxy (One UI), not Samsung Internet for Windows. A
 * diagnostics hook (html[data-one-ui-renderer]); no style depends on it.
 * @param {{userAgent?: string, maxTouchPoints?: number}} device
 */
export function isOneUiRenderer(device) {
  const si = samsungInternet(device);
  return Boolean(si && !si.windows);
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
    (isAndroidRenderer(device) &&
      (device.hardwareConcurrency || 0) > 0 &&
      device.hardwareConcurrency <= 4) ||
    device.connection?.saveData === true ||
    ["slow-2g", "2g"].includes(device.connection?.effectiveType || "") ||
    (device.deviceMemory !== undefined && device.deviceMemory <= 2) ||
    ((device.hardwareConcurrency || 0) > 0 && device.hardwareConcurrency <= 2)
  );
}

/**
 * Resource hints that point at a constrained device or connection: Save-Data,
 * a 2G connection, at most 2 GB of memory or at most 2 logical cores. Read
 * by capability only, never by device model or platform.
 * @param {{deviceMemory?: number, hardwareConcurrency?: number,
 * connection?: {saveData?: boolean, effectiveType?: string}}} device
 */
export function hasConstrainedResources(device) {
  return (
    device.connection?.saveData === true ||
    ["slow-2g", "2g"].includes(device.connection?.effectiveType || "") ||
    (device.deviceMemory !== undefined && device.deviceMemory <= 2) ||
    ((device.hardwareConcurrency || 0) > 0 && device.hardwareConcurrency <= 2)
  );
}

/**
 * Reading progress drawn by the compositor (scroll(root block)) instead of a
 * per-frame --page-progress write: every Android renderer (economy included),
 * and iOS/iPadOS 27 outside economy where view timelines exist; always with
 * scroll timelines and motion allowed.
 * @param {{userAgent?: string, maxTouchPoints?: number, deviceMemory?: number, hardwareConcurrency?: number,
 * connection?: {saveData?: boolean, effectiveType?: string}}} device
 * @param {{scrollTimeline: boolean, viewTimeline: boolean, reducedMotion: boolean}} environment
 */
export function prefersNativeScrollProgress(device, environment) {
  if (!environment.scrollTimeline || environment.reducedMotion) return false;
  if (isAndroidRenderer(device)) return true;
  return (
    supportsIOS27Enhancements(device) &&
    environment.viewTimeline &&
    !prefersLightweightRendering(device)
  );
}
