import { createFileRoute } from "@tanstack/react-router";
import { WorldHome } from "@/components/world/world-home";
import { createWorldHead } from "@/lib/world-head";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";

export const Route = createFileRoute("/world")({
  component: WorldHome,
  head: () => {
    const head = createWorldHead({
      title: "Deception World｜仮面ライダーサーガ",
      description:
        "六人の最上位管理人と八人のライダーが交差する、劇場版第二作『Deception World』公式記録サイト。",
      image: "/deception-world-poster.jpeg",
    });
    return {
      ...head,
      links: [
        ...head.links,
        { rel: "preload", as: "image", type: "image/webp", href: WORLD_ENTER_ASSETS[0], fetchPriority: "high" },
      ],
    };
  },
});
