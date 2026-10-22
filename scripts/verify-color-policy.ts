import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { NEUTRAL_DARK_BASE_COLOR, resolveDarkModeBaseColor } from '../src/utils/darkModeTint'
import { clampThemeColor, DEFAULT_THEME_COLOR, getThemeColorTokens, NEUTRAL_THEME_COLOR, normalizeThemeColor, relativeContrast, THEME_COLOR_MIN_PAGE_CONTRAST } from '../src/utils/themeColor'

const saved = { darkModeBaseColor: '#2d2a2f', enableDarkModeTint: false }
assert.equal(resolveDarkModeBaseColor(saved), NEUTRAL_DARK_BASE_COLOR)
saved.enableDarkModeTint = true
assert.equal(resolveDarkModeBaseColor(saved), '#2d2a2f')
saved.enableDarkModeTint = false
assert.equal(resolveDarkModeBaseColor(saved), NEUTRAL_DARK_BASE_COLOR)
assert.equal(saved.darkModeBaseColor, '#2d2a2f')
assert.equal(resolveDarkModeBaseColor({ darkModeBaseColor: '#2d2a2f' }), NEUTRAL_DARK_BASE_COLOR)
assert.equal(resolveDarkModeBaseColor({ enableDarkModeTint: 'true', darkModeBaseColor: '#2d2a2f' }), NEUTRAL_DARK_BASE_COLOR)
assert.equal(resolveDarkModeBaseColor({ enableDarkModeTint: true, darkModeBaseColor: 'invalid' }), NEUTRAL_DARK_BASE_COLOR)

const brightColors = ['#eab308', '#fb923c', '#a3e635', '#fda4af', '#ffff00', '#ccffcc', '#ffe0ec']
const palettes = [
  { dark: false, surfaces: ['#ffffff', '#f2f2f2', '#c9c9c9'] },
  { dark: true, surfaces: ['#1b1b1b', '#2e2e2e', '#414141'] },
  { dark: true, surfaces: ['#000000', '#2e2e2e', '#414141'] },
]

