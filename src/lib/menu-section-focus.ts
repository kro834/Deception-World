/** Keep keyboard reading order after a menu's local-fragment navigation.
 * Pending focus belongs to one activation and yields to any later intent. */
export function focusMenuSectionAfterNavigation({
  pathname,
  id,
  navigate,
  watchNavigation,
  doc = document,
  win = window,
}: {
  pathname: string;
  id: string;
  navigate: () => Promise<unknown>;
  watchNavigation: (listener: (pathname: string, hash: string) => void) => () => void;
  doc?: Document;
  win?: Window;
}): () => void {
  let cancelled = false;
  let firstNavigation = true;
  let frame = 0;
  let attempts = 0;
  let clearTemporaryFocus: (() => void) | undefined;
  let stopNavigation = () => {};
  const stopPending = () => {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    for (const event of ["pointerdown", "keydown", "wheel"])
      doc.removeEventListener(event, cancel, true);
    win.removeEventListener("popstate", cancel);
    stopNavigation();
  };
  const cancel = () => {
    cancelled = true;
    stopPending();
    clearTemporaryFocus?.();
  };
  for (const event of ["pointerdown", "keydown", "wheel"])
    doc.addEventListener(event, cancel, true);
  win.addEventListener("popstate", cancel);
  stopNavigation = watchNavigation((nextPath, nextHash) => {
    if (firstNavigation && nextPath === pathname && nextHash.replace(/^#/, "") === id) {
      firstNavigation = false;
    } else cancel();
  });
  const focus = () => {
    frame = 0;
    let hash = "";
    try {
      hash = decodeURIComponent(win.location.hash.slice(1));
    } catch {
      return cancel();
    }
    if (cancelled || win.location.pathname !== pathname || hash !== id) return cancel();
    const target = doc.getElementById(id);
    if (!target?.isConnected) return cancel();
    // React releases the dialog's inert siblings and optional opener focus
    // in its close cleanup. Do not compete with that cleanup or scroll again.
    if (doc.documentElement.dataset.sideMenuOpen === "true" || target.closest("[inert]")) {
      if (++attempts < 12) frame = win.requestAnimationFrame(focus);
      else cancel();
      return;
    }
    stopPending();
    if (!target.matches("a[href],button,input,select,textarea,summary,[tabindex]")) {
      target.setAttribute("tabindex", "-1");
      target.setAttribute("data-route-focus", "true");
      const cleanup = () => {
        target.removeEventListener("blur", cleanup);
        target.removeAttribute("tabindex");
        target.removeAttribute("data-route-focus");
        clearTemporaryFocus = undefined;
      };
      clearTemporaryFocus = cleanup;
      target.addEventListener("blur", cleanup, { once: true });
    }
    target.focus({ preventScroll: true });
  };
  // Close has already been requested. Start the router after this click,
  // keeping synchronous failures and aborted navigations out of the UI.
  void Promise.resolve()
    .then(() => (cancelled ? undefined : navigate()))
    .then(() => {
      firstNavigation = false;
      if (!cancelled) frame = win.requestAnimationFrame(focus);
    }, cancel);
  return cancel;
}
