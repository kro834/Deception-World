(() => {
  "use strict";

  const compare = document.querySelector("#realm--saga-form-compare-ios");
  const swapButton = document.querySelector("#realm--saga-compare-swap-button");
  const syncRail = document.querySelector("#realm--saga-compare-sync-rail");
  const archiveRoot = document.querySelector("#realm--saga-forms-performance-v5");

  if (!compare || !(swapButton instanceof HTMLButtonElement)) return;

  const groups = {
    a: [...compare.querySelectorAll('input[name="realm--saga-compare-a"]')],
    b: [...compare.querySelectorAll('input[name="realm--saga-compare-b"]')],
  };

  let cleanupTimer = 0;
  let animationFrame = 0;
  let motionAnimations = [];
  let colorsSwapped = compare.classList.contains("is-color-swapped");
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  const updateChannelColors = () => {
    compare.classList.toggle("is-color-swapped", colorsSwapped);
    const labels = [...compare.querySelectorAll(".compare-side legend small")];
    if (labels[0]) labels[0].textContent = colorsSwapped ? "VIOLET CHANNEL" : "CYAN CHANNEL";
    if (labels[1]) labels[1].textContent = colorsSwapped ? "CYAN CHANNEL" : "VIOLET CHANNEL";
  };

  const selectedValue = (group) =>
    groups[group].find((input) => input instanceof HTMLInputElement && input.checked)?.value ?? "";

  const selectValue = (group, value) => {
    const target = groups[group].find(
      (input) => input instanceof HTMLInputElement && input.value === value,
    );
    if (!(target instanceof HTMLInputElement)) return false;
    target.checked = true;
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const finishAnimation = () => {
    window.clearTimeout(cleanupTimer);
    window.cancelAnimationFrame(animationFrame);
    motionAnimations.forEach((animation) => {
      try {
        animation.cancel();
      } catch {
        // A completed Web Animation no longer needs cancellation.
      }
    });
    motionAnimations = [];
    compare.classList.remove("is-swapping");
    swapButton.classList.remove("is-swapping");
    swapButton.removeAttribute("aria-busy");
  };

  const animatePanels = () => {
    if (reducedMotion?.matches) return;
    const railBar = syncRail?.querySelector("span");
    if (railBar instanceof HTMLElement && typeof railBar.animate === "function") {
      railBar.style.transformOrigin = "center";
      motionAnimations.push(
        railBar.animate(
          [
            { opacity: 0.18, transform: "scaleX(.04)", filter: "brightness(1)" },
            { offset: 0.68, opacity: 1, transform: "scaleX(1)", filter: "brightness(1.9)" },
            { opacity: 0.46, transform: "scaleX(1)", filter: "brightness(1.15)" },
          ],
          { duration: 520, easing: "cubic-bezier(.2,.82,.2,1)" },
        ),
      );
    }
    [...compare.querySelectorAll(".compare-side")].forEach((panel, index) => {
      if (!(panel instanceof HTMLElement) || typeof panel.animate !== "function") return;
      const direction = index === 1 ? -1 : 1;
      motionAnimations.push(
        panel.animate(
          [
            {
              opacity: 0.94,
              transform: `translate3d(${direction * 8}px,0,0) scale(.996)`,
            },
            { opacity: 1, transform: "translate3d(0,0,0) scale(1)" },
          ],
          { duration: 360, easing: "cubic-bezier(.2,.82,.2,1)" },
        ),
      );
    });
  };

  const animateSwap = () => {
    finishAnimation();
    swapButton.setAttribute("aria-busy", "true");
    swapButton.classList.toggle("is-flipped", colorsSwapped);
    swapButton.classList.remove("is-swapping");
    compare.classList.remove("is-swapping");
    animationFrame = window.requestAnimationFrame(() => {
      swapButton.classList.add("is-swapping");
      compare.classList.add("is-swapping");
      animatePanels();
      cleanupTimer = window.setTimeout(finishAnimation, 560);
    });
  };

  const releaseStaleScrollLock = () => {
    const transientOpen =
      archiveRoot?.classList.contains("is-selector-sheet-open") ||
      Boolean(document.querySelector("dialog[open], .image-lightbox[open]"));
    if (transientOpen) return;
    document.documentElement.style.removeProperty("overflow");
    document.body.style.removeProperty("overflow");
    document.documentElement.style.removeProperty("touch-action");
    document.body.style.removeProperty("touch-action");
  };

  const forceResetTransientUi = () => {
    archiveRoot?.classList.remove("is-selector-sheet-open", "is-selector-sheet-closing");
    const selector = document.querySelector("#realm--form-selector");
    selector?.removeAttribute("aria-modal");
    selector?.removeAttribute("role");
    const scrim = archiveRoot?.querySelector(".selector-sheet-scrim");
    if (scrim instanceof HTMLElement) scrim.hidden = true;
    archiveRoot?.querySelectorAll("[inert]").forEach((element) => {
      if (element instanceof HTMLElement) element.inert = false;
    });
    archiveRoot
      ?.querySelector(".mobile-dock .dock-current")
      ?.setAttribute("aria-expanded", "false");
    document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close("archive-reset"));
  };

  const scheduleStartupScrollRecovery = () => {
    window.requestAnimationFrame(releaseStaleScrollLock);
    // Image decode and motion-profile setup finish on separate WebKit frames.
    // Recheck during that short startup window without disturbing a selector
    // sheet that the visitor has genuinely opened in the meantime.
    [120, 480, 1200].forEach((delay) => {
      window.setTimeout(releaseStaleScrollLock, delay);
    });
  };

  swapButton.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (swapButton.getAttribute("aria-busy") === "true") return;

      const left = selectedValue("a");
      const right = selectedValue("b");
      if (!left || !right || !selectValue("a", right) || !selectValue("b", left)) return;
      colorsSwapped = !colorsSwapped;
      updateChannelColors();
      animateSwap();
    },
    true,
  );

  compare.addEventListener("animationend", (event) => {
    if (
      compare.classList.contains("is-swapping") &&
      event.target instanceof HTMLElement &&
      (event.target.classList.contains("compare-side-a") || event.target.classList.contains("compare-side-b"))
    ) {
      finishAnimation();
    }
  });

  updateChannelColors();
  scheduleStartupScrollRecovery();
  window.addEventListener("pageshow", () => {
    finishAnimation();
    forceResetTransientUi();
    updateChannelColors();
    swapButton.classList.toggle("is-flipped", colorsSwapped);
    releaseStaleScrollLock();
  });
  window.addEventListener("message", (event) => {
    if (event.data?.type !== "saga-archive:close-transients") return;
    finishAnimation();
    forceResetTransientUi();
    scheduleStartupScrollRecovery();
  });
})();
