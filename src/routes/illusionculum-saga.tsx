import { createFileRoute } from "@tanstack/react-router";
import { IllusionculumSaga } from "@/components/illusionculum-saga/illusionculum-saga";
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
import illusionculumSagaCssUrl from "@/styles-illusionculum-saga.css?url";
import illusionculumSuitupCssUrl from "@/styles-illusionculum-suitup.css?url";
import assemblyMovieCssUrl from "@/styles-assembly-movie.css?url";
import {
  ILLUSIONCULUM_HERO,
  ILLUSIONCULUM_KEY_VISUAL,
  illusionculumCutoutImage,
} from "@/lib/illusionculum-saga-artwork";
import { syncRexonanceLayoutGate } from "@/lib/rexonance-layout-gate.js";

// The ILLUSIONCULUM SAGA special site (owner, 2026-10-23: 「イリュージョンクルム
// サーガを追加。レクソナンスを参考に。」), on the Rexonance site's structure as
// /far-from-saga carries it. The shared special-site sheets draw the chrome;
// styles-illusionculum-saga.css is this page's own and loads after them, the
// scroll suit-up's sheet after it, the cinematic sheet last.
export const Route = createFileRoute("/illusionculum-saga")({
  // The suit-up runway's length is decided before layout (the Save-Data /
  // 2G snapshot), as on the Rexonance route.
  beforeLoad: ({ cause, preload }) => {
    if (typeof window !== "undefined" && !preload && cause === "enter") syncRexonanceLayoutGate();
  },
  component: IllusionculumSaga,
  head: () => ({
    meta: [
      { title: "イリュージョンクルムサーガ｜ILLUSIONCULUM SAGA — Deception World" },
      {
        name: "description",
        content:
          "仮面ライダーイリュージョンクルムサーガの特設サイト。変身音声、スペック、性能比較、変身、形態、装甲・外観、専用武装、能力、必殺技を掲載。",
      },
      {
        property: "og:title",
        content: "イリュージョンクルムサーガ｜ILLUSIONCULUM SAGA — Deception World",
      },
      {
        property: "og:description",
        content:
          "仮面ライダーイリュージョンクルムサーガ／仮面ライダーイリュージョンクルムサーガ・ウルトラ。",
      },
      { property: "og:image", content: ILLUSIONCULUM_KEY_VISUAL.src },
    ],
    links: [
      ...WORLD_STYLESHEET_LINKS,
      { rel: "stylesheet", href: rexonanceSagaCssUrl },
      { rel: "stylesheet", href: sagaShowcaseCssUrl },
      { rel: "stylesheet", href: DOSSIER_HUD_FONTS_URL },
      { rel: "stylesheet", href: showcaseElevationCssUrl },
      { rel: "stylesheet", href: motionEditionCssUrl },
      { rel: "stylesheet", href: illusionculumSagaCssUrl },
      // The scroll suit-up's runway, after the page's own.
      { rel: "stylesheet", href: illusionculumSuitupCssUrl },
      // The auto transformation movie's control (the sheet above draws it).
      { rel: "stylesheet", href: assemblyMovieCssUrl },
      // The special sites' one form-slider shape (owner, 2026-10-24).
      { rel: "stylesheet", href: formSliderCssUrl },
      CINEMATIC_STYLESHEET_LINK,
      {
        rel: "preload",
        as: "image",
        href: ILLUSIONCULUM_HERO.src,
        imageSrcSet: illusionculumCutoutImage("standard").srcSet,
        imageSizes: illusionculumCutoutImage("standard").sizes,
        fetchPriority: "high",
        type: "image/webp",
      },
      // The Latin display face (the numerals, the calls, the name's ghost),
      // ready at first paint as on the Rexonance and Far From routes. The
      // Japanese faces are the site's own, unchanged.
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
