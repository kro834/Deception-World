import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { refreshPhoneLandscapeMenu, watchPhoneLandscapeMenu } from "@/lib/phone-landscape-menu.js";
import phoneLandscapeCss from "@/styles-phone-landscape-menu.css?url";

/** A separate iPhone-only controller; iPad's setting and motion stay independent. */
export function PhoneLandscapeMenu() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => watchPhoneLandscapeMenu(), []);
  useEffect(() => refreshPhoneLandscapeMenu(), [pathname]);
  return <link rel="stylesheet" href={phoneLandscapeCss} precedence="default" />;
}
