import { createFileRoute } from "@tanstack/react-router";
import { LibraryPage } from "@/components/library/library-page";
import { createWorldHead, WORLD_CORE_STYLESHEET_LINKS } from "@/lib/world-head";
import libraryCssUrl from "@/styles-library.css?url";
import inquiryCssUrl from "@/styles-library-inquiry.css?url";
import stageLibraryCssUrl from "@/styles-stage-library.css?url";
import { getInquiryGuide, validateInquirySearch } from "@/lib/inquiry-guides";

export const Route = createFileRoute("/library")({
  validateSearch: validateInquirySearch,
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
      ],
    }),
});

function LibraryRoute() {
  const { guide } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <LibraryPage
      guide={guide}
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
