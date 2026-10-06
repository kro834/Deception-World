import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/gallery/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const { galleryRoute, setGalleryDeleted } = await import("@/lib/gallery.server");
        return galleryRoute(() => setGalleryDeleted(request, params.id, true));
      },
    },
  },
});
