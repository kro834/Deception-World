import { createFileRoute } from "@tanstack/react-router";
import { ArchiveIntelligencePage } from "@/components/world/archive-intelligence-page";
import { createWorldHead, WORLD_STYLESHEET_LINKS } from "@/lib/world-head";
import intelligenceCssUrl from "@/styles-intelligence.css?url";

export const Route = createFileRoute("/intelligence")({
  component: ArchiveIntelligencePage,
  head: () =>
    createWorldHead({
      title: "AIに聞く｜Deception World",
      description:
        "GPT-5.5／GPT-5.6 Terraの会話型サーチと、GPT-5.6 Solによる8つの人格回線を備えたDeception World公式アーカイブ知能。",
      stylesheetLinks: [...WORLD_STYLESHEET_LINKS, { rel: "stylesheet", href: intelligenceCssUrl }],
    }),
});
