import { createFileRoute } from "@tanstack/react-router";
import { LejasPage } from "@/components/world/lejas-page";
import "@/styles-world.css";
import "@/styles-world-addon.css";

export const Route = createFileRoute("/managers/lejas")({ component: LejasPage });
