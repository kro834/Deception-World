import { createFileRoute } from "@tanstack/react-router";
import { LibraryPage } from "@/components/library/library-page";
import { createWorldHead, WORLD_CORE_STYLESHEET_LINKS } from "@/lib/world-head";
import libraryCssUrl from "@/styles-library.css?url";

export const Route = createFileRoute("/library")({
  component: LibraryPage,
  head: () =>
    createWorldHead({
      title: "資料室｜Deception World",
      description:
        "人物資料、夢の章、展示とアーカイブを横断して探す資料室。しおりと最近見た資料から再訪できます。",
      stylesheetLinks: [...WORLD_CORE_STYLESHEET_LINKS, { rel: "stylesheet", href: libraryCssUrl }],
    }),
});
