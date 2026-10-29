// Dock tab glyphs (user-specified, 2026-10-29): Apple tab-bar style filled
// shapes on a 24px grid, with bilibili's TV face as the family detail: the two
// upright eyes (and, on the TV itself, the antennae). Knockouts are 2px
// round-capped strokes in an SVG mask, so every glyph cuts the same weight.
// UnoCSS loads this inline collection as `i-bew-dock:<name>` (unocss.config.ts).

// `knockout` is mask markup, or a bare path `d` for the common case.
function glyph(body: string, knockout = '') {
  const cut = knockout.startsWith('<') ? knockout : `<path d="${knockout}"/>`
  const masked = knockout
    ? `<mask id="k"><rect width="24" height="24" fill="#fff"/><g fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${cut}</g></mask><g mask="url(#k)">${body}</g>`
    : body
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${masked}</svg>`
}

const fill = (d: string) => `<path fill="currentColor" d="${d}"/>`
const stroke = (d: string, width = 2) => `<path fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`

export const DOCK_ICONS: Record<string, string> = {
  // A house whose windows are the TV's eyes.
  home: glyph(
    fill('M12 2.75c.42 0 .83.15 1.15.43l7.1 6.2c.48.42.75 1.02.75 1.66V19a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 19v-7.96c0-.64.27-1.24.75-1.66l7.1-6.2c.32-.28.73-.43 1.15-.43Z'),
    'M9.5 13.25v3M14.5 13.25v3',
  ),
  // The lens looks back.
  search: glyph(
    `<circle cx="10.5" cy="10.5" r="6.4" fill="none" stroke="currentColor" stroke-width="2.25"/>${stroke('m15.4 15.4 4.85 4.85', 2.75)}${stroke('M8.75 9.25v2.5M12.25 9.25v2.5')}`,
  ),
  // The bilibili TV: antennae and eyes.
  anime: glyph(
    fill('M6.75 6.5h10.5a4 4 0 0 1 4 4V16a4 4 0 0 1-4 4H6.75a4 4 0 0 1-4-4v-5.5a4 4 0 0 1 4-4Z') + stroke('M7.75 2.75 10 5.75M16.25 2.75 14 5.75'),
    'M9 11.75v3M15 11.75v3',
  ),
  favorites: glyph(
    fill('M8.243 7.34l-6.38.925l-.113.023a1 1 0 0 0-.44 1.684l4.622 4.499l-1.09 6.355l-.013.11a1 1 0 0 0 1.464.944l5.706-3l5.693 3l.1.046a1 1 0 0 0 1.352-1.1l-1.091-6.355l4.624-4.5l.078-.085a1 1 0 0 0-.633-1.62l-6.38-.926l-2.852-5.78a1 1 0 0 0-1.794 0Z'),
    'M10.25 11.5v2.25M13.75 11.5v2.25',
  ),
  history: glyph(
    '<circle cx="12" cy="12" r="9.25" fill="currentColor"/>',
    'M12 7.25V12l3.25 2.25',
  ),
  // A TV screen holding a clock, on its stand.
  'watch-later': glyph(
    fill('M6.75 3.75h10.5a4 4 0 0 1 4 4v5.5a4 4 0 0 1-4 4H6.75a4 4 0 0 1-4-4v-5.5a4 4 0 0 1 4-4Z') + stroke('M8.5 20.5h7'),
    '<circle cx="12" cy="10.5" r="3.75"/><path d="M12 8.75v1.75l1.25 1.25"/>',
  ),
  // bilibili's moments pinwheel: four half-disc blades around a hub.
  moments: glyph(
    ['0', '90', '180', '270'].map(angle => `<path fill="currentColor" transform="rotate(${angle} 12 12)" d="M12 12V3.5a4.25 4.25 0 0 1 0 8.5Z"/>`).join(''),
    '<circle cx="12" cy="12" r=".5"/>',
  ),
  // A speech bubble with the TV's eyes.
  notifications: glyph(
    fill('M12 3.5c5.1 0 9.25 3.6 9.25 8.1s-4.15 8.1-9.25 8.1c-1.05 0-2.06-.15-3-.44l-3.6 1.88a.75.75 0 0 1-1.07-.82l.66-3.13C3.94 15.66 2.75 13.73 2.75 11.6c0-4.5 4.15-8.1 9.25-8.1Z'),
    'M9.25 10.25v2.75M14.75 10.25v2.75',
  ),
}
