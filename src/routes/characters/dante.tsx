import { createFileRoute } from "@tanstack/react-router";
import { DantePage } from "@/components/world/dante-page";
import { createWorldHead, DOSSIER_STYLESHEET_LINKS } from "@/lib/world-head";
import danteCss from "@/styles-dante.css?url";
import characterReadingCssUrl from "@/styles-character-reading-tools.css?url";

export const Route = createFileRoute("/characters/dante")({
  component: DantePage,
  head: () =>
    createWorldHead({
      title: "ダンテ／ヴァルグ｜第二の犬・人物資料｜Deception World",
      description:
        "第二の犬・ヴァルグと宿主ダンテの統合人物録。原圧をはじめとする8つの能力、外見・性格・戦闘記録と、仮面ライダールーラーのポラリス／エニグマ両モード。",
      image: "/character-dante.webp",
      stylesheetLinks: [
        ...DOSSIER_STYLESHEET_LINKS,
        { rel: "stylesheet", href: danteCss },
        { rel: "stylesheet", href: characterReadingCssUrl },
      ],
    }),
});
