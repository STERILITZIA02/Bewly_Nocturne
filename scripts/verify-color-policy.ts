import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { NEUTRAL_DARK_BASE_COLOR, resolveDarkModeBaseColor } from '../src/utils/darkModeTint'
import { getThemeColorTokens, relativeContrast } from '../src/utils/themeColor'

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
console.log(`Color policy passed: ${samples} RGB samples, light/dark/OLED palettes, opt-in tint and retained custom value.`)
