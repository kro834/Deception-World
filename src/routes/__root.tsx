import { useEffect } from "react";
import { GALLERY_CURTAIN_STICKERS } from "@/components/gallery/gallery-curtain";
import { scheduleGalleryStickerWarmup } from "@/lib/gallery-sticker-warmup";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { LibraryVisitTracker } from "@/components/library/library-controls";
import { InquiryNavigation } from "@/components/library/inquiry-navigation";
import { QuickSearchHost } from "@/components/search/quick-search-host";
import inquiryNavigationCss from "@/styles-inquiry-navigation.css?url";
import interactionChoreographyCss from "@/styles-interaction-choreography.css?url";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { LegacyDataRetirement } from "@/components/legacy-data-retirement";
import { AppGuards, LoadGateProvider } from "@/components/load-gate";
import { ZeusButtonProvider } from "@/components/zeus-button";
import { OpeningNotice } from "@/components/opening-notice";
import { ContentProtection } from "@/components/content-protection";
import { SkipLink } from "@/components/skip-link";
import { IpadMenuMode } from "@/components/ipad-menu-mode";
import { LiquidGlassDefs } from "@/components/liquid-glass-defs";
import { BUTTON_STYLE_SCRIPT } from "@/lib/button-style.js";
import { PhoneLandscapeMenu } from "@/components/phone-landscape-menu";
import { RETIRED_ULTRA_MODE_SCRIPT } from "@/lib/retired-ultra-mode";
import { REXONANCE_LAYOUT_BOOT_SCRIPT } from "@/lib/rexonance-layout-gate.js";
import { watchOpenDialogs } from "@/lib/dialog-open-flag.js";
import { watchPresses } from "@/lib/press-feedback.js";
import { watchDynamicGui } from "@/lib/dynamic-gui.js";
import { watchFxMotion } from "@/lib/fx-motion.js";
import { SIDE_MENU_EARLY_INPUT_SCRIPT } from "@/lib/side-menu-early-input.js";
import androidPerformanceCss from "../styles-android-performance.css?url";
import ios18PerformanceCss from "../styles-ios18-performance.css?url";
import ios27EnhancementsCss from "../styles-ios27-enhancements.css?url";
import pickupStabilityCss from "../styles-pickup-stability.css?url";
import appCss from "../styles.css?url";
import routeTransitionsCss from "../styles-route-transitions.css?url";
import frostedControlsCss from "../styles-frosted-controls.css?url";
import futureInterfaceCss from "../styles-future-interface.css?url";
import nameWordsCss from "../styles-name-words.css?url";
import pickupVisibilityCss from "../styles-pickup-visibility.css?url";
import pressFeedbackCss from "../styles-press-feedback.css?url";
import chromeElevationCss from "../styles-chrome-elevation.css?url";
import transitionCinemaCss from "../styles-transition-cinema.css?url";
import openingPlatformCss from "../styles-opening-platform.css?url";
import openingFontsCss from "../styles-opening-fonts.css?url";
import siteDisplayFontsCss from "../styles-site-display-fonts.css?url";
import siteMetricFacesCss from "../styles-site-metric-faces.css?url";
import fontSubsetsCoreCss from "../styles-font-subsets-core.css?url";
import fontSubsetsDisplayCss from "../styles-font-subsets-display.css?url";
import controlOpticsCss from "../styles-control-optics.css?url";
import openingInterfaceCss from "../styles-opening-interface.css?url";
import { compactStylesheetGroups } from "@/lib/compact-stylesheet-groups";
import rexonanceCallsCss from "../styles-rexonance-calls.css?url";
import farFromEntryCss from "../styles-far-from-entry.css?url";
import illusionculumEntryCss from "../styles-illusionculum-entry.css?url";
import viewportChromeCss from "../styles-viewport-chrome.css?url";
import stageCss from "../styles-stage.css?url";
import stageShellCss from "../styles-stage-shell.css?url";
import openingShellCss from "../styles-opening-shell.css?url";
import sagaStreamlineCss from "../styles-saga-streamline.css?url";
import siteAstraCss from "../styles-site-astra.css?url";
import commandChromeCss from "../styles-command-chrome.css?url";
import dynamicGuiCss from "../styles-dynamic-gui.css?url";
import liquidGlassCss from "../styles-liquid-glass.css?url";
import liquidGlassControlsCss from "../styles-liquid-glass-controls.css?url";
import liquidGlassSurfacesCss from "../styles-liquid-glass-surfaces.css?url";
import fxMotionCss from "../styles-fx-motion.css?url";
import futureSpectrumCss from "../styles-future-spectrum.css?url";
import { DEVICE_PROFILE_SCRIPT } from "@/lib/device-profile-gate";
import { IPAD_STANDALONE_VIEWPORT_SCRIPT } from "@/lib/ipad-standalone-viewport";
import { getViewportChrome, getViewportChromeColor } from "@/lib/viewport-chrome";
import { getRouteFamily } from "@/lib/route-family";
import { DOSSIER_HUD_FONTS_URL } from "@/lib/world-head";
import { siteFontLinks, SITE_CORE_FONTS_URL, SITE_DISPLAY_FONTS_URL } from "@/lib/site-fonts";
import { CIEL_BUTTON_SIZES, CIEL_BUTTON_SRCSET } from "@/lib/thumbnail-images";

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

