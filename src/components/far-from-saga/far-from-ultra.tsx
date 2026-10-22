import { useEffect, useRef } from "react";
import { FAR_FROM_SAGA } from "@/components/final-stage/final-stage-data";
import { FAR_FROM_STAGE, FAR_FROM_STAGE_VARS } from "@/lib/far-from-stage";
import { mountFarFromUltra } from "@/lib/far-from-ultra";
import {
  FAR_FROM_ULTRA_FIGURE,
  FAR_FROM_ULTRA_PHASES,
  farFromUltraImage,
} from "@/lib/far-from-ultra-art";

/* FAR FROM SAGA — #ultra: the ウルトラ sequence (owner, 2026-10-22).

   The continuation of #suitup after マックス, as its own scroll segment: a
   tall runway whose frame sticks while the scroll scrubs the sequence
   (src/lib/far-from-ultra.ts mounts it; far-from-ultra-scene.ts draws it).
   The whole body turns white, ウルトラ's own nanites generate the added
   parts, and the computer-like auxiliary interfaces deploy outside the arms.

   Nothing here loads a canvas engine on the startup path: the frame holds
   the final still (the owner's ウルトラ with its interfaces) and the マックス
   stand-in as lazy pictures, and the mount imports the scene only once the
   runway is near and only where motion is allowed. Reduced motion, forced
   colours and economy rendering keep the still. */

const STILL = farFromUltraImage("interface");
const START = farFromUltraImage("max");

export function FarFromUltra() {
  const runwayRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => mountFarFromUltra(runwayRef.current), []);
  const ultra = FAR_FROM_SAGA.stages.ultra;
  return (
    <section id="ultra" className="rxs-section ffs-ultra" aria-labelledby="ffs-ultra-title">
      <header className="rxs-section-heading rxs-reveal">
        <p>06 / ULTRA</p>
        <h2 id="ffs-ultra-title">ウルトラ</h2>
        <span>
          マックスから移行する、60秒間の最上位形態。全身が白に染まった後、ウルトラ専用のナノマシンが追加機構を生成し、腕の外側などに補助インターフェースが展開します。
        </span>
      </header>
      <div
        ref={runwayRef}
        className="ffu-runway"
        aria-hidden="true"
        style={{
          [FAR_FROM_STAGE_VARS.height as string]: FAR_FROM_STAGE.height,
          [FAR_FROM_STAGE_VARS.width as string]: FAR_FROM_STAGE.width,
          [FAR_FROM_STAGE_VARS.x as string]: FAR_FROM_STAGE.x,
          [FAR_FROM_STAGE_VARS.bottom as string]: FAR_FROM_STAGE.bottom,
        }}
      >
        <div className="ffu-frame">
          <i className="ffu-light" />
          <i className="ffu-floor" />
          {/* The quiet tiers' still: the final ウルトラ with its interfaces. */}
          <img
            className="ffu-still"
            src={STILL.src}
            srcSet={STILL.srcSet}
            sizes={STILL.sizes}
            alt=""
            width={FAR_FROM_ULTRA_FIGURE.width}
            height={FAR_FROM_ULTRA_FIGURE.height}
            loading="lazy"
            decoding="async"
          />
          {/* While the scene prepares, マックス stands where #suitup left it. */}
          <img
            className="ffu-start"
            src={START.src}
            srcSet={START.srcSet}
            sizes={START.sizes}
            alt=""
            width={FAR_FROM_ULTRA_FIGURE.width}
            height={FAR_FROM_ULTRA_FIGURE.height}
            loading="lazy"
            decoding="async"
          />
          <canvas className="ffu-canvas" width={0} height={0} />
          <div className="ffu-call">
            <p className="ffu-kicker">
              <span>ULTRA</span>
              <span>SPECIAL SEQUENCE</span>
            </p>
            <ol className="ffu-phase">
              {FAR_FROM_ULTRA_PHASES.map(({ phase, step, label }) => (
                <li key={phase} data-phase={phase}>
                  <b>{step}</b>
                  {label}
                </li>
              ))}
            </ol>
            <p className="ffu-hint">
              <span className="ffu-hint-live">スクロールでウルトラへ移行</span>
              <span className="ffu-hint-wait">準備中</span>
              <span className="ffu-hint-static">補助インターフェース展開後</span>
            </p>
          </div>
          <div className="ffu-hud">
            <p className="ffu-readout">
              <b className="ffu-percent">0</b>
              <span>%</span>
            </p>
            <p className="ffu-stamp">
              <span>FAR FROM SAGA</span>
              <b>{ultra.code}</b>
            </p>
          </div>
        </div>
      </div>
      <div className="ffs-copy ffu-copy">
        <p>{ultra.body[0]}</p>
      </div>
      <p className="ffs-note ffu-note">補助インターフェースの表示内容はイメージです。</p>
    </section>
  );
}
