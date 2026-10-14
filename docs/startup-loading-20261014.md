# Startup loading checkpoint (2026-10-14)

The owner requested faster startup/loading, then specified that Rexonance must
remain unchanged and asked to wrap up the current work. No further optimization
work is included after that request.

## Final scope

- On `/` only, omit four unused pickup/record UI sheets and replace the full
  launcher stylesheet with its exact shared-token block. The complete launcher
  CSS is warmed at low priority in the existing 650ms idle World preparation.
  Every other route keeps its complete stylesheet list and cascade order.
- Preserve current main's independently added variable/core/display font delivery
  (`35f9814`) without modification. The experimental opening-only glyph subset
  was withdrawn rather than overwrite the other chat's work or retain competing
  font definitions on client-side navigation.
- Rexonance code, artwork, warmup/page preload, clocks, root call stylesheet and
  its current full shared head are unchanged relative to main35f9814. Earlier
  tentative Rexonance changes were fully reverted before integration.
- Owner copy, fonts, animation clocks, IMPACT/VS, hidden EXCELSIOR and rail
  long-press/vertical-scroll contracts are untouched by this CSS-only addition.

## Evidence and limits

- Built HTML at current main35f9814 versus final candidate: first-party blocking
  CSS 391,533 → 320,170 bytes (18.2% reduction); 21 → 17 stylesheet requests.
  External font styles are excluded from that byte figure and retain main's URLs.
- The earlier experiment measured FCP908 → 644ms and mounted controls2061 →1779ms
  in three AB/BA samples (390×844 DPR3, CPU4, 60ms latency, 9Mbps, fresh contexts).
  Those values include the subsequently withdrawn glyph-subset experiment and
  are not reported as the final integrated version's speed gain. No universal
  or physical-device speed claim is made; total post-startup bytes are distinct
  from render-blocking startup bytes.
- Final gates: npm test2228 pass / fail0 / existing skip4; TypeScript passed;
  ESLint0errors /12existing warnings; source-parts15groups; Vite build passed.
- Final Chrome320/390/844/1024/1440 checks passed: actual Japanese font loaded,
  same face/size/weight/spacing and glyph bounds within1px, zero overflow,
  World full launcher/font arrival, menu operation and browser Back.
- The prior candidate's existing opening behaviour verifier passed iPhone-size
  and desktop normal/WebGL, CSS, reduced-motion, skip/replay/entry/cleanup cases.
  The clocks and renderer code remained identical during final integration.
- WebKit recheck could not start: `/private/tmp/cinema-menu-playwright/webkit-2336`
  was unavailable. Do not label that environment failure a product pass or a
  physical iPad/iPhone check. No new browser installation is attempted after
  the owner's wrap-up request. Test assertions were not weakened to fake a pass.
- Native-head font probes initially assumed old stylesheet tags were removed;
  TanStack retains previous head styles. The glyph-subset experiment was dropped,
  and final comparison uses the actual current-main font URLs instead.

Release uses the existing verified main workflow, with public SHA/asset checks
performed separately. MCP deployment listing returned403 for the project team;
existing GitHub CI and the public release identity remain the publication path.
