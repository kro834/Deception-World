import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/gallery/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { galleryRoute } = await import("@/lib/gallery.server");
        const { initGalleryUpload } = await import("@/lib/gallery-upload.server");
        return galleryRoute(() => initGalleryUpload(request));
      },
    },
  },
});
