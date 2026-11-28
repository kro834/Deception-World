import { createFileRoute } from "@tanstack/react-router";
import { WorldMap } from "@/components/world-map/world-map";
import { validateMapSearch } from "@/lib/world-map-data";
import { createWorldHead, WORLD_CORE_STYLESHEET_LINKS } from "@/lib/world-head";
import css from "@/styles-world-map.css?url";
import ringArchiveCss from "@/styles-ring-archive.css?url";
type MapRequest = { q?: string; kind?: string; node?: string; source?: string; view?: "list" };

export const Route = createFileRoute("/world-map")({
  // Only the map view needs the graph to resolve aliases and decide which node exists.
  validateSearch: (input: Record<string, unknown>): MapRequest => ({
    q: typeof input.q === "string" ? input.q.slice(0, 120) : undefined,
    kind: typeof input.kind === "string" ? input.kind : undefined,
    node: typeof input.node === "string" ? input.node : undefined,
    source: typeof input.source === "string" ? input.source : undefined,
    view: input.view === "list" ? "list" : undefined,
  }),
  component: WorldMapRoute,
  head: () =>
    createWorldHead({
      title: "世界関係図｜Deception World",
      description: "人物、組織、形態と章を、公開記録の接続から辿る。",
      stylesheetLinks: [
        ...WORLD_CORE_STYLESHEET_LINKS,
        { rel: "stylesheet", href: css },
        // The ring system on this page (2026-11-23), after every older skin.
        { rel: "stylesheet", href: ringArchiveCss },
      ],
    }),
});
function WorldMapRoute() {
  const request = Route.useSearch();
  const search = validateMapSearch(request);
  const navigate = Route.useNavigate();
  return (
    <WorldMap
      {...search}
      listView={request.view === "list"}
      onChange={(patch) =>
        void navigate({
          search: (previous) => ({
            ...validateMapSearch(previous),
            view: previous.view,
            ...patch,
          }),
          replace: Boolean(patch.q !== undefined),
          resetScroll: false,
        })
      }
    />
  );
}
