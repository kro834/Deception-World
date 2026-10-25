import visualAstraCssUrl from "@/styles-visual-astra.css?url";
import { createFileRoute } from "@tanstack/react-router";
import { FarFromSaga } from "@/components/far-from-saga/far-from-saga";
import {
  WORLD_CORE_STYLESHEET_LINKS as WORLD_STYLESHEET_LINKS,
  CINEMATIC_STYLESHEET_LINK,
  DOSSIER_HUD_FONTS_URL,
} from "@/lib/world-head";
import formSliderCssUrl from "@/styles-form-slider.css?url";
import rexonanceSagaCssUrl from "@/styles-rexonance-saga.css?url";
import sagaShowcaseCssUrl from "@/styles-saga-showcase.css?url";
import showcaseElevationCssUrl from "@/styles-showcase-elevation.css?url";
import motionEditionCssUrl from "@/styles-motion-edition.css?url";
import farFromSagaCssUrl from "@/styles-far-from-saga.css?url";
import farFromSuitupCssUrl from "@/styles-far-from-suitup.css?url";
import assemblyMovieCssUrl from "@/styles-assembly-movie.css?url";
import farFromZenithCssUrl from "@/styles-far-from-zenith.css?url";
import { FAR_FROM_SAGA_KEY_VISUAL, farFromImage } from "@/lib/far-from-saga-artwork";
import { syncRexonanceLayoutGate } from "@/lib/rexonance-layout-gate.js";

// The FAR FROM SAGA special site (owner's record, 2026-10-22; the Rexonance
// site's structure since 2026-10-23). The shared special-site sheets draw the
// chrome; styles-far-from-saga.css is this page's own and loads last before
// the cinematic sheet.
export const Route = createFileRoute("/far-from-saga")({
  // The runway's layout gate (Save-Data/2G, data-rzn-constrained) is read
  // again on each entry, as /rexonance-saga does: an in-site entry would
  // otherwise keep the first page's snapshot, and the runway's layout, the
  // engine's gate and the movie's control could disagree.
  beforeLoad: ({ cause, preload }) => {
    if (typeof window !== "undefined" && !preload && cause === "enter") syncRexonanceLayoutGate();
  },
  component: FarFromSaga,
  head: () => ({
    meta: [
      { title: "ファーフロムサーガ｜FAR FROM SAGA — Deception World" },
      {
        name: "description",
        content:
          "ファイナルステージ限定の超究極フォーム、仮面ライダーファーフロムサーガの特設サイト。変身音声、スペック、性能比較、P16、変身、5つの形態、中核機構、能力、武装、必殺技を掲載。",
      },
      { property: "og:title", content: "ファーフロムサーガ｜FAR FROM SAGA — Deception World" },
      {
        property: "og:description",
        content:
          "どこまで離れても、この拳の一部だ。ファイナルステージ限定の超究極フォーム、仮面ライダーファーフロムサーガ。",
      },
      { property: "og:image", content: FAR_FROM_SAGA_KEY_VISUAL.src },
    ],
    links: [
      ...WORLD_STYLESHEET_LINKS,
      { rel: "stylesheet", href: rexonanceSagaCssUrl },
      { rel: "stylesheet", href: sagaShowcaseCssUrl },
      { rel: "stylesheet", href: DOSSIER_HUD_FONTS_URL },
      { rel: "stylesheet", href: showcaseElevationCssUrl },
      { rel: "stylesheet", href: motionEditionCssUrl },
      { rel: "stylesheet", href: farFromSagaCssUrl },
      // The scroll suit-up's runway (styles-far-from-suitup.css): the
      // Rexonance runway's sheet, ported, after the page's own.
      { rel: "stylesheet", href: farFromSuitupCssUrl },
      // The auto transformation movie's control: where it stands, clear of
      // the figure (styles-assembly-movie.css; the sheet above draws its sheet).
      { rel: "stylesheet", href: assemblyMovieCssUrl },
      // The page brought up to the Extreme and Rexonance sites (owner,
      // 2026-10-24): plates and heads, page-scoped, after the page's sheets.
      { rel: "stylesheet", href: farFromZenithCssUrl },
      // The special sites' one form-slider shape (owner, 2026-10-24).
      { rel: "stylesheet", href: formSliderCssUrl },
      { rel: "stylesheet", href: visualAstraCssUrl },
      CINEMATIC_STYLESHEET_LINK,
      {
        rel: "preload",
        as: "image",
        href: FAR_FROM_SAGA_KEY_VISUAL.src,
        imageSrcSet: farFromImage("middle").srcSet,
        imageSizes: farFromImage("middle").sizes,
        fetchPriority: "high",
        type: "image/webp",
      },
      // The Latin display face (the title's Latin line, the name's ghost,
      // the read-outs), 20 KB, ready at first paint so nothing re-sets when
      // it lands, as the Rexonance route preloads it. The Japanese display
      // face stays off the first paint's path (the page applies it after
      // paint, as text= subsets).
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/rexonance-forge-20261016.woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
});
