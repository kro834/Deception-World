import { useLayoutEffect, type RefObject } from "react";
import { MIRAGE_BOOT_KEY } from "@/lib/mirage-boot-gate";
import { prefersLightweightRendering } from "@/lib/rendering-profile";
import { readRiderReturn } from "./rider-return-state";

const MIRAGE_BOOT_SENTINEL = "mr-boot-seal";
const MIRAGE_BOOT_FALLBACK_MS = 8_000;

/**
 * The Mirage boot is pure CSS keyed on `.mirage-edition:not([data-mirage-boot="done"])`,
 * so a server-rendered first paint plays it before hydration. An inline head
 * script (mirage-boot-gate.js) already keeps it quiet before that paint on
 * lightweight renderers, reloads within the session, hash landings and rider
 * returns. This hook covers client navigation (same rules, plus scroll
 * restores and reduced motion), marks a handoff arrival as the HUD-only
 * variant, and records the end of the boot. React never renders
 * `data-mirage-boot`, so hydration cannot reset it.
 */
export function useMirageBoot(shellRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const finish = () => {
      shell.dataset.mirageBoot = "done";
      try {
        window.sessionStorage.setItem(MIRAGE_BOOT_KEY, "1");
      } catch {
        /* Private browsing can deny storage; the boot simply ends. */
      }
    };

    // A boot that is already playing came from the server-rendered paint.
    const sentinel = shell
      .getAnimations?.({ subtree: true })
      .find(
        (animation) =>
          animation instanceof CSSAnimation && animation.animationName === MIRAGE_BOOT_SENTINEL,
      );
    const alreadyPlaying = sentinel != null && Number(sentinel.currentTime ?? 0) > 0;
    // Hydration can land after a fast boot has already ended.
    if (sentinel?.playState === "finished") {
      finish();
      return;
    }

    let seen = false;
    try {
      seen = window.sessionStorage.getItem(MIRAGE_BOOT_KEY) === "1";
    } catch {
      seen = false;
    }
    const quiet =
      document.documentElement.hasAttribute("data-mirage-quiet") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      prefersLightweightRendering(navigator);
    const restoring =
      seen || Boolean(window.location.hash) || window.scrollY > 40 || readRiderReturn() != null;

    if (quiet || (!alreadyPlaying && restoring)) {
      shell.dataset.mirageBoot = "done";
      return;
    }
    if (!alreadyPlaying && document.documentElement.hasAttribute("data-opening-handoff-active")) {
      shell.dataset.mirageBoot = "hud";
    }

    const onEnd = (event: AnimationEvent) => {
      if (event.animationName === MIRAGE_BOOT_SENTINEL) finish();
    };
    shell.addEventListener("animationend", onEnd);
    void sentinel?.finished.then(finish, () => undefined);
    const fallback = window.setTimeout(finish, MIRAGE_BOOT_FALLBACK_MS);
    return () => {
      shell.removeEventListener("animationend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [shellRef]);
}
