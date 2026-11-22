// PROTOTYPE scratch route (2026-11-23): six concepts for the side menu and
// the dossier, for the owner to choose from. Not linked from any page and
// not a default anywhere; remove once the chosen concepts are implemented.
import { createFileRoute } from "@tanstack/react-router";
import { RingProto } from "@/components/ring-proto/ring-proto";
import css from "@/components/ring-proto/proto.css?url";

type ProtoSearch = { c?: string; id?: string; open?: string; part?: string };

export const Route = createFileRoute("/ring-proto")({
  validateSearch: (input: Record<string, unknown>): ProtoSearch => ({
    c: typeof input.c === "string" ? input.c : undefined,
    id: typeof input.id === "string" ? input.id : undefined,
    open: typeof input.open === "string" ? input.open : undefined,
    part: typeof input.part === "string" ? input.part : undefined,
  }),
  component: RingProtoRoute,
  head: () => ({
    meta: [{ title: "ring proto" }, { name: "robots", content: "noindex" }],
    links: [{ rel: "stylesheet", href: css }],
  }),
});

function RingProtoRoute() {
  const search = Route.useSearch();
  return <RingProto concept={search.c ?? "m1"} riderId={search.id ?? "saga"} part={search.part} />;
}
