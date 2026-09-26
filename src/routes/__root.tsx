import { useEffect } from "react";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { LegacyDataRetirement } from "@/components/legacy-data-retirement";
import { AppGuards, LoadGateProvider } from "@/components/load-gate";
import { ZeusButtonProvider } from "@/components/zeus-button";
import { ContentProtection } from "@/components/content-protection";
import { SkipLink } from "@/components/skip-link";
import { watchOpenDialogs } from "@/lib/dialog-open-flag.js";
import { watchPresses } from "@/lib/press-feedback.js";
import androidPerformanceCss from "../styles-android-performance.css?url";
import ios18PerformanceCss from "../styles-ios18-performance.css?url";
import ios27EnhancementsCss from "../styles-ios27-enhancements.css?url";
import pickupStabilityCss from "../styles-pickup-stability.css?url";
import appCss from "../styles.css?url";
import routeTransitionsCss from "../styles-route-transitions.css?url";
import frostedControlsCss from "../styles-frosted-controls.css?url";
import futureInterfaceCss from "../styles-future-interface.css?url";
import pickupVisibilityCss from "../styles-pickup-visibility.css?url";
import pressFeedbackCss from "../styles-press-feedback.css?url";
import { DEVICE_PROFILE_SCRIPT } from "@/lib/device-profile-gate";
import { ZEUS_BUTTON_SIZES, ZEUS_BUTTON_SRCSET } from "@/lib/thumbnail-images";

const APP_NAME = "Deception World";
const host = import.meta.env.VITE_PUBLIC_HOSTNAME;
const ogImage = host ? `https://${host}/og.jpg` : undefined;
const xBanner = host
  ? `https://og.grok.me/v1/banner.png?host=${encodeURIComponent(host)}&title=${encodeURIComponent(APP_NAME)}&color=000000`
  : undefined;

/* html[data-dialog-open] stands in for :has(dialog[open]) in the World
   sheets' motion gates (src/lib/dialog-open-flag.js). */
function DialogOpenFlag() {
  useEffect(() => watchOpenDialogs(), []);
  return null;
}

/* html[data-press-ready] + [data-press]: one press response on every control
   (src/lib/press-feedback.js, src/styles-press-feedback.css). */
function PressFeedback() {
  useEffect(() => watchPresses(), []);
  return null;
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" },
      { title: APP_NAME },
      { name: "description", content: "仮面ライダーサーガ Deception World — 映画オープニング" },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "theme-color", content: "#000000" },
      { name: "color-scheme", content: "dark" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: APP_NAME },
      ...(ogImage
        ? [
            { property: "og:image", content: ogImage },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
          ]
        : []),
      ...(xBanner
        ? [
            { property: "x:game:image", content: xBanner },
            { property: "x:game:image:width", content: "1200" },
            { property: "x:game:image:height", content: "264" },
          ]
        : []),
    ],
    // Runs while the HTML is parsed: the device attributes on <html> (Android,
    // One UI, iOS 18, economy, native progress) are there at the first paint.
    scripts: [{ children: DEVICE_PROFILE_SCRIPT }],
    links: [
      {
        rel: "preload",
        as: "image",
        type: "image/webp",
        href: "/zeus-button-360.webp",
        imageSrcSet: ZEUS_BUTTON_SRCSET,
        imageSizes: ZEUS_BUTTON_SIZES,
      },
      { rel: "stylesheet", href: androidPerformanceCss },
      { rel: "stylesheet", href: ios18PerformanceCss },
      { rel: "stylesheet", href: ios27EnhancementsCss },
      { rel: "stylesheet", href: pickupStabilityCss },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/__grok/icon-180.png" },
      { rel: "stylesheet", href: routeTransitionsCss },
      { rel: "stylesheet", href: frostedControlsCss },
      { rel: "stylesheet", href: futureInterfaceCss },
      { rel: "stylesheet", href: pickupVisibilityCss },
      { rel: "stylesheet", href: pressFeedbackCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Noto+Sans+JP:wght@400;500;600&family=Oxanium:wght@400;500;600;700&family=Zen+Kaku+Gothic+New:wght@500;600;700&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        <SkipLink />
        <ContentProtection />
        <LegacyDataRetirement />
        <PreviewHostBridge />
        <AuthProvider>
          <LoadGateProvider>
            <ZeusButtonProvider>
              <AppGuards />
              <DialogOpenFlag />
              <PressFeedback />
              <Outlet />
            </ZeusButtonProvider>
          </LoadGateProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
