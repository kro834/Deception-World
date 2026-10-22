import { createFileRoute } from "@tanstack/react-router";
import { RexonanceSaga } from "@/components/rexonance-saga/rexonance-saga";
import {
  WORLD_CORE_STYLESHEET_LINKS as WORLD_STYLESHEET_LINKS,
  CINEMATIC_STYLESHEET_LINK,
  DOSSIER_HUD_FONTS_URL,
} from "@/lib/world-head";
import rexonanceRouteCssUrl from "@/styles-rexonance-route.css?url";
import { rexonanceImage } from "@/lib/rexonance-images";
import { REXONANCE_SITE_ARTWORK } from "@/lib/rexonance-site-artwork";
import { syncRexonanceLayoutGate } from "@/lib/rexonance-layout-gate.js";

export const Route = createFileRoute("/rexonance-saga")({
  beforeLoad: ({ cause, preload }) => {
    if (typeof window !== "undefined" && !preload && cause === "enter") syncRexonanceLayoutGate();
  },
  component: RexonanceSaga,
  head: () => ({
    meta: [
      { title: "レクソナンスサーガ｜Deception World" },
      {
        name: "description",
        content:
          "究極が始まる。レクソナンスサーガの標準性能を、公開済みのカタログ値で。P14演算基盤、三つの形態、第五の犬として覚醒した悠真の自己共鳴構造まで。",
      },
      { property: "og:title", content: "レクソナンスサーガ｜Deception World" },
      {
        property: "og:description",
        content:
          "覚醒する、全てが最高峰で。レクソナンスサーガの性能、P14、三つの形態、悠真自身の終焉を制御する自己共鳴構造。",
      },
      // The share card (2026-10-22 sweep F07): 1200x630, set from the hero's
      // key visual (REXONANCE_SITE_ARTWORK.standard) and its first screen by
      // scripts/build-og-rexonance-saga.mjs. A root-relative JPEG declared
      // with its size, so the head injector (scripts/grok-pwa-shared.mjs)
      // publishes it as this route's og:image and twitter:image in place of
      // the site card.
      { property: "og:image", content: "/og-rexonance-saga-20261022.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
    ],
    links: [
      ...WORLD_STYLESHEET_LINKS,
      // The page's own edition sheets — saga through KINETIC, in their
      // cascade order — as one render-blocking file whose @imports Vite
      // inlines (src/styles-rexonance-route.css; 2026-10-22 sweep F06). The
      // order there is the order these links had; the World core sheets
      // stay before it and the cinematic skin follows every feature's sheet.
      { rel: "stylesheet", href: rexonanceRouteCssUrl },
      { rel: "stylesheet", href: DOSSIER_HUD_FONTS_URL },
      CINEMATIC_STYLESHEET_LINK,
      {
        rel: "preload",
        as: "image",
        href: REXONANCE_SITE_ARTWORK.standard,
        imageSrcSet: rexonanceImage(REXONANCE_SITE_ARTWORK.standard).srcSet,
        imageSizes: rexonanceImage(REXONANCE_SITE_ARTWORK.standard).sizes,
        fetchPriority: "high",
      },
      // The forged face (every figure and the name), on this route only.
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/rexonance-forge-20261016.woff2",
        crossOrigin: "anonymous",
      },
      // ...and its outline instance (2.7 KB: the hero's ghost, on the first
      // screen, and the form codes), so the outlined name never first draws
      // with the forged face's inner contours and then swaps.
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/rexonance-forge-outline-20261016.woff2",
        crossOrigin: "anonymous",
      },
      // TYPE (rx21): the Mincho's first-screen subsets — the hero's line and
      // the bar's name (4.6 KB, ExtraBold), the hero's lede and scroll cue
      // (5.7 KB, Medium) — so the first screen never draws in a fallback
      // and then swaps; the lower chapters' Mincho loads when they need it.
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/rexonance-mincho-display-first-20261021.woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/rexonance-mincho-text-first-20261021.woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
});
