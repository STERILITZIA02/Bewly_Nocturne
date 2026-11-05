import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import type { DisplaySignals } from '../src/utils/uiScale'
import { estimateDisplayDensity, resolveInterfaceScale, scaleDesignLength } from '../src/utils/uiScale'

const mac = (width: number, height: number, dpr = 2): DisplaySignals => ({ width, height, dpr, mac: true })
const other = (width: number, height: number, dpr: number): DisplaySignals => ({ width, height, dpr, mac: false })

// The reference display keeps today's look, at any page zoom and in every manual-free path.
for (const zoom of [0.5, 0.9, 1, 1.1, 1.75]) {
  const display = mac(Math.round(1800 / zoom), Math.round(1169 / zoom), 2 * zoom)
  assert.equal(resolveInterfaceScale('auto', display), 1, `14-inch More Space at ${zoom * 100}% zoom keeps scale 1`)
}
assert.equal(resolveInterfaceScale('standard', mac(1512, 982)), 1)

const expectations: [string, DisplaySignals, number][] = [
  ['14-inch MacBook Pro, default', mac(1512, 982), 0.875],
  ['16-inch MacBook Pro, default', mac(1728, 1117), 0.875],
  ['16-inch MacBook Pro, More Space', mac(2056, 1329), 1],
  ['13.6-inch MacBook Air, default', mac(1470, 956), 0.875],
  ['24-inch iMac', mac(2240, 1260), 0.875],
  ['27-inch 5K at 2560', mac(2560, 1440), 1],
  ['27-inch 4K at the macOS default 1920', mac(1920, 1080), 0.75],
  ['27-inch 1440p at 1x', mac(2560, 1440, 1), 1],
  ['32-inch Pro Display XDR', mac(3008, 1692), 1],
  ['Windows 16-inch 2560x1600 at 150%', other(1707, 1067, 1.5), 5 / 6],
  ['Windows 16-inch 1920x1200 at 125%', other(1536, 960, 1.25), 0.8],
  ['Windows 24-inch 1080p at 100%', other(1920, 1080, 1), 0.75],
  ['Windows 27-inch 1440p at 100%', other(2560, 1440, 1), 1],
  ['Unknown display', other(1366, 768, 1), 1],
]
for (const [name, display, scale] of expectations)
  assert.equal(resolveInterfaceScale('auto', display), scale, name)
assert.equal(estimateDisplayDensity(other(1366, 768, 1)), null, 'an unknown display is never guessed')
// Page zoom and a larger system scale on a monitor are the user's; auto never cancels them.
assert.equal(resolveInterfaceScale('auto', other(2048, 1152, 1.25)), 1, 'a 27-inch 1440p at 125% keeps scale 1')
assert.equal(resolveInterfaceScale('auto', mac(1920 / 1.25, 1080 / 1.25, 2.5)), 0.8, '27-inch 4K at macOS 1920 and 125% zoom: the same 0.75 target on the 2.5x pixel grid')

// Every scale keeps the 4px grid on whole device pixels and never grows on its own.
for (const [, display] of expectations) {
  for (const size of ['auto', 'compact', 'standard', 'comfortable'] as const) {
    const scale = resolveInterfaceScale(size, display)
    const units = 4 * scale * display.dpr
    assert.ok(scale === 1 || Math.abs(units - Math.round(units)) < 1e-9, `${size} at ${display.dpr}x lands on device pixels`)
    if (size !== 'comfortable')
      assert.ok(scale <= 1 && scale >= 0.75, `${size} stays within 0.75–1`)
  }
}
assert.equal(resolveInterfaceScale('compact', mac(1800, 1169)), 0.875)
assert.equal(resolveInterfaceScale('comfortable', mac(1800, 1169)), 1.125)

// JS lengths match CSS round(length * scale, device pixel), ties upward.
assert.equal(scaleDesignLength(54, 1, 1), 54)
assert.equal(scaleDesignLength(54, 0.875, 0.5), 47.5)
assert.equal(scaleDesignLength(320, 0.875, 0.5), 280)
assert.equal(scaleDesignLength(14, 0.9375, 0.5), 13)
assert.ok(Math.abs(scaleDesignLength(4, 5 / 6, 2 / 3) - 10 / 3) < 1e-9, 'snaps to 1.5x device pixels')

// The registered list is exactly the tokens built with ui() / ui-text().
const variables = readFileSync(new URL('../src/styles/variables.scss', import.meta.url), 'utf8')
const partial = readFileSync(new URL('../src/styles/_uiScale.scss', import.meta.url), 'utf8')
const scaled = [...variables.matchAll(/--bew-([a-z0-9-]+): #\{ui(?:-text)?\(/g)].map(match => match[1])
const registered = partial.match(/\$lengths: \(([^)]*)\)/)![1].split(',').map(name => name.trim()).filter(Boolean)
assert.deepEqual([...registered].sort(), [...scaled].sort(), 'register every scaled token as a length')
assert.match(variables, /--bew-effective-font-scale: calc\(var\(--bew-font-scale\) \* var\(--bew-interface-scale\) \* var\(--bew-ui-text-scale\)\)/, 'text keeps the OS and interface font scales and takes the half factor')
assert.match(variables, /--bew-ui-text-scale: calc\(\(1 \+ var\(--bew-ui-scale\)\) \/ 2\)/)
// Caption 2 (the Dock's smaller names) is a text role like the rest: every text scale applies.
assert.match(variables, /--bew-font-size-caption-2: calc\(10px \* var\(--bew-effective-font-scale\)\);/)
assert.match(variables, /--bew-line-height-caption-2: calc\(13px \* var\(--bew-effective-font-scale\)\);/)
assert.match(readFileSync(new URL('../src/styles/dockTab.scss', import.meta.url), 'utf8'), /font-size: var\(--bew-dock-label-size\);[\s\S]{0,80}line-height: var\(--bew-dock-label-line-height\);/)
assert.match(variables, /--bew-hairline: 1px;/, 'the hairline stays one device pixel')
assert.match(variables, /--bew-icon-button-size-sm: 24px;/, 'the smallest target stays 24px')
assert.match(readFileSync(new URL('../src/styles/main.scss', import.meta.url), 'utf8'), /@include uiScale\.global;/)

console.log('ui scale checks passed')
