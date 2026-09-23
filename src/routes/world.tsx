import { createFileRoute } from "@tanstack/react-router";
import { WorldHome } from "@/components/world/world-home";
import { createWorldHead, WORLD_STYLESHEET_LINKS } from "@/lib/world-head";
import { WORLD_ENTER_ASSETS } from "@/lib/asset-loader";
import worldProgrammeCssUrl from "@/styles-world-programme.css?url";
import worldProgrammeSectionsCssUrl from "@/styles-world-programme-sections.css?url";
import worldNeoCssUrl from "@/styles-world-neo.css?url";
import motionEditionCssUrl from "@/styles-motion-edition.css?url";
import otherArtworkCssUrl from "@/styles-other-artwork.css?url";
import worldMirageCssUrl from "@/styles-world-mirage.css?url";
import { MIRAGE_BOOT_GATE_SCRIPT } from "@/lib/mirage-boot-gate";

// Michroma carries the Mirage HUD labels. The subset holds only the capitals,
// digits and separators those labels use (about 3.5 KB).
const MIRAGE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Michroma&display=swap&text=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%2F-.%3A%2B%23%25%26%C2%B7%7C%3C%3E%20";

export const Route = createFileRoute("/world")({
  component: WorldHome,
  head: () => {
    const head = createWorldHead({
      title: "Deception World｜仮面ライダーサーガ",
      description:
        "六人の最上位管理人と八人のライダーが交差する、劇場版第二作『Deception World』公式記録サイト。",
      image: "/deception-world-poster.jpeg",
      stylesheetLinks: [
        ...WORLD_STYLESHEET_LINKS,
        { rel: "stylesheet", href: worldProgrammeCssUrl },
        { rel: "stylesheet", href: worldProgrammeSectionsCssUrl },
        { rel: "stylesheet", href: worldNeoCssUrl },
        { rel: "stylesheet", href: motionEditionCssUrl },
        { rel: "stylesheet", href: otherArtworkCssUrl },
        { rel: "stylesheet", href: MIRAGE_FONTS_URL },
        { rel: "stylesheet", href: worldMirageCssUrl },
      ],
    });
    return {
      ...head,
      // Runs while the HTML is parsed, before the first paint of the boot.
      scripts: [{ children: MIRAGE_BOOT_GATE_SCRIPT }],
      links: [
        ...head.links,
        {
          rel: "preload",
          as: "image",
          type: "image/webp",
          href: WORLD_ENTER_ASSETS[0],
          fetchPriority: "high",
        },
      ],
    };
  },
});
