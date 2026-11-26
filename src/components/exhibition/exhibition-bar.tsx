import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { SideMenuLayer, SideMenuTrigger } from "@/components/world/world-chrome";

// The exhibition room's header (2026-11-26, owner: every page shares one header
// layout and one menu button). It is the gallery's bar: the same
// header.gallery-topbar, so the unified grammar (styles-chrome-unify.css), the
// iPad launcher and the gold family colour all apply as on /gallery and
// /gallery-tours. Its box lives in styles-exhibition-bar.css.
export function ExhibitionBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <>
      <header className="gallery-topbar">
        <Link className="gallery-brand" to="/world">
          DECEPTION WORLD<span>EXHIBITION ROOM</span>
        </Link>
        <div className="gallery-topbar-actions">
          <Link to="/gallery">ギャラリーへ</Link>
          <SideMenuTrigger open={menuOpen} onOpenChange={setMenuOpen} />
        </div>
      </header>
      <SideMenuLayer context="gallery" open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
}
