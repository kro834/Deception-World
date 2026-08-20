import { createFileRoute } from "@tanstack/react-router";
import { RiderPage } from "@/components/world/rider-page";
import "@/styles-world.css";
import "@/styles-world-addon.css";

export const Route = createFileRoute("/riders/$id")({
  component: RiderRoute,
});

function RiderRoute() {
  const { id } = Route.useParams();
  return <RiderPage id={id} />;
}
