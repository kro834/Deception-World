import { useEffect, useRef, useState } from "react";
import { GuardedLink } from "@/components/load-gate";
import { ArchiveIntelligenceWorkspace } from "./archive-oracle";
import { SideMenuLayer, SideMenuTrigger } from "./world-chrome";
import { useWorldMode } from "./use-world-mode";

export function ArchiveIntelligencePage() {
  useWorldMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const viewport = window.visualViewport;
    let frame = 0;
    const syncViewport = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const width = viewport?.width ?? window.innerWidth;
        const height = viewport?.height ?? window.innerHeight;
        page.style.setProperty("--archive-viewport-width", `${width}px`);
        page.style.setProperty("--archive-viewport-height", `${height}px`);
        page.style.setProperty("--archive-viewport-left", `${viewport?.offsetLeft ?? 0}px`);
        page.style.setProperty("--archive-viewport-top", `${viewport?.offsetTop ?? 0}px`);
      });
    };

    syncViewport();
    window.addEventListener("resize", syncViewport, { passive: true });
    viewport?.addEventListener("resize", syncViewport, { passive: true });
    viewport?.addEventListener("scroll", syncViewport, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
    };
  }, []);

  return (
    <main ref={pageRef} className="archive-intelligence-page">
      <span className="archive-intelligence-page-grid" aria-hidden="true" />
      <span className="archive-intelligence-page-orbit is-one" aria-hidden="true" />
      <span className="archive-intelligence-page-orbit is-two" aria-hidden="true" />
      <h1 className="visually-hidden">Archive Intelligence — AIに聞く</h1>

      <header className="archive-intelligence-page-header">
        <GuardedLink
          to="/world"
          hash="top"
          assets={[]}
          className="archive-intelligence-page-brand"
          aria-label="Deception Worldへ戻る"
        >
          <span aria-hidden="true">DW</span>
          <div>
            <b>DECEPTION WORLD</b>
            <small>ARCHIVE INTELLIGENCE</small>
          </div>
        </GuardedLink>

        <div className="archive-intelligence-page-models" aria-label="使用AIモデル">
          <span>
            <i aria-hidden="true" /> SEARCH <b>5.6 LUNA</b>
          </span>
          <span>
            <i aria-hidden="true" /> PRO <b>5.6 SOL</b>
          </span>
        </div>

        <SideMenuTrigger
          open={menuOpen}
          onOpenChange={setMenuOpen}
          className="archive-intelligence-page-menu"
        />
      </header>

      <div className="archive-intelligence-page-stage">
        <ArchiveIntelligenceWorkspace active />
      </div>

      <SideMenuLayer context="intelligence" open={menuOpen} onOpenChange={setMenuOpen} />
    </main>
  );
}
