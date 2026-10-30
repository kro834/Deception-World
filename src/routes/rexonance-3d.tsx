import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GuardedLink } from "@/components/load-gate";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";
import { RexonanceViewer, REXONANCE_3D_POSTER } from "@/components/rexonance-3d/rexonance-viewer";
import { REXONANCE_SAGA_ENTER_ASSETS } from "@/lib/asset-loader";
import { guardDogsArchiveNavigation } from "@/lib/dogs-archive/touch-guard";
import { createWorldHead, WORLD_CORE_STYLESHEET_LINKS } from "@/lib/world-head";
import rexonance3dCss from "@/styles-rexonance-3d.css?url";

export const Route = createFileRoute("/rexonance-3d")({
  component: Rexonance3d,
  head: () =>
    createWorldHead({
      title: "REXONANCE 3D｜Deception World",
      description:
        "レクソナンスサーガを、立体で。十面の設定画から起こした黒鱗と金の装甲、結晶の翼を、あらゆる角度から。",
      image: REXONANCE_3D_POSTER,
      stylesheetLinks: [
        ...WORLD_CORE_STYLESHEET_LINKS,
        { rel: "stylesheet", href: rexonance3dCss },
      ],
    }),
});

function Rexonance3d() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-rexonance-3d", "true");
    // Orbiting from the screen's edge must not become Safari's history swipe.
    const release = guardDogsArchiveNavigation(document);
    return () => {
      release();
      root.removeAttribute("data-rexonance-3d");
    };
  }, []);

  return (
    <main className="rx3d" id="main">
      <SideMenuLayer context="archive" open={menuOpen} onOpenChange={setMenuOpen} />
      <header className="rx3d-header">
        <h1>REXONANCE 3D</h1>
        <div className="rx3d-header-actions">
          <GuardedLink to="/world" assets={[]} aria-label="Deception Worldへ戻る" className="rx3d-exit">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m14 5-7 7 7 7M7 12h14"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>世界へ戻る</span>
          </GuardedLink>
          <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
        </div>
      </header>
      <section
        className="rx3d-stage"
        id="rexonance-3d-stage"
        aria-labelledby="rexonance-3d-title"
        tabIndex={-1}
      >
        <div className="rx3d-record">
          <h2 id="rexonance-3d-title">レクソナンスサーガ</h2>
          <p>立体模型</p>
          <GuardedLink
            to="/rexonance-saga"
            hash="top"
            assets={REXONANCE_SAGA_ENTER_ASSETS}
            className="rx3d-record-link"
          >
            特設サイトへ <span aria-hidden="true">↗</span>
          </GuardedLink>
        </div>
        <RexonanceViewer />
      </section>
    </main>
  );
}
