import { createFileRoute } from "@tanstack/react-router";
import { FinalStage } from "@/components/final-stage/final-stage";
import {
  WORLD_CORE_STYLESHEET_LINKS as WORLD_STYLESHEET_LINKS,
  CINEMATIC_STYLESHEET_LINK,
  DOSSIER_HUD_FONTS_URL,
} from "@/lib/world-head";
import finalStageCssUrl from "@/styles-final-stage.css?url";
import finalStageElevationCssUrl from "@/styles-final-stage-elevation.css?url";
import motionEditionCssUrl from "@/styles-motion-edition.css?url";
import rexonanceSagaCssUrl from "@/styles-rexonance-saga.css?url";
import { rexonanceImage } from "@/lib/rexonance-images";

export const Route = createFileRoute("/final-stage")({
  component: FinalStage,
  head: () => ({
    meta: [
      { title: "ファイナルステージ｜Deception World" },
      {
        name: "description",
        content:
          "仮面ライダーサーガ ファイナルステージ公式特設サイト。仮面ライダーファーフロムサーガと仮面ライダーレルムロイヤル、ファイナルステージ限定の二形態の記録を収録。",
      },
      { property: "og:title", content: "ファイナルステージ｜Deception World" },
      {
        property: "og:description",
        content: "終幕へ至る二つの究極形態。ファイナルステージ公式特設サイト。",
      },
      { property: "og:image", content: "/final-stage-logo.jpeg" },
    ],
    links: [
      ...WORLD_STYLESHEET_LINKS,
      // The World's HUD face (capitals and digits only) for the page's labels.
      { rel: "stylesheet", href: DOSSIER_HUD_FONTS_URL },
      { rel: "stylesheet", href: rexonanceSagaCssUrl },
      { rel: "stylesheet", href: finalStageCssUrl },
      { rel: "stylesheet", href: finalStageElevationCssUrl },
      { rel: "stylesheet", href: motionEditionCssUrl },
      CINEMATIC_STYLESHEET_LINK,
      {
        rel: "preload",
        as: "image",
        href: "/final-stage-logo.webp",
        imageSrcSet: rexonanceImage("/final-stage-logo.webp").srcSet,
        imageSizes: rexonanceImage("/final-stage-logo.webp").sizes,
        fetchPriority: "high",
        type: "image/webp",
      },
    ],
  }),
});
