import { useEffect, useState } from "react";
import {
  BUTTON_STYLE_ATTRIBUTE,
  LENS_MAP_BAR,
  LENS_MAP_CAPSULE,
  LENS_MAP_ROUND,
  LIQUID_LENS_ATTRIBUTE,
  lensSupported,
  liquidButtonsOn,
  watchLiquidPointer,
} from "@/lib/liquid-glass";
import { watchLiquidControls } from "@/lib/liquid-glass-controls";
import { watchLiquidCurvature } from "@/lib/liquid-glass-curvature";
import { watchLiquidHold } from "@/lib/liquid-glass-hold";
import { watchLiquidTone } from "@/lib/liquid-glass-tone";

/* The red channel is bent a little further than green and blue: a faint
   chromatic fringe at the rim, as a thick lens splits white light. These
   three are the fallbacks: a measured control wears its own shape's filter
   (src/lib/liquid-glass-curvature.ts) through --lg-lens. */
const RED_ONLY = "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0";
const GREEN_BLUE = "0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0";

function Lens({ id, map, scale }: { id: string; map: string; scale: number }) {
  return (
    <filter
      id={id}
      x="0"
      y="0"
      width="1"
      height="1"
      primitiveUnits="objectBoundingBox"
      colorInterpolationFilters="sRGB"
    >
      <feImage
        href={map}
        x="0"
        y="0"
        width="1"
        height="1"
        preserveAspectRatio="none"
        result="map"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="map"
        scale={scale}
        xChannelSelector="R"
        yChannelSelector="G"
        result="bent"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="map"
        scale={scale * 1.25}
        xChannelSelector="R"
        yChannelSelector="G"
        result="bentRed"
      />
      <feColorMatrix in="bentRed" type="matrix" values={RED_ONLY} result="red" />
      <feColorMatrix in="bent" type="matrix" values={GREEN_BLUE} result="greenBlue" />
      <feBlend in="red" in2="greenBlue" mode="screen" />
    </filter>
  );
}

/**
 * The liquid glass's SVG lens filters (src/styles-liquid-glass.css), and its
 * pointer light. Renders nothing, and listens to nothing but the option's
 * attribute, while the buttons' liquid style is off.
 */
export function LiquidGlassDefs() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setOn(liquidButtonsOn(document));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: [BUTTON_STYLE_ATTRIBUTE] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!on) return;
    const root = document.documentElement;
    const clearer = window.matchMedia?.("(prefers-reduced-transparency: reduce)").matches;
    if (lensSupported(window) && !clearer) root.setAttribute(LIQUID_LENS_ATTRIBUTE, "");
    const stopPointer = watchLiquidPointer(document);
    // The selection controls' pills, bezels and rail chrome
    // (styles-liquid-glass-controls.css).
    const stopControls = watchLiquidControls(document);
    // The long press: the swell and the light diffusing from the finger.
    const stopHold = watchLiquidHold(document);
    // The curvature: each control's own bezel, its lens (Chromium, after
    // the attribute above is set) and its rim light (liquid-glass-curvature.ts).
    const stopCurvature = watchLiquidCurvature(document);
    // The backdrop under each control: light or dark, busy or plain
    // (liquid-glass-tone.ts), so the glass adapts as Liquid Glass does.
    const stopTone = watchLiquidTone(document);
    return () => {
      stopTone();
      stopPointer();
      stopControls();
      stopHold();
      stopCurvature();
      root.removeAttribute(LIQUID_LENS_ATTRIBUTE);
    };
  }, [on]);

  if (!on) return null;
  return (
    <svg
      className="liquid-glass-defs"
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <defs>
        <Lens id="dw-liquid-lens-capsule" map={LENS_MAP_CAPSULE} scale={0.09} />
        <Lens id="dw-liquid-lens-round" map={LENS_MAP_ROUND} scale={0.2} />
        {/* The bars are wide and short: a small scale bends their ends. */}
        <Lens id="dw-liquid-lens-bar" map={LENS_MAP_BAR} scale={0.02} />
      </defs>
    </svg>
  );
}
