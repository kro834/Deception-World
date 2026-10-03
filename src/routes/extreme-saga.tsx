import { createFileRoute } from "@tanstack/react-router";
import { ExtremeSaga } from "@/components/extreme-saga/extreme-saga";
import {
  WORLD_CORE_STYLESHEET_LINKS as WORLD_STYLESHEET_LINKS,
  CINEMATIC_STYLESHEET_LINK,
  DOSSIER_HUD_FONTS_URL,
} from "@/lib/world-head";
import extremeSagaCssUrl from "@/styles-extreme-saga.css?url";
import rexonanceSagaCssUrl from "@/styles-rexonance-saga.css?url";
import sagaShowcaseCssUrl from "@/styles-saga-showcase.css?url";
import showcaseElevationCssUrl from "@/styles-showcase-elevation.css?url";
import showcaseCinemaCssUrl from "@/styles-showcase-cinema.css?url";
import motionEditionCssUrl from "@/styles-motion-edition.css?url";
import extremeEditionCssUrl from "@/styles-extreme-edition.css?url";
import extremeOverdriveCssUrl from "@/styles-extreme-overdrive.css?url";

export const Route = createFileRoute("/extreme-saga")({
  component: ExtremeSaga,
  head: () => ({
    meta: [
      { title: "エクスプリームサーガ｜Deception World" },
      {
        name: "description",
        content:
          "殴り合い、歓迎。戦うほど勝ち筋が増すエクスプリームサーガの公式特設サイト。標準性能と専用P14、ディルクルムサーガ／ヴィンクルムサーガとのカタログ比較を、負けた欄まで隠さず並べています。",
      },
      { property: "og:title", content: "エクスプリームサーガ｜Deception World" },
      {
        property: "og:description",
        content: "殴り合い、歓迎。長引くほど、こっちのもの。エクスプリームサーガ公式特設サイト。",
      },
      { property: "og:image", content: "/saga-extreme-middle.jpeg" },
    ],
    links: [
      ...WORLD_STYLESHEET_LINKS,
      { rel: "stylesheet", href: rexonanceSagaCssUrl },
      { rel: "stylesheet", href: extremeSagaCssUrl },
      { rel: "stylesheet", href: sagaShowcaseCssUrl },
      { rel: "stylesheet", href: DOSSIER_HUD_FONTS_URL },
      { rel: "stylesheet", href: showcaseElevationCssUrl },
      { rel: "stylesheet", href: showcaseCinemaCssUrl },
      { rel: "stylesheet", href: motionEditionCssUrl },
      { rel: "stylesheet", href: extremeEditionCssUrl },
      { rel: "stylesheet", href: extremeOverdriveCssUrl },
      CINEMATIC_STYLESHEET_LINK,
      {
        rel: "preload",
        as: "image",
        href: "/saga-extreme-middle.webp",
        fetchPriority: "high",
        type: "image/webp",
      },
    ],
  }),
});