/* html[data-dg-ready] + .dg-reveal[data-dg-seen] / --dg-progress: the shared
   dynamic GUI kit (src/lib/dynamic-gui.js, src/styles-dynamic-gui.css). */
function DynamicGui() {
  useEffect(() => watchDynamicGui(), []);
  return null;
}

/* The gallery curtain's stickers, fetched and decoded on idle so they are on
   the cloth from the curtain's first frame (src/lib/gallery-sticker-warmup.ts). */
/* html[data-fx-ready] + [data-fx-hover]: the desktop tilt and magnet on a
   spring (src/lib/fx-motion.js, src/styles-fx-motion.css). */
function FxMotion() {
  useEffect(() => watchFxMotion(), []);
  return null;
}

function GalleryStickerWarmup() {
  useEffect(() => scheduleGalleryStickerWarmup(GALLERY_CURTAIN_STICKERS), []);
  return null;
}

function LibrarySession() {
  const location = useRouterState({ select: (state) => state.location });
  return <LibraryVisitTracker pathname={location.pathname} hash={location.hash} />;
}

// A missing record says so in the tab and to screen readers, as its heading
// does (the HTTP status is already 404). A route head deeper than this one
// still wins, so the rider route's own head names the same title.
const MISSING_RECORD_TITLE = "記録が見つかりません｜Deception World";

