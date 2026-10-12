// Compositor-only street for Save-Data/no-WebGL. No external image or 3D bundle
// is needed, and reduced-motion users never see its camera movement.
export function RainCityFallback() {
  return (
    <div data-opening-city-fallback>
      <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="rain-city-sky" x2="0" y2="1">
            <stop stopColor="#02050d" />
            <stop offset="1" stopColor="#162538" />
          </linearGradient>
          <linearGradient id="rain-city-road" x2="0" y2="1">
            <stop stopColor="#3e535d" />
            <stop offset="1" stopColor="#080e17" />
          </linearGradient>
        </defs>
        <path fill="url(#rain-city-sky)" d="M0 0h1200v800H0z" />
        <path fill="url(#rain-city-road)" d="M530 410h140l530 390H0z" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <g key={i} opacity={1 - i * 0.075}>
            <path
              fill="#182732"
              stroke="#3c4f59"
              strokeWidth="2"
              d={`M${i * 78 - 110} 800V${50 + i * 48}l70 -12 4 35 24 -9 5 24 27 -8V${670 - i * 35}Z`}
            />
            <path
              fill="#14232d"
              stroke="#354751"
              strokeWidth="2"
              d={`M${1310 - i * 78} 800V${20 + i * 52}l-55 12 -9 28 -30 -17 -3 35 -28 -8V${670 - i * 35}Z`}
            />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((f) => (
              <g key={f} stroke="#566974" opacity=".35" strokeWidth="3">
                <path
                  d={`M${i * 78 - 110} ${150 + i * 40 + f * 40}h125M${1185 - i * 78} ${135 + i * 40 + f * 40}h125`}
                />
              </g>
            ))}
          </g>
        ))}
        <g stroke="#8a9c9f" opacity=".2">
          <path d="m590 430-80 370m100-370 80 370M570 440 70 800m560-360 500 360" />
        </g>
        <g fill="#e2af73">
          <path d="M210 368h45v5h-45zM945 355h40v5h-40zM400 405h24v3h-24zM780 400h24v3h-24z" />
        </g>
        <g stroke="#dfaa69" strokeWidth="5" opacity=".18">
          <path d="m225 570-65 200m802-210 100 240M410 475l-22 90m402-100 32 120" />
        </g>
      </svg>
      <i />
    </div>
  );
}
