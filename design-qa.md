# RiverGuard Spatial Ledger — Design QA

## Visual truth

- Source reference: `C:\Users\ta1yi\.codex\generated_images\01a1c0c6-44a4-73f1-ad0e-56382e11a86c\exec-61272ba6-ed2b-4a6e-8ada-17e74c7d34c3.png`
- User refinement reference: `C:\Users\ta1yi\AppData\Local\Temp\codex-clipboard-6f6a47a3-c237-4c2c-9863-6c3549c1285f.png`
- Source dimensions: 1487 × 1058 px
- Implementation preview: `http://127.0.0.1:3000/`
- Implementation capture: full-page capture retained in the Codex in-app browser deliverable preview
- Verification viewports: 1265 × 712 px and 1865 × 976 px, plus a full-page capture of the complete dashboard
- Compared state: Wednesday, November 11, 2026; Experimental outlook; Marikina selected

## Full-view comparison

- Layout: passed. The website uses a full-viewport warm-gray application shell with compact top navigation, a narrow tool rail, and an approximately 58/42 map-to-ledger split. The concept image's outer black presentation frame is intentionally excluded from the product UI.
- Hierarchy: passed. The map remains the primary surface; the city summary, historical chart, contribution bars, and provenance panel form the intended analytical ledger.
- Typography: passed. Local Geist typography, compact navigation labels, strong page/status headings, and restrained metadata sizes preserve the reference hierarchy.
- Color: passed. The everyday interface uses three color families: warm neutral surfaces, near-black ink, and coral accent. Coral is limited to selection, elevated-risk emphasis, chart data, availability indicators, and focused destinations.
- Spacing and shape: passed. Structural radius, panel radius, control radius, gutters, and dense panel spacing are consistent with the source.
- Image quality: passed. The map uses a dedicated generated raster asset at native 1536 × 1024 resolution and remains crisp at the displayed size.
- Copy and trust cues: passed. All modeled values are explicitly labeled illustrative, experimental, or sample data, with an official-source warning.

## Focused comparisons

- Header and navigation: the sticky top bar is the sole primary navigation; the active coral pill and focused destination outline provide clear anchor feedback at wide viewports.
- Map workspace: title card, layer control, city labels, legend, coverage note, and availability strip use consistent light-mode surfaces without implying surveyed boundaries.
- Analytical ledger: Marikina status, historical chart, contribution bars, and provenance rows all use consistent light analytical surfaces, with coral reserved for risk and selection emphasis.
- Responsive behavior: the approved side-by-side composition starts at 1180 px; narrower screens stack the map and ledger without horizontal overflow.
- Accessibility: semantic headings, labeled controls, visible focus styles, pressed/checked states, and reduced-motion handling are present.

## Issues found and resolved

- P2 — The first desktop breakpoint stacked the map and ledger at the in-app browser width. Fixed by moving the split layout to a 1180 px custom breakpoint.
- P1 — The local in-app preview rendered server HTML but did not hydrate because Next.js blocked the `127.0.0.1` development origin. Fixed with a narrow `allowedDevOrigins` entry; client interactions and Recharts now render correctly.
- P2 — The historical chart initially had no visible plot during the blocked-hydration state. Reverified after the origin fix: axes, bars, line, dots, and legend all render.
- P2 — The first implementation treated the concept image's black outer presentation frame and masthead as application UI. Removed both so the dashboard now fills the browser viewport like a conventional web application.
- P2 — Shared action-button content allowed icon and label wrapping, making the forecast controls appear vertically stacked. The shared button content now uses a non-wrapping inline flex row.
- P2 — The native fieldset legend rendered above the dark map-layer surface. The group keeps its fieldset semantics while using an internally positioned, labelled heading.
- P2 — Sidebar tooltips were centered above their icons and clipped against the left frame. Sidebar instances now open to the right, wrap within a bounded width, and remain visible on keyboard focus.
- P2 — Primary routes were duplicated in the top navigation and sidebar. The top bar now owns route navigation; the sidebar contains only Search, Map layers, Station data, Settings, and Sign out utilities.
- P2 — Forecast and evidence actions were visually oversized for a dashboard toolbar. They now use the shared compact button size.
- P2 — Dark chart, contribution, provenance, map-control, legend, and availability surfaces made light mode visually inconsistent. Analytical and map information panels now use warm neutral surfaces with ink labels and coral data emphasis.
- P2 — The Marikina risk summary retained an isolated dark surface after the light-mode cleanup. It now uses the same warm analytical surface, with coral text and the selected day carrying the risk emphasis.
- P2 — Wide-screen anchor navigation did not clearly communicate which section was selected. The top navigation is now sticky, updates its active item from the URL hash, and applies a subtle coral outline to the targeted panel.

## Functional verification

- Seven-day outlook updates the date and experimental index.
- Map layer radio controls update checked state and contextual legend copy.
- Run forecast exposes a loading state and then a refreshed timestamp message.
- Sidebar tooltips remain inside the viewport and appear on focus.
- History navigation updates `aria-current`, keeps the active item visible, and highlights the destination panel.
- Browser console contains no application errors after the final reload.
- `npm run format:check`, `npm run lint`, `npm run typecheck`, and `npm run build` pass.

No P0, P1, or P2 visual-fidelity issues remain.

final result: passed
