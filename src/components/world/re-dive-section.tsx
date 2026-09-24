import { forwardRef, memo } from "react";
import { GuardedLink } from "@/components/load-gate";
import { MANAGER_ASSETS } from "@/lib/asset-loader";
import { cielThumbnail, managerThumbnail } from "@/lib/thumbnail-images";
import { RE_DIVE_RIKUEI_NAV } from "./dossier-nav";
import { RISING_CALM_CHAR, RISING_CALM_EDGES } from "./rising-art";

/* RE DIVE: the World after it burned. Reached from the end of RISING THE
   WORLD (the RE DIVE…? button and its transition, rising-world.tsx and
   re-dive-sequence.ts), it sits right after the gate and is rendered only once
   it has been unlocked, so the page carries none of it before that.

   The box is the Deception World archive's 六詠 box with the same markup and
   classes (.threat-panel, .signal …), so every edition's styling applies:
   I is シエル (月城悠真), with his own illustration on the card and his own
   page (ciel-page.tsx), II, IV and V are the archive's own cards, and III
   and VI are 欠番 (vacant). */

export const RE_DIVE_SECTION_ID = "re-dive";

// シエル's page (/characters/ciel).
const CIEL = RE_DIVE_RIKUEI_NAV[0];

function VacantSignal({ numeral, delay }: { numeral: string; delay: string }) {
  return (
    <div
      className="signal is-vacant"
      role="img"
      aria-label={`六詠${numeral} 欠番`}
      style={{ ["--delay" as string]: delay }}
    >
      <span>{numeral}</span>
      <i />
      <b>欠番</b>
    </div>
  );
}

type ReDiveSectionProps = {
  /** A card was opened: the World restores this section on the way back. */
  onLeave: () => void;
};

export const ReDiveSection = memo(
  forwardRef<HTMLElement, ReDiveSectionProps>(function ReDiveSection({ onLeave }, ref) {
    return (
      <section
        ref={ref}
        id={RE_DIVE_SECTION_ID}
        className="re-dive-section"
        aria-labelledby="re-dive-title"
        tabIndex={-1}
      >
        <div className="re-dive-ground" aria-hidden="true">
          <span className="re-dive-char" style={{ backgroundImage: `url(${RISING_CALM_CHAR})` }} />
          <span
            className="re-dive-edge"
            style={{ backgroundImage: `url(${RISING_CALM_EDGES[0]})` }}
          />
          <span className="re-dive-embers" />
        </div>
        <div className="threat-panel re-dive-archive">
          <div className="threat-copy">
            <span className="system-label">MANAGER ARCHIVE</span>
            <h3 id="re-dive-title">
              SIX SIGNALS
              <br />
              ABOVE THE WORLD.
            </h3>
          </div>
          <div className="signal-column">
            <p className="re-dive-tab" aria-hidden="true">
              <small>FRONT / 01</small>
              <b>六詠</b>
            </p>
            <div className="manager-archive-panel is-managers">
              <div className="manager-slot-grid signal-array" aria-label="六詠を示す6つのシグナル">
                <GuardedLink
                  className="signal has-visual is-accessible ciel-signal"
                  to={CIEL.href ?? "/characters/ciel"}
                  assets={CIEL.assets}
                  style={{ ["--delay" as string]: "0s" }}
                  beforeNavigate={onLeave}
                  aria-label="六詠I シエルの個別資料を開く"
                >
                  <img
                    src="/ciel-thumb-20260924.jpeg"
                    {...cielThumbnail()}
                    alt="シエルのキャラクタービジュアル"
                    width={640}
                    height={800}
                    style={{ objectPosition: "50% 0%" }}
                    loading="lazy"
                    decoding="async"
                  />
                  <span>I</span>
                  <i />
                  <small>OPEN DOSSIER</small>
                  <b>シエル</b>
                  <em className="signal-apex" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M12 1.5 14.4 9.6 22.5 12l-8.1 2.4L12 22.5l-2.4-8.1L1.5 12l8.1-2.4L12 1.5Z" />
                    </svg>
                  </em>
                </GuardedLink>
                <GuardedLink
                  className="signal has-visual is-accessible"
                  to="/managers/rex-loi"
                  assets={MANAGER_ASSETS["rex-loi"]}
                  style={{ ["--delay" as string]: "0.16s" }}
                  beforeNavigate={onLeave}
                  aria-label="六詠II レックス・ロワの個別資料を開く"
                >
                  <img
                    src="/manager-rex-loi-thumb.jpeg"
                    {...managerThumbnail("rex-loi")}
                    alt="レックス・ロワのキャラクタービジュアル"
                    width={640}
                    height={960}
                    style={{ objectPosition: "50% 0%" }}
                    loading="lazy"
                    decoding="async"
                  />
                  <span>II</span>
                  <i />
                  <small>OPEN DOSSIER</small>
                  <b>レックス・ロワ</b>
                </GuardedLink>
                <VacantSignal numeral="III" delay="0.32s" />
                <GuardedLink
                  className="signal has-visual is-accessible lejas-signal"
                  to="/managers/lejas"
                  assets={MANAGER_ASSETS.lejas}
                  style={{ ["--delay" as string]: "0.48s" }}
                  beforeNavigate={onLeave}
                  aria-label="六詠IV レジャスの個別資料を開く"
                >
                  <img
                    src="/manager-lejas-portrait-thumb.jpeg"
                    {...managerThumbnail("lejas-portrait")}
                    alt="レジャスの顔アップ"
                    width={640}
                    height={799}
                    style={{ objectPosition: "50% 8%", objectFit: "cover" }}
                    loading="lazy"
                    decoding="async"
                  />
                  <span>IV</span>
                  <i />
                  <small>OPEN DOSSIER</small>
                  <b>レジャス</b>
                </GuardedLink>
                <GuardedLink
                  className="signal has-visual is-accessible is-face-safe"
                  to="/managers/opus"
                  assets={MANAGER_ASSETS.opus}
                  style={{ ["--delay" as string]: "0.64s" }}
                  beforeNavigate={onLeave}
                  aria-label="六詠V オパスの個別資料を開く"
                >
                  <img
                    src="/manager-opus-thumb.jpeg"
                    {...managerThumbnail("opus")}
                    alt="オパスのキャラクタービジュアル"
                    width={640}
                    height={851}
                    style={{ objectPosition: "50% 0%" }}
                    loading="lazy"
                    decoding="async"
                  />
                  <span>V</span>
                  <i />
                  <small>OPEN DOSSIER</small>
                  <b>オパス</b>
                </GuardedLink>
                <VacantSignal numeral="VI" delay="0.8s" />
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }),
);
