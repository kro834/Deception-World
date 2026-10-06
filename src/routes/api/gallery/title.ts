import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/gallery/title")({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        const { galleryRoute, patchGalleryTitle } = await import("@/lib/gallery.server");
        return galleryRoute(() => patchGalleryTitle(request));
      },
    },
  },
});
