import { createFileRoute } from "@tanstack/react-router";
import { TitleSequence } from "@/components/cinematic/title-sequence";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    links: [
      { rel: "preload", as: "image", href: "/logo-title.jpg" },
      { rel: "preload", as: "image", href: "/atmosphere-poster.jpg" },
    ],
  }),
});

function Home() {
  return <TitleSequence />;
}
