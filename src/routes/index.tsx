import { createFileRoute } from "@tanstack/react-router";
import { TitleSequence } from "@/components/cinematic/title-sequence";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    links: [
      {
        rel: "preload",
        as: "image",
        type: "image/webp",
        href: "/logo-title-20260915.webp",
        crossOrigin: "anonymous",
        fetchPriority: "high",
      },
      { rel: "preload", as: "image", href: "/atmosphere-poster.jpg" },
    ],
  }),
});

function Home() {
  return <TitleSequence />;
}
