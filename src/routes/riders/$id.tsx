import { createFileRoute, notFound } from "@tanstack/react-router";
import { RiderPage } from "@/components/world/rider-page";
import { createRiderHead, isRiderRouteId } from "@/lib/world-head";

export const Route = createFileRoute("/riders/$id")({
  beforeLoad: ({ params }) => {
    if (!isRiderRouteId(params.id)) throw notFound();
  },
  component: RiderRoute,
  head: ({ params }) => createRiderHead(params.id),
});

function RiderRoute() {
  const { id } = Route.useParams();
  return <RiderPage id={id} />;
}
