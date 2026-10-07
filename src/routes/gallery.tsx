import { createFileRoute } from "@tanstack/react-router";
import { GalleryPage } from "@/components/gallery/gallery-page";
import { createWorldHead, WORLD_CORE_STYLESHEET_LINKS } from "@/lib/world-head";
import galleryCssUrl from "@/styles-gallery.css?url";
import gallerySearchCssUrl from "@/styles-gallery-search.css?url";
import galleryDisplayCssUrl from "@/styles-gallery-display.css?url";
import gallerySharingCssUrl from "@/styles-gallery-sharing.css?url";
import galleryShuffleCssUrl from "@/styles-gallery-shuffle.css?url";
import galleryImageFallbackCssUrl from "@/styles-gallery-image-fallback.css?url";
import exhibitionStudioCssUrl from "@/styles-exhibition-studio.css?url";
import { GALLERY_CURTAIN_STICKERS } from "@/components/gallery/gallery-curtain";

export const Route = createFileRoute("/gallery")({
  component: GalleryPage,
  head: () => {
    const head = createWorldHead({
      title: "ギャラリー｜Deception World",
      description: "戦いの一瞬から静かな横顔まで、ディセプションワールドのビジュアルを巡る展示室。",
      stylesheetLinks: [
        ...WORLD_CORE_STYLESHEET_LINKS,
        { rel: "stylesheet", href: galleryCssUrl },
        { rel: "stylesheet", href: gallerySearchCssUrl },
        { rel: "stylesheet", href: galleryDisplayCssUrl },
        { rel: "stylesheet", href: gallerySharingCssUrl },
        { rel: "stylesheet", href: galleryShuffleCssUrl },
        { rel: "stylesheet", href: galleryImageFallbackCssUrl },
        { rel: "stylesheet", href: exhibitionStudioCssUrl },
      ],
    });
    return {
      ...head,
      meta: [...(head.meta ?? []), { name: "theme-color", content: "#171614" }],
      links: [
        ...(head.links ?? []),
        // A direct visit opens on the curtain: its stickers load with the page.
        ...GALLERY_CURTAIN_STICKERS.map((href) => ({
          rel: "preload",
          as: "image",
          type: "image/webp",
          href,
        })),
      ],
    };
  },
});
