import { createFileRoute } from "@tanstack/react-router";
import { RexonanceSaga } from "@/components/rexonance-saga/rexonance-saga";
import {
  WORLD_CORE_STYLESHEET_LINKS as WORLD_STYLESHEET_LINKS,
  CINEMATIC_STYLESHEET_LINK,
  DOSSIER_HUD_FONTS_URL,
} from "@/lib/world-head";
import rexonanceSagaCssUrl from "@/styles-rexonance-saga.css?url";
import resonanceMotionCssUrl from "@/styles-rexonance-motion.css?url";
import sagaShowcaseCssUrl from "@/styles-saga-showcase.css?url";
import showcaseElevationCssUrl from "@/styles-showcase-elevation.css?url";
import showcaseCinemaCssUrl from "@/styles-showcase-cinema.css?url";
import motionEditionCssUrl from "@/styles-motion-edition.css?url";
import rexonancePolishCssUrl from "@/styles-rexonance-polish.css?url";
import rexonanceEditionCssUrl from "@/styles-rexonance-edition.css?url";
import rexonanceInstrumentCssUrl from "@/styles-rexonance-instrument.css?url";
import { rexonanceImage } from "@/lib/rexonance-images";
import { REXONANCE_SITE_ARTWORK } from "@/lib/rexonance-site-artwork";

export const Route = createFileRoute("/rexonance-saga")({
  component: RexonanceSaga,
  head: () => ({
    meta: [
      { title: "レクソナンスサーガ｜Deception World" },
      {
        name: "description",
        content: "レクソナンスサーガの標準性能、P14演算基盤、三段階の形態と共鳴構造を紹介します。",
      },
      { property: "og:title", content: "レクソナンスサーガ｜Deception World" },
      {
        property: "og:description",
        content:
          "レクソナンスサーガの性能、三つの形態、悠真・レックス・ゼウスによる共鳴の仕組みを紹介します。",
      },
      { property: "og:image", content: REXONANCE_SITE_ARTWORK.standard },
    ],
    links: [
      ...WORLD_STYLESHEET_LINKS,
      { rel: "stylesheet", href: rexonanceSagaCssUrl },
      { rel: "stylesheet", href: resonanceMotionCssUrl },
      { rel: "stylesheet", href: sagaShowcaseCssUrl },
      { rel: "stylesheet", href: DOSSIER_HUD_FONTS_URL },
      { rel: "stylesheet", href: showcaseElevationCssUrl },
      { rel: "stylesheet", href: showcaseCinemaCssUrl },
      { rel: "stylesheet", href: motionEditionCssUrl },
      { rel: "stylesheet", href: rexonancePolishCssUrl },
      { rel: "stylesheet", href: rexonanceEditionCssUrl },
      { rel: "stylesheet", href: rexonanceInstrumentCssUrl },
      CINEMATIC_STYLESHEET_LINK,
      {
        rel: "preload",
        as: "image",
        href: REXONANCE_SITE_ARTWORK.standard,
        imageSrcSet: rexonanceImage(REXONANCE_SITE_ARTWORK.standard).srcSet,
        imageSizes: rexonanceImage(REXONANCE_SITE_ARTWORK.standard).sizes,
        fetchPriority: "high",
      },
    ],
  }),
});
