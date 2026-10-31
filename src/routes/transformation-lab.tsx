import { createFileRoute } from "@tanstack/react-router";
import { TransformationLab } from "@/components/transformation-lab/transformation-lab";
import cssUrl from "@/styles-transformation-lab.css?url";
import { WORLD_CORE_STYLESHEET_LINKS } from "@/lib/world-head";
export const Route = createFileRoute("/transformation-lab")({
  component: TransformationLab,
  head: () => ({
    meta: [
      { title: "変身・フォーム研究室｜Deception World" },
      {
        name: "description",
        content:
          "レクソナンス、ファーフロム、イリュージョンクルム、メタ・ウニタスの変身を再生・逆再生・比較。",
      },
    ],
    links: [...WORLD_CORE_STYLESHEET_LINKS, { rel: "stylesheet", href: cssUrl }],
  }),
});
