// A static three-phase aperture behind the approved portrait. The arrival
// sheet moves the complete plate once; individual paths never animate.
export function RexonanceAperture() {
  return (
    <svg
      className="rxs-aperture"
      viewBox="0 0 720 800"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g className="rxs-aperture-grid">
        <path d="M360 24v736M20 360h680M88 88l544 544M88 632 632 88" />
        <circle cx="360" cy="360" r="318" />
        <circle cx="360" cy="360" r="294" />
        <circle cx="360" cy="360" r="222" />
      </g>
      <g className="rxs-aperture-phase is-ice">
        <path d="M112 233A278 278 0 0 1 591 204" />
        <path d="m112 233-14-8-16 28 14 8M591 204l14-8-16-28-14 8" />
        <path className="rxs-aperture-blade" d="m112 233 47 37 86-115-49-11Z" />
      </g>
      <g className="rxs-aperture-phase is-violet">
        <path d="M624 273a278 278 0 0 1-252 365" />
        <path d="m624 273 16-5 10 31-16 5M372 638v17h-32v-17" />
        <path className="rxs-aperture-blade" d="m624 273-55 23 24 142 34-37Z" />
      </g>
      <g className="rxs-aperture-phase is-gold">
        <path d="M296 631A278 278 0 0 1 82 347" />
        <path d="m296 631-4 16-31-8 4-16M82 347H65v-32h17" />
        <path className="rxs-aperture-blade" d="m296 631 8-60-136-27 16 48Z" />
      </g>
      <g className="rxs-aperture-graduations">
        <path d="M360 34v18m0 616v18M34 360h18m616 0h18M129 129l13 13m436 436 13 13M129 591l13-13m436-436 13-13" />
        <path d="m352 30 8-8 8 8-8 8Zm0 668 8-8 8 8-8 8Z" />
        <path d="M186 722h348m-300 8h252m-196 8h140" />
      </g>
    </svg>
  );
}
