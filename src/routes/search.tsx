import { createFileRoute } from "@tanstack/react-router";
import { SearchPage } from "@/components/search/search-page";
import { validateSearchState } from "@/components/search/search-state";
import { createWorldHead, WORLD_CORE_STYLESHEET_LINKS } from "@/lib/world-head";
import searchCssUrl from "@/styles-search.css?url";
import stageLibraryCssUrl from "@/styles-stage-library.css?url";

export const Route = createFileRoute("/search")({
  validateSearch: validateSearchState,
  component: SearchRoute,
  head: () =>
    createWorldHead({
      title: "資料検索｜Deception World",
      description:
        "人物、ライダー、物語、世界設定を横断して、ディセプションワールドの公開資料を探す。",
      stylesheetLinks: [
        ...WORLD_CORE_STYLESHEET_LINKS,
        { rel: "stylesheet", href: searchCssUrl },
        // STAGE: the index pages' redesign, scoped to html[data-family="library"].
        { rel: "stylesheet", href: stageLibraryCssUrl },
      ],
    }),
});

function SearchRoute() {
  const { q = "", category = "all", shown = 24 } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <SearchPage
      query={q}
      category={category}
      shown={shown}
      onQueryChange={(query) => {
        void navigate({
          search: (previous) => ({ ...previous, q: query || undefined, shown: undefined }),
          replace: true,
          resetScroll: false,
        });
      }}
      onCategoryChange={(next) => {
        void navigate({
          search: (previous) => ({
            ...previous,
            category: next === "all" ? undefined : next,
            shown: undefined,
          }),
          replace: true,
          resetScroll: false,
        });
      }}
      onShownChange={(next) => {
        void navigate({
          search: (previous) => ({ ...previous, shown: next }),
          replace: true,
          resetScroll: false,
        });
      }}
    />
  );
}
