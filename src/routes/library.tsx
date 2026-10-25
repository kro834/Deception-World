import { createFileRoute } from "@tanstack/react-router";
import { LibraryPage } from "@/components/library/library-page";
import { createWorldHead, WORLD_CORE_STYLESHEET_LINKS } from "@/lib/world-head";
import libraryCssUrl from "@/styles-library.css?url";
import inquiryCssUrl from "@/styles-library-inquiry.css?url";
import stageLibraryCssUrl from "@/styles-stage-library.css?url";
import zenithLibraryCssUrl from "@/styles-library-zenith.css?url";
import atelierLibraryCssUrl from "@/styles-library-atelier.css?url";
import { getInquiryGuide } from "@/lib/inquiry-guides";
import { validateLibraryBrowseSearch } from "@/lib/library-browse-state";

export const Route = createFileRoute("/library")({
  validateSearch: validateLibraryBrowseSearch,
  component: LibraryRoute,
  head: () =>
    createWorldHead({
      title: "資料室｜Deception World",
      description:
        "人物資料、夢の章、展示とアーカイブを横断して探す資料室。しおりと最近見た資料から再訪できます。",
      stylesheetLinks: [
        ...WORLD_CORE_STYLESHEET_LINKS,
        { rel: "stylesheet", href: libraryCssUrl },
        { rel: "stylesheet", href: inquiryCssUrl },
        // STAGE: the index pages' redesign, scoped to html[data-family="library"].
        { rel: "stylesheet", href: stageLibraryCssUrl },
        // ZENITH (2026-10-21): the brush-up on top of STAGE, same scope.
        { rel: "stylesheet", href: zenithLibraryCssUrl },
        // Route-local editorial layout, after every shared index skin.
        { rel: "stylesheet", href: atelierLibraryCssUrl },
      ],
    }),
});

function LibraryRoute() {
  const { guide, q = "", kind = "all", scope = "all" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <LibraryPage
      guide={guide}
      query={q}
      kind={kind}
      scope={scope}
      onBrowseChange={(next, { replace = true } = {}) => {
        return navigate({
          search: (previous) => validateLibraryBrowseSearch({ ...previous, ...next }),
          hash: true,
          replace,
          resetScroll: false,
        });
      }}
      onGuideChange={(id) => {
        const next = getInquiryGuide(id);
        if (next || id === "")
          void navigate({
            search: (previous) => ({ ...previous, guide: next?.id }),
            hash: true,
            resetScroll: false,
          });
      }}
    />
  );
}
