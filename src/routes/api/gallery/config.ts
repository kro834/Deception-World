import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/gallery/config")({
  server: {
    handlers: {
      GET: async () => {
        const { getGalleryConfig } = await import("@/lib/gallery.server");
        return getGalleryConfig();
      },
    },
  },
});
