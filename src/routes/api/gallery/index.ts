import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/gallery/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { galleryRoute, getGallery } = await import("@/lib/gallery.server");
        return galleryRoute(() => getGallery(request));
      },
      POST: async ({ request }) => {
        const { galleryRoute, postGallery } = await import("@/lib/gallery.server");
        return galleryRoute(() => postGallery(request));
      },
    },
  },
});
