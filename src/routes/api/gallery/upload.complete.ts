import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/gallery/upload/complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { galleryRoute } = await import("@/lib/gallery.server");
        const { completeGalleryUpload } = await import("@/lib/gallery-upload.server");
        return galleryRoute(() => completeGalleryUpload(request));
      },
    },
  },
});
