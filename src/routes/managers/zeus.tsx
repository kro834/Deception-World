import { createFileRoute } from "@tanstack/react-router";
import { validateInquirySearch } from "@/lib/inquiry-guides";
import { ManagerStub, ZEUS } from "@/components/world/manager-stub";
import {
  DOSSIER_ZENITH_STYLESHEET_LINK,
  STAGE_DOSSIER_STYLESHEET_LINK,
  TABLET_DOSSIER_STYLESHEET_LINK,
  WORLD_STYLESHEET_LINKS,
  createWorldHead,
} from "@/lib/world-head";
import sovereignFileCssUrl from "@/styles-sovereign-file.css?url";

export const Route = createFileRoute("/managers/zeus")({
  validateSearch: validateInquirySearch,
  component: () => <ManagerStub profile={ZEUS} />,
  head: () =>
    createWorldHead({
      title: "ゼウス｜六詠資料｜Deception World",
      description: "六詠第一位、主権の管理人ゼウスの人物・能力記録。",
      image: "/manager-zeus-detail.jpeg?v=20260823-2",
      // The sovereign file keeps its own edition (not the dossier sheets):
      // the World sheets, the shared STAGE dossier, then its own sheet, and
      // the shared ZENITH brush-up (the roster rail) after it.
      stylesheetLinks: [
        ...WORLD_STYLESHEET_LINKS,
        STAGE_DOSSIER_STYLESHEET_LINK,
        { rel: "stylesheet", href: sovereignFileCssUrl },
        TABLET_DOSSIER_STYLESHEET_LINK,
        DOSSIER_ZENITH_STYLESHEET_LINK,
      ],
    }),
});
