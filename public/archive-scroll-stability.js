(() => {
  "use strict";

  if (document.documentElement.dataset.embeddedArchive !== "true") return;

  const rootSelector = '[id$="saga-forms-performance-v5"]';
  const lockProperties = ["overflow", "overflow-x", "overflow-y", "touch-action"];
  let observer;
  let recoveryFrame = 0;
  let closeFallback = 0;

  const archiveKind = document.documentElement.dataset.archiveKind;
  const isActiveArchiveRoot = (root) => {
    if (!(root instanceof HTMLElement)) return false;
    if (archiveKind === "realm") return root.id.startsWith("realm--");
    if (archiveKind === "saga") return !root.id.startsWith("realm--");
    return !root.closest("[hidden], [aria-hidden='true']");
  };
  const archiveRoots = () =>
    [...document.querySelectorAll(rootSelector)].filter(isActiveArchiveRoot);
  const notifyReady = () => {
    if (window.parent === window) return;
    window.parent.postMessage(
      {
        type: "saga-archive:ready",
        kind: document.documentElement.dataset.archiveKind,
      },
      "*",
    );
  };

  const selectorState = (root) => {
    const selector = root?.querySelector('[id$="form-selector"]');
    const scrim = root?.querySelector(".selector-sheet-scrim");
    const open = Boolean(
      root?.classList.contains("is-selector-sheet-open") &&
        selector?.getAttribute("aria-modal") === "true" &&
        scrim instanceof HTMLElement &&
        !scrim.hidden,
    );
    return { root, selector, scrim, open };
  };

  const selectorStates = () => archiveRoots().map(selectorState);

  const dialogIsOpen = () => Boolean(document.querySelector("dialog[open], .image-lightbox[open]"));

  const clearDocumentLock = () => {
    for (const property of lockProperties) {
      document.documentElement.style.removeProperty(property);
      document.body?.style.removeProperty(property);
    }
  };

  const clearStaleInert = (root) => {
    root?.querySelectorAll("[inert]").forEach((element) => {
      if (element instanceof HTMLElement) element.inert = false;
    });
  };

  const releaseStaleScrollLock = () => {
    const states = selectorStates();
    if (states.some(({ open }) => open) || dialogIsOpen()) return false;
    clearDocumentLock();
    states.forEach(({ root }) => {
      root?.classList.remove("is-selector-sheet-closing");
      clearStaleInert(root);
    });
    return true;
  };

  const forceResetTransientUi = () => {
    selectorStates().forEach(({ root, selector, scrim }) => {
      root?.classList.remove("is-selector-sheet-open", "is-selector-sheet-closing");
      selector?.removeAttribute("aria-modal");
      selector?.removeAttribute("role");
      if (scrim instanceof HTMLElement) scrim.hidden = true;
      root
        ?.querySelector(".mobile-dock .dock-current")
        ?.setAttribute("aria-expanded", "false");
      clearStaleInert(root);
    });
    document.querySelectorAll("dialog[open]").forEach((dialog) => {
      if (dialog instanceof HTMLDialogElement) dialog.close("archive-reset");
    });
    clearDocumentLock();
  };

  const scheduleRecovery = () => {
    window.cancelAnimationFrame(recoveryFrame);
    recoveryFrame = window.requestAnimationFrame(() => {
      recoveryFrame = 0;
      releaseStaleScrollLock();
    });
  };

  const armClosingFallback = () => {
    if (!archiveRoots().some((root) => root.classList.contains("is-selector-sheet-closing"))) return;
    window.clearTimeout(closeFallback);
    closeFallback = window.setTimeout(() => {
      closeFallback = 0;
      if (archiveRoots().some((root) => root.classList.contains("is-selector-sheet-closing"))) {
        forceResetTransientUi();
      }
    }, 420);
  };

  const observeArchiveState = () => {
    observer?.disconnect();
    observer = new MutationObserver(() => {
      armClosingFallback();
      scheduleRecovery();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    }
    selectorStates().forEach(({ root, selector, scrim }) => {
      observer.observe(root, { attributes: true, attributeFilter: ["class"] });
      if (selector) {
        observer.observe(selector, { attributes: true, attributeFilter: ["aria-modal", "role"] });
      }
      if (scrim) {
        observer.observe(scrim, { attributes: true, attributeFilter: ["hidden"] });
      }
    });
  };

  forceResetTransientUi();
  observeArchiveState();
  window.requestAnimationFrame(notifyReady);
  [120, 480, 1200].forEach((delay) => window.setTimeout(scheduleRecovery, delay));

  window.addEventListener("pageshow", forceResetTransientUi);
  window.addEventListener("message", (event) => {
    if (event.data?.type === "saga-archive:close-transients") {
      forceResetTransientUi();
      window.requestAnimationFrame(notifyReady);
    } else if (event.data?.type === "saga-archive:status-request") {
      notifyReady();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleRecovery();
  });
  for (const eventName of [
    "pointerup",
    "pointercancel",
    "touchend",
    "touchcancel",
    "transitionend",
    "animationend",
  ]) {
    document.addEventListener(eventName, scheduleRecovery, { passive: true, capture: true });
  }
})();
