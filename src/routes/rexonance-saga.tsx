import { createFileRoute } from "@tanstack/react-router";
import { RexonanceSaga } from "@/components/rexonance-saga/rexonance-saga";
import {
  WORLD_CORE_STYLESHEET_LINKS as WORLD_STYLESHEET_LINKS,
  CINEMATIC_STYLESHEET_LINK,
  DOSSIER_HUD_FONTS_URL,
} from "@/lib/world-head";
import formSliderCssUrl from "@/styles-form-slider.css?url";
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
import rexonanceResonanceCssUrl from "@/styles-rexonance-resonance.css?url";
import rexonanceZenithCssUrl from "@/styles-rexonance-zenith.css?url";
import rexonanceForgeCssUrl from "@/styles-rexonance-forge.css?url";
import rexonanceEditorialCssUrl from "@/styles-rexonance-editorial.css?url";
import p14CalibrationCssUrl from "@/styles-p14-calibration.css?url";
import rexonanceApexCssUrl from "@/styles-rexonance-apex.css?url";
import rexonanceLayoutCssUrl from "@/styles-rexonance-layout-20261021.css?url";
import rexonanceTypeCssUrl from "@/styles-rexonance-type-20261021.css?url";
import rexonanceKineticCssUrl from "@/styles-rexonance-motion-20261021.css?url";
import assemblyMovieCssUrl from "@/styles-assembly-movie.css?url";
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
          "究極が始まる。レクソナンスサーガの標準性能を、公開済みのカタログ値で。P14 Extreme Tuning、三つの形態、第五の犬として覚醒した悠真の自己共鳴構造まで。",
      },
      { property: "og:title", content: "レクソナンスサーガ｜Deception World" },
      {
        property: "og:description",
        content:
          "覚醒する、全てが最高峰で。レクソナンスサーガの性能、P14 Extreme Tuning、三つの形態、悠真自身の終焉を制御する自己共鳴構造。",
      },
      { property: "og:image", content: REXONANCE_SITE_ARTWORK.standard },
    ],
    links: [
      ...WORLD_STYLESHEET_LINKS,
      // The special sites' one form-slider shape (owner, 2026-10-24; its
      // rules carry their own weight, so it need not come last here).
      { rel: "stylesheet", href: formSliderCssUrl },
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
      // RESONANCE (rx11): the trailer in motion — depth, pinned cuts, the
      // hits (styles-rexonance-resonance.css), over the STAGE scenes.
      { rel: "stylesheet", href: rexonanceResonanceCssUrl },
      // ZENITH (rx15): the suit-up on the page — the call played with the
      // scroll, the armour assembled from nanites (styles-rexonance-zenith.css).
      { rel: "stylesheet", href: rexonanceZenithCssUrl },
      // FORGE (rx18): the page's type in four materials and its chrome in the
      // engines' grammar — chips, guideways, molten gold (styles-rexonance-forge.css).
      { rel: "stylesheet", href: rexonanceForgeCssUrl },
      { rel: "stylesheet", href: rexonanceEditorialCssUrl },
      // The auto transformation movie's control: where it stands, clear of
      // the figure (styles-assembly-movie.css; the editorial sheet draws its
      // sheet; no later sheet touches it).
      { rel: "stylesheet", href: assemblyMovieCssUrl },
      { rel: "stylesheet", href: p14CalibrationCssUrl },
      // APEX (rx19): the page interface around the suit-up as one HUD
      // instrument — chapter index, numbered bar, plates, rows, floors
      // (styles-rexonance-apex.css); the 2026-10-21 layout, type and kinetic
      // sheets follow it and win where they overlap.
      { rel: "stylesheet", href: rexonanceApexCssUrl },
      // LAYOUT (2026-10-21): the page's composition — grid, spacing, frames,
      // plates, imagery treatment — decided once, after every edition sheet
      // (styles-rexonance-layout-20261021.css). Type and motion editions
      // follow in their own sheets.
      { rel: "stylesheet", href: rexonanceLayoutCssUrl },
      // TYPE (rx21): the page's type system — the Mincho titles and ledes,
      // the tokens, the kickers' one voice — after the layout sheet; only
      // the motion sheet follows it (the cinematic skin follows every
      // feature's sheet).
      { rel: "stylesheet", href: rexonanceTypeCssUrl },
      // KINETIC (rxk, 2026-10-21): the chapters' entrances, the reading rail,
      // hover and press, the end card (styles-rexonance-motion-20261021.css;
      // src/lib/rexonance-choreography.js arms and plays them). Last of the
      // page's sheets, after the layout.
      { rel: "stylesheet", href: rexonanceKineticCssUrl },
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
      // The futuristic Japanese display uses local gothic; no unused Mincho preload.
    ],
  }),
});
