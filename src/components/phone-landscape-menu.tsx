import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import phoneLandscapeCss from "@/styles-phone-landscape-menu.css?url";

/** iPhone-only scroll policy using the shared compact-menu spring and shell. */
export function PhoneLandscapeMenu() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const refresh = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (!/iPhone/i.test(navigator.userAgent || "")) return;
    let active = true;
    let dispose: (() => void) | undefined;
    void import("@/lib/phone-landscape-menu.js").then(
      ({ refreshPhoneLandscapeMenu, watchPhoneLandscapeMenu }) => {
        if (!active) return;
        dispose = watchPhoneLandscapeMenu();
        refresh.current = refreshPhoneLandscapeMenu;
      },
      () => {
        // The menu remains accessible with the default scroll policy.
      },
    );
    return () => {
      active = false;
      refresh.current = undefined;
      dispose?.();
    };
  }, []);

  useEffect(() => refresh.current?.(), [pathname]);
  return <link rel="stylesheet" href={phoneLandscapeCss} precedence="default" />;
}
