import { createFileRoute } from "@tanstack/react-router";
import { RelatedPage } from "@/components/world/related-page";
import "@/styles-world.css";
import "@/styles-world-addon.css";

export const Route = createFileRoute("/characters/luna")({
  component: () => <RelatedPage id="luna" />,
});
