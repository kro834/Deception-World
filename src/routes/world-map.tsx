import { createFileRoute } from "@tanstack/react-router";
import { WorldMap } from "@/components/world-map/world-map";
import { validateMapSearch } from "@/lib/world-map-data";
import { createWorldHead, WORLD_CORE_STYLESHEET_LINKS } from "@/lib/world-head";
import css from "@/styles-world-map.css?url";
export const Route = createFileRoute("/world-map")({
  validateSearch: validateMapSearch,
  component: WorldMapRoute,
  head: () =>
    createWorldHead({
      title: "世界関係図｜Deception World",
      description: "人物、組織、形態と章を、公開記録の接続から辿る。",
      stylesheetLinks: [...WORLD_CORE_STYLESHEET_LINKS, { rel: "stylesheet", href: css }],
    }),
});
function WorldMapRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <WorldMap
      {...search}
      onChange={(patch) =>
        void navigate({
          search: (previous) => ({ ...validateMapSearch(previous), ...patch }),
          replace: Boolean(patch.q !== undefined),
          resetScroll: false,
        })
      }
    />
  );
}
