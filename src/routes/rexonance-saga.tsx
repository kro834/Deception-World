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
import rexonanceFinishCssUrl from "@/styles-rexonance-finish.css?url";
import rexonancePremiereCssUrl from "@/styles-rexonance-premiere.css?url";
import rexonanceCoutureCssUrl from "@/styles-rexonance-couture.css?url";
import rexonanceArmourCssUrl from "@/styles-rexonance-armour.css?url";
import stageSpecialCssUrl from "@/styles-stage-special.css?url";
import stageRexonanceCssUrl from "@/styles-stage-rexonance.css?url";
import { rexonanceImage } from "@/lib/rexonance-images";
import { REXONANCE_SITE_ARTWORK } from "@/lib/rexonance-site-artwork";

export const Route = createFileRoute("/rexonance-saga")({
  component: RexonanceSaga,
  head: () => ({
    meta: [
      { title: "レクソナンスサーガ｜Deception World" },
      {
        name: "description",
        content:
          "究極が始まる。レクソナンスサーガの標準性能を、公開済みのカタログ値で。P14演算基盤、三つの形態、三者の共鳴構造まで。",
      },
      { property: "og:title", content: "レクソナンスサーガ｜Deception World" },
      {
        property: "og:description",
        content: "覚醒する、全てが最高峰で。レクソナンスサーガの性能、P14、三つの形態、共鳴構造。",
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
      { rel: "stylesheet", href: rexonanceFinishCssUrl },
      { rel: "stylesheet", href: rexonancePremiereCssUrl },
      { rel: "stylesheet", href: rexonanceCoutureCssUrl },
      // The Armour edition: the page drawn as the suit-up renders its armour
      // (styles-rexonance-armour.css), paint only, after Couture.
      { rel: "stylesheet", href: rexonanceArmourCssUrl },
      // STAGE (rx10): the trailer, over the Armour materials (the shared
      // special-site grammar, then this page's scenes).
      { rel: "stylesheet", href: stageSpecialCssUrl },
      { rel: "stylesheet", href: stageRexonanceCssUrl },
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
