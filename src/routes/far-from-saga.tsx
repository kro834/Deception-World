import { createFileRoute } from "@tanstack/react-router";
import { FarFromSaga } from "@/components/far-from-saga/far-from-saga";
import {
  WORLD_CORE_STYLESHEET_LINKS as WORLD_STYLESHEET_LINKS,
  CINEMATIC_STYLESHEET_LINK,
  DOSSIER_HUD_FONTS_URL,
} from "@/lib/world-head";
import rexonanceSagaCssUrl from "@/styles-rexonance-saga.css?url";
import sagaShowcaseCssUrl from "@/styles-saga-showcase.css?url";
import showcaseElevationCssUrl from "@/styles-showcase-elevation.css?url";
import motionEditionCssUrl from "@/styles-motion-edition.css?url";
import farFromSagaCssUrl from "@/styles-far-from-saga.css?url";
import { FAR_FROM_SAGA_KEY_VISUAL, farFromImage } from "@/lib/far-from-saga-artwork";

// Provisional (2026-10-22): the FAR FROM SAGA special site's scaffold. The
// shared special-site sheets draw the chrome; styles-far-from-saga.css is this
// page's own and loads last before the cinematic sheet.
export const Route = createFileRoute("/far-from-saga")({
  component: FarFromSaga,
  head: () => ({
    meta: [
      { title: "ファーフロムサーガ｜FAR FROM SAGA — Deception World" },
      {
        name: "description",
        content:
          "遠く離れた機構までが、一つの拳になる。ファイナルステージ限定の超究極フォーム、仮面ライダーファーフロムサーガの公式特設サイト。変身音声、スペック、五つの形態段階、中核機構、神属権限、必殺技の記録。",
      },
      { property: "og:title", content: "ファーフロムサーガ｜FAR FROM SAGA — Deception World" },
      {
        property: "og:description",
        content: "遠く離れた機構までが、一つの拳になる。超共鳴と接続の、さらに先へ。",
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
    ],
  }),
});
