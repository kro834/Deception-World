import { createFileRoute } from "@tanstack/react-router";
import { GalleryPage } from "@/components/gallery/gallery-page";
import { createWorldHead, WORLD_CORE_STYLESHEET_LINKS } from "@/lib/world-head";
import galleryCssUrl from "@/styles-gallery.css?url";

export const Route = createFileRoute("/gallery")({
  component: GalleryPage,
  head: () =>
    createWorldHead({
      title: "ギャラリー｜Deception World",
      description: "戦いの一瞬から静かな横顔まで、ディセプションワールドのビジュアルを巡る展示室。",
      stylesheetLinks: [...WORLD_CORE_STYLESHEET_LINKS, { rel: "stylesheet", href: galleryCssUrl }],
    }),
});