export const Route = createRootRoute({
  head: ({ matches }) => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
      },
      {
        title: matches.some((match) => match.status === "notFound" || match._notFound)
          ? MISSING_RECORD_TITLE
          : APP_NAME,
      },
      { name: "description", content: "仮面ライダーサーガ Deception World — 映画オープニング" },
      // Keep native Home Screen chrome in the router-owned, initial head.
      // A manifest alone enables installation, but the Apple status-bar
      // contract also needs its capable flag; do not rely on late injection.
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black" },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      {
        name: "theme-color",
        content: getViewportChromeColor(matches.at(-1)?.routeId ?? ""),
      },
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
    scripts: [
      { children: IPAD_STANDALONE_VIEWPORT_SCRIPT },
      { children: DEVICE_PROFILE_SCRIPT },
      { children: RETIRED_ULTRA_MODE_SCRIPT },
      { children: BUTTON_STYLE_SCRIPT },
      { children: REXONANCE_LAYOUT_BOOT_SCRIPT },
      { children: SIDE_MENU_EARLY_INPUT_SCRIPT },
    ],
    links: compactStylesheetGroups([
      // The Zeus button's image, for every route that shows the button. The
      // opening (/) never renders it, so there the preload went unused (a
      // console warning on every visit, and a fetch beside the title's logo).
      // (The root's head sees every match; its type knows only its own id.)
      ...(matches.some((match) => (match.routeId as string) === "/")
        ? []
        : [
            {
              rel: "preload",
              as: "image",
              type: "image/webp",
              href: "/ciel-button-20261018-360.webp",
              imageSrcSet: CIEL_BUTTON_SRCSET,
              imageSizes: CIEL_BUTTON_SIZES,
              fetchPriority: "low" as const,
            },
          ]),
      { rel: "stylesheet", href: androidPerformanceCss },
      { rel: "stylesheet", href: ios18PerformanceCss },
      { rel: "stylesheet", href: ios27EnhancementsCss },
      // The title has no pickup/record UI. Keep the exact original order on every other route.
      ...(matches.some((match) => (match.routeId as string) === "/")
        ? []
        : [{ rel: "stylesheet", href: pickupStabilityCss }]),
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/__grok/icon-180.png" },
      { rel: "stylesheet", href: routeTransitionsCss },
      { rel: "stylesheet", href: frostedControlsCss },
      { rel: "stylesheet", href: futureInterfaceCss },
      ...(matches.some((match) => (match.routeId as string) === "/")
        ? []
        : [
            { rel: "stylesheet", href: nameWordsCss },
            { rel: "stylesheet", href: pickupVisibilityCss },
          ]),
      { rel: "stylesheet", href: pressFeedbackCss },
      // The shared chrome (menu, announcements, covers, Zeus button, skip
      // link) in one grammar on every route; it outweighs the route sheets.
      { rel: "stylesheet", href: chromeElevationCss },
      { rel: "stylesheet", href: transitionCinemaCss },
      { rel: "stylesheet", href: rexonanceCallsCss },
      { rel: "stylesheet", href: farFromEntryCss },
      { rel: "stylesheet", href: illusionculumEntryCss },
      { rel: "stylesheet", href: viewportChromeCss },
      ...(matches.some((match) => (match.routeId as string) === "/")
        ? []
        : [{ rel: "stylesheet", href: inquiryNavigationCss }]),
      // The site-wide interface tokens; each page family scopes its own
      // stage sheet to html[data-family].
      { rel: "stylesheet", href: stageCss },
      // The command bar and the launcher menu, on every family.
      {
        rel: "stylesheet",
        href: matches.some((match) => (match.routeId as string) === "/")
          ? openingShellCss
          : stageShellCss,
      },
      // The 2026-10-16 key visual's pink light trails, site-wide (not on the
      // title, which is the logo itself).
      ...(matches.some((match) => (match.routeId as string) === "/")
        ? []
        : [
            { rel: "stylesheet", href: sagaStreamlineCss },
            { rel: "stylesheet", href: interactionChoreographyCss },
          ]),
      { rel: "stylesheet", href: siteAstraCss },
      { rel: "stylesheet", href: commandChromeCss },
      // The dynamic GUI kit (.dg-* classes), on every family, last.
      { rel: "stylesheet", href: dynamicGuiCss },
      // The future-motion layer (springs, scan arrivals, cascades), after the kit.
      { rel: "stylesheet", href: fxMotionCss },
      // The future spectrum: colour and surfaces over the shared chrome and
      // the base families (paint only; special, Dream, gallery and the title
      // excluded, so the title does not load it).
      ...(matches.some((match) => (match.routeId as string) === "/")
        ? []
        : [{ rel: "stylesheet", href: futureSpectrumCss }]),
      // Owner (2026-10-30): the buttons' optional liquid glass, the last sheet.
      // Every rule waits for html[data-button-style="liquid"] (the side menu's
      // option), so with it off nothing here applies.
      { rel: "stylesheet", href: liquidGlassCss },
      // Owner (2026-10-31): the glass spread to the sliders, tabs, rails,
      // switches and selects; likewise inert while the option is off.
      { rel: "stylesheet", href: liquidGlassControlsCss },
      // Owner (2026-10-31): the same glass on the surfaces and chrome (bars,
      // menus, dialog shells), after the buttons' sheet; scoped the same way.
      { rel: "stylesheet", href: liquidGlassSurfacesCss },
      ...(matches.some((match) => (match.routeId as string) === "/")
        ? []
        : [{ rel: "preconnect", href: "https://fonts.googleapis.com" }]),
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous" as const,
      },
      // Zen Kaku's Google sheet is served from this origin instead, with the
      // metric overrides (same faces and binary URLs, one cross-origin round trip fewer).
      ...siteFontLinks(matches.some((match) => (match.routeId as string) === "/")).map((link) =>
        link.href === SITE_DISPLAY_FONTS_URL ? { ...link, href: siteDisplayFontsCss } : link,
      )
        // Owner (2026-11-06): the core faces from this origin too, as the title
        // already has them (styles-opening-fonts.css: the same Google faces, with
        // the Noto slices trimmed of the characters the subsets below carry, so
        // Chromium never fetches both). One render-blocking cross-origin sheet fewer.
        .map((link) =>
          link.href === SITE_CORE_FONTS_URL &&
          !matches.some((match) => (match.routeId as string) === "/")
            ? { ...link, href: openingFontsCss }
            : link,
        ),
      // The chrome's HUD labels: the Michroma subset of capitals and digits
      // the character files already load (a few KB, display=swap).
      { rel: "stylesheet", href: DOSSIER_HUD_FONTS_URL },
      // Metric-corrected twins of the Cinzel, Oxanium and Michroma faces above
      // (same ranges and binary URLs, plus ascent/descent overrides that put
      // their capitals on the line-box centre). Last, so each face outranks its
      // Google twin; the title's snapshot sheet already carries the same faces.
      ...(matches.some((match) => (match.routeId as string) === "/")
        ? []
        : [{ rel: "stylesheet", href: siteMetricFacesCss }]),
      // Owner (2026-11-06): Noto Sans JP and Zen Kaku Gothic New cut to the
      // site's own characters, served from here (scripts/build-font-subsets.mjs).
      // After the Google faces, so these are tried first; a character outside
      // them still falls through to Google's slice.
      { rel: "stylesheet", href: fontSubsetsCoreCss },
      ...(matches.some((match) => (match.routeId as string) === "/")
        ? []
        : [{ rel: "stylesheet", href: fontSubsetsDisplayCss }]),
      // Optical centring nudges for the icon+label pills, submits and chapter
      // tabs whose ink sat off the box centre (layout properties only, so the
      // glass sheets above are untouched). After the faces, so it is the last
      // sheet; the title's own sheets carry the nudges its controls need.
      ...(matches.some((match) => (match.routeId as string) === "/")
        ? []
        : [{ rel: "stylesheet", href: controlOpticsCss }]),
    ], matches.some((match) => (match.routeId as string) === "/") ? [
      // Keep every rule for both the opening and the same-path dashboard.
      // Tailwind and the filename-sensitive liquid-glass transform keep their
      // original standalone sheets. Each group is contiguous in the cascade.
      // Same font faces and binary URLs, without a render-blocking external CSS round trip.
      { href: openingFontsCss, members: [SITE_CORE_FONTS_URL, DOSSIER_HUD_FONTS_URL] },
      { href: openingPlatformCss, members: [androidPerformanceCss, ios18PerformanceCss, ios27EnhancementsCss] },
      { href: openingInterfaceCss, members: [
        routeTransitionsCss, frostedControlsCss, futureInterfaceCss, pressFeedbackCss,
        chromeElevationCss, transitionCinemaCss, rexonanceCallsCss, farFromEntryCss,
        illusionculumEntryCss, viewportChromeCss, stageCss, openingShellCss,
        siteAstraCss, commandChromeCss, dynamicGuiCss, fxMotionCss,
      ] },
    ] : []),
  }),
  component: RootDocument,
});

function RootDocument() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const chrome = getViewportChrome(pathname);
  const family = getRouteFamily(pathname);
  return (
    <html lang="ja" data-viewport-chrome={chrome} data-family={family} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        <SkipLink />
        <ContentProtection />
        {chrome && <div className="viewport-chrome-cover" aria-hidden="true" />}
        <LegacyDataRetirement />
        <PreviewHostBridge />
        <AuthProvider>
          <LoadGateProvider>
            <ZeusButtonProvider>
              <AppGuards />
              <DialogOpenFlag />
              <PressFeedback />
              <LibrarySession />
              <Outlet />
              <InquiryNavigation />
              <DynamicGui />
              <FxMotion />
              <QuickSearchHost />
              <GalleryStickerWarmup />
              <IpadMenuMode />
              <PhoneLandscapeMenu />
              <OpeningNotice />
              <LiquidGlassDefs />
            </ZeusButtonProvider>
          </LoadGateProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