// Read the actual label opacities so future palette edits keep all reading
// levels legible on the page, cards and the lifted sidebar.
const variables = readFileSync(new URL('../src/styles/variables.scss', import.meta.url), 'utf8')
const secondaryAlpha = Number(variables.match(/--bew-text-2: color-mix\(in srgb, var\(--bew-neutral-fg\) (\d+)%/)![1]) / 100
const tertiaryAlpha = [...variables.matchAll(/--bew-text-3: color-mix\(in srgb, var\(--bew-neutral-fg\) (\d+)%/g)].map(match => Number(match[1]) / 100)
for (const [mode, foreground, backgrounds, tertiary] of [
  ['light', 23, [255, 246, 232], tertiaryAlpha[0]],
  ['dark', 235, [20, 39, 55], tertiaryAlpha[1]],
  ['oled', 235, [0, 24, 48], tertiaryAlpha[1]],
] as const) {
  for (const background of backgrounds) {
    const gray = (value: number) => `#${Math.round(value).toString(16).padStart(2, '0').repeat(3)}`
    let previous = Number.POSITIVE_INFINITY
    for (const alpha of [1, secondaryAlpha, tertiary]) {
      const ratio = relativeContrast(gray(foreground * alpha + background * (1 - alpha)), gray(background))
      assert.ok(ratio >= 4.5, `${mode}: text alpha ${alpha} on ${background} must remain readable`)
      assert.ok(ratio < previous, `${mode}: primary, secondary and supporting text must have distinct contrast levels`)
      previous = ratio
    }
  }
}

for (const { dark, surfaces } of palettes) {
  for (const color of [...brightColors, '#00a1d6', '#3b82f6', '#6366f1', '#000000', '#ffffff']) {
    const tokens = getThemeColorTokens(color, dark, surfaces)
    assert.equal(tokens.theme, color, 'Solid button color must remain the chosen RGB value')
    assert.ok(relativeContrast(tokens.onTheme, tokens.theme) >= 4.5, `${color}: button contrast`)
    if (brightColors.includes(color))
      assert.equal(tokens.onTheme, '#000000', `${color}: bright fills need dark text`)
    for (const surface of surfaces) {
      assert.ok(relativeContrast(tokens.foreground, surface) >= 4.5, `${color}: link contrast against ${surface}`)
      assert.ok(relativeContrast(tokens.focusRing, surface) >= 3, `${color}: marker contrast against ${surface}`)
    }
  }
}

// Sample the full RGB cube, including the black/white foreground crossover.
let samples = 0
for (let red = 0; red <= 255; red += 17) {
  for (let green = 0; green <= 255; green += 17) {
    for (let blue = 0; blue <= 255; blue += 17) {
      const color = `#${[red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('')}`
      const tokens = getThemeColorTokens(color, false)
      assert.equal(tokens.theme, color)
      assert.ok(relativeContrast(tokens.onTheme, color) >= 4.5, color)
      samples++
    }
  }
}
// "No theme color": black accent in light mode, white in dark mode, with a
// readable foreground; brand marks keep a chromatic hover.
for (const { dark, surfaces } of palettes) {
  const tokens = getThemeColorTokens(NEUTRAL_THEME_COLOR, dark, surfaces)
  assert.equal(tokens.theme, dark ? '#ffffff' : '#000000')
  assert.equal(tokens.onTheme, dark ? '#000000' : '#ffffff')
  assert.equal(tokens.brandAccent, 'var(--bew-bili-pink)')
  for (const surface of surfaces)
    assert.ok(relativeContrast(tokens.foreground, surface) >= 4.5, `neutral link contrast against ${surface}`)
}
assert.equal(getThemeColorTokens('#00a1d6', true).brandAccent, '#00a1d6')

// Custom accents stay away from black and white; presets are already inside.
function withinRange(color: string) {
  return relativeContrast(color, '#ffffff') >= THEME_COLOR_MIN_PAGE_CONTRAST
    && relativeContrast(color, '#000000') >= THEME_COLOR_MIN_PAGE_CONTRAST
}
const appearance = readFileSync(new URL('../src/components/Settings/Appearance/Appearance.vue', import.meta.url), 'utf8')
const presets = [...appearance.slice(appearance.indexOf('themeColorOptions'), appearance.indexOf('darkModeBaseColorOptions')).matchAll(/'(#[\da-f]{6})'/g)].map(match => match[1])
assert.ok(presets.length >= 17)
for (const preset of presets)
  assert.equal(clampThemeColor(preset), preset, `${preset}: presets must already be inside the allowed range`)
assert.equal(normalizeThemeColor(NEUTRAL_THEME_COLOR), NEUTRAL_THEME_COLOR)
assert.equal(normalizeThemeColor(undefined), DEFAULT_THEME_COLOR)
assert.equal(normalizeThemeColor('not-a-color'), DEFAULT_THEME_COLOR)
assert.equal(normalizeThemeColor('#FB7299'), '#fb7299')
for (const extreme of ['#000000', '#ffffff', '#0a0a0a', '#f8f8fa', '#ffff00', '#000080'])
  assert.notEqual(normalizeThemeColor(extreme), extreme, `${extreme} must be clamped`)
let clamped = 0
for (let red = 0; red <= 255; red += 15) {
  for (let green = 0; green <= 255; green += 15) {
    for (let blue = 0; blue <= 255; blue += 15) {
      const color = `#${[red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('')}`
      const result = clampThemeColor(color)
      assert.ok(withinRange(result), `${color} -> ${result} must be inside the range`)
      assert.equal(clampThemeColor(result), result, `${color}: clamping is idempotent`)
      if (result !== color)
        clamped++
    }
  }
}
assert.ok(clamped > 0)
const storage = readFileSync(new URL('../src/logic/storage.ts', import.meta.url), 'utf8')
assert.match(storage, /value\.themeColor = normalizeThemeColor\(value\.themeColor\)/, 'stored theme colors are normalized at the storage boundary')
assert.match(appearance, /changeThemeColor\(clampThemeColor\(color\)\)/, 'the custom picker clamps its input')
assert.match(appearance, /changeThemeColor\(NEUTRAL_THEME_COLOR\)/, 'the neutral option is selectable in settings')

// The top bar logo circle is the folded persistent rail: same material and
// border, unchanged on hover (only the icon recolors).
const logo = readFileSync(new URL('../src/components/TopBar/components/TopBarLogo.vue', import.meta.url), 'utf8')
const circle = logo.slice(logo.indexOf('.logo-circle {'), logo.indexOf('}', logo.indexOf('.logo-circle {')))
assert.match(circle, /@include sidebarSurface\.floating;/)
const surfaceMixins = readFileSync(new URL('../src/styles/sidebarSurface.scss', import.meta.url), 'utf8')
const floating = surfaceMixins.slice(surfaceMixins.indexOf('@mixin floating {'))
assert.match(floating, /@include material;/)
assert.match(floating, /border: 1px solid var\(--bew-glass-border-color\);/)
assert.doesNotMatch(logo, /\.logo-circle[^{]*:hover|:hover[^{]*\.logo-circle/, 'hover never changes the glass')
assert.match(logo, /sidebarHost\.logo\.value = docking \? element : null/, 'the floating icon logo registers the circle the rail folds into')
assert.match(logo, /color: var\(--bew-text-1\);/)
assert.match(logo, /color: var\(--bew-brand-accent\);/)
assert.match(logo, /viewBox="210 210 604 604"/, 'the TV mark is cropped to its centered bounds')
assert.match(logo, /width: var\(--bew-icon-size-lg\);\s+height: var\(--bew-icon-size-lg\);/)
assert.match(logo, /prefers-reduced-motion: reduce\)[\s\S]*\.logo \{\s+transition: none;/)

console.log(`Color policy passed: ${samples} RGB samples, light/dark/OLED palettes, opt-in tint and retained custom value.`)
