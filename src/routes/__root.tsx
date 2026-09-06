import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { LegacyDataRetirement } from "@/components/legacy-data-retirement";
import { AppGuards, LoadGateProvider } from "@/components/load-gate";
import { ZeusButtonProvider } from "@/components/zeus-button";
import { ContentProtection } from "@/components/content-protection";
import androidPerformanceCss from "../styles-android-performance.css?url";
import pickupStabilityCss from "../styles-pickup-stability.css?url";
import appCss from "../styles.css?url";
import routeTransitionsCss from "../styles-route-transitions.css?url";

const APP_NAME = "Deception World";
const host = import.meta.env.VITE_PUBLIC_HOSTNAME;
const ogImage = host ? `https://${host}/og.jpg` : undefined;
const xBanner = host
  ? `https://og.grok.me/v1/banner.png?host=${encodeURIComponent(host)}&title=${encodeURIComponent(APP_NAME)}&color=000000`
  : undefined;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" },
      { title: APP_NAME },
      { name: "description", content: "仮面ライダーサーガ Deception World — 映画オープニング" },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "theme-color", content: "#000000" },
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
    links: [
      { rel: "preload", as: "image", type: "image/webp", href: "/zeus-button-360.webp" },
      { rel: "stylesheet", href: androidPerformanceCss },
      { rel: "stylesheet", href: pickupStabilityCss },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/__grok/icon-180.png" },
      { rel: "stylesheet", href: routeTransitionsCss },
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
        <ContentProtection />
        <LegacyDataRetirement />
        <PreviewHostBridge />
        <AuthProvider>
          <LoadGateProvider>
            <ZeusButtonProvider>
              <AppGuards />
              <Outlet />
            </ZeusButtonProvider>
          </LoadGateProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
