import { createFileRoute } from "@tanstack/react-router";
import { WorldHome } from "@/components/world/world-home";
import "@/styles-world.css";
import "@/styles-world-addon.css";

export const Route = createFileRoute("/world")({ component: WorldHome });
