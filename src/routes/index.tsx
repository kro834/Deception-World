import { createFileRoute } from "@tanstack/react-router";
import { TitleSequence } from "@/components/cinematic/title-sequence";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <TitleSequence />;
}
