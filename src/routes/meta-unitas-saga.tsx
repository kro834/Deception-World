import { createFileRoute } from "@tanstack/react-router";
import { MetaUnitasSaga } from "@/components/meta-unitas-saga/meta-unitas-saga";
import {
  WORLD_CORE_STYLESHEET_LINKS as WORLD_STYLESHEET_LINKS,
  CINEMATIC_STYLESHEET_LINK,
  DOSSIER_HUD_FONTS_URL,
} from "@/lib/world-head";
import formSliderCssUrl from "@/styles-form-slider.css?url";
import rexonanceSagaCssUrl from "@/styles-rexonance-saga.css?url";
import metaUnitasSagaCssUrl from "@/styles-meta-unitas-saga.css?url";
import metaUnitasSuitupCssUrl from "@/styles-meta-unitas-suitup.css?url";
import assemblyMovieCssUrl from "@/styles-assembly-movie.css?url";
import { META_UNITAS_KEY_VISUAL, metaUnitasImage } from "@/lib/meta-unitas-saga-artwork";

// The META UNITAS SAGA special site (owner's record, 2026-10-23). The shared
// special-site sheet draws the local bar, the menu trigger and the liquid
// rails; styles-meta-unitas-saga.css is this page's own (scoped to
// .mus-page) and loads last before the cinematic sheet.
export const Route = createFileRoute("/meta-unitas-saga")({
  component: MetaUnitasSaga,
  head: () => ({
    meta: [
      { title: "メタ・ウニタスサーガ｜META UNITAS SAGA — Deception World" },
      {
        name: "description",
        content:
          "仮面ライダーメタ・ウニタスサーガの特設サイト。変身音声、スペック、性能比較、変身、基幹システム、固有能力、装甲・支援機構、形態段階、専用武装、必殺技を掲載。",
      },
      { property: "og:title", content: "メタ・ウニタスサーガ｜META UNITAS SAGA — Deception World" },
      {
        property: "og:description",
        content: "仮面ライダーメタ・ウニタスサーガ／仮面ライダーメタ・ウニタスサーガ・ウルトラ",
      },
      { property: "og:image", content: META_UNITAS_KEY_VISUAL.src },
    ],
    links: [
      ...WORLD_STYLESHEET_LINKS,
      { rel: "stylesheet", href: rexonanceSagaCssUrl },
      { rel: "stylesheet", href: DOSSIER_HUD_FONTS_URL },
      // The scroll suit-up's runway: the Rexonance runway, as FAR FROM's sheet
      // draws it, scoped to this page; the page's own sheet after it.
      { rel: "stylesheet", href: metaUnitasSuitupCssUrl },
      { rel: "stylesheet", href: metaUnitasSagaCssUrl },
      // The auto transformation movie's control (styles-assembly-movie.css).
      { rel: "stylesheet", href: assemblyMovieCssUrl },
      // The special sites' one form-slider shape (owner, 2026-10-24).
      { rel: "stylesheet", href: formSliderCssUrl },
      CINEMATIC_STYLESHEET_LINK,
      {
        rel: "preload",
        as: "image",
        href: META_UNITAS_KEY_VISUAL.src,
        imageSrcSet: metaUnitasImage("middle").srcSet,
        imageSizes: metaUnitasImage("middle").sizes,
        fetchPriority: "high",
        type: "image/webp",
      },
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
