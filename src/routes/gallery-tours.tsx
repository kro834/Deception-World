import { createFileRoute } from "@tanstack/react-router";
import { GalleryToursPage } from "@/components/gallery-tours/tours-page";
import { normalizeTourSearch } from "@/components/gallery-tours/tour-data";
import { createWorldHead, WORLD_CORE_STYLESHEET_LINKS } from "@/lib/world-head";
import galleryCssUrl from "@/styles-gallery.css?url";
import toursCssUrl from "@/styles-gallery-tours.css?url";
import entranceCssUrl from "@/styles-gallery-tour-entrance.css?url";
import theatreCssUrl from "@/styles-gallery-tour-theatre.css?url";

export const Route = createFileRoute("/gallery-tours")({
  validateSearch: normalizeTourSearch,
  component: GalleryToursRoute,
  head: () => {
    const head = createWorldHead({
      title: "展示ツアー｜Deception World",
      description:
        "星の光、雨の動き、静かな横顔。テーマを選んで、ディセプションワールドの作品をゆっくり巡る展示ツアー。",
      stylesheetLinks: [
        ...WORLD_CORE_STYLESHEET_LINKS,
        { rel: "stylesheet", href: galleryCssUrl },
        { rel: "stylesheet", href: toursCssUrl },
        { rel: "stylesheet", href: entranceCssUrl },
        { rel: "stylesheet", href: theatreCssUrl },
      ],
    });
    return { ...head, meta: [...(head.meta ?? []), { name: "theme-color", content: "#171614" }] };
  },
});

function GalleryToursRoute() {
  const { tour, work } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <GalleryToursPage
      tourId={tour}
      workId={work}
      onSelect={(tourId, workId, replace) => {
        void navigate({ search: { tour: tourId, work: workId }, replace, resetScroll: !replace });
      }}
      onExit={() => {
        void navigate({ search: {}, resetScroll: true });
      }}
    />
  );
}
