import { fileURLToPath } from 'node:url'

import { defineConfig, presetAttributify, presetIcons, presetTypography, presetWind3, transformerDirectives } from 'unocss'

import { DOCK_ICONS } from './src/assets/icons/dockIcons'

const remRE = /(-?[.\d]+)rem/g
const spacingTokens: Record<number, string> = {
  0.125: '0-5',
  0.25: '1',
  0.5: '2',
  0.75: '3',
  1: '4',
  1.25: '5',
  1.5: '6',
  2: '8',
  2.5: '10',
  3: '12',
}
const radiusPropertyRE = /^border(?:-.+)?-radius$/
const zeroRadiusRE = /^0(?:px|rem|em|%)?$/
const circleRadiusRE = /^50%$/
const fullRadiusRE = /^(?:9999px|var\(--bew-(?:radius-full|pill-radius|control-radius|control-item-radius|liquid-indicator-radius)\))$/

export default defineConfig({
  content: {
    filesystem: [
      fileURLToPath(new URL('./src/**/*.{js,ts,vue,html}', import.meta.url)).replaceAll('\\', '/'),
    ],
  },
  blocklist: [
    'ps',
    'container',
  ],
  theme: {
    fontSize: {
      xs: ['var(--bew-font-size-caption)', 'var(--bew-line-height-caption)'],
      sm: ['var(--bew-font-size-control)', 'var(--bew-line-height-control)'],
      md: ['var(--bew-font-size-ui)', 'var(--bew-line-height-ui)'],
      base: ['var(--bew-font-size-body)', 'var(--bew-line-height-body)'],
      lg: ['var(--bew-font-size-heading)', 'var(--bew-line-height-heading)'],
      xl: ['var(--bew-font-size-display)', 'var(--bew-line-height-data)'],
      '2xl': ['var(--bew-font-size-data-emphasis)', 'var(--bew-line-height-data)'],
    },
    // All text is regular (user rule); emphasis is tone and size. Heavier
    // utilities resolve to regular too, and scripts/fontWeightPolicy.ts bans them.
    fontWeight: {
      400: 'var(--bew-font-weight-regular)',
      normal: 'var(--bew-font-weight-regular)',
      500: 'var(--bew-font-weight-regular)',
      medium: 'var(--bew-font-weight-regular)',
      600: 'var(--bew-font-weight-regular)',
      semibold: 'var(--bew-font-weight-regular)',
      700: 'var(--bew-font-weight-regular)',
      bold: 'var(--bew-font-weight-regular)',
    },
  },
  safelist: [
    'i-tabler:home',
    'i-tabler:home-filled',
    'i-tabler:search',
    'i-tabler:zoom',
    'i-tabler:zoom-filled',
    'i-tabler:device-tv',
    'i-tabler:device-tv-filled',
    'i-tabler:star',
    'i-tabler:star-filled',
    'i-tabler:clock',
    'i-tabler:clock-filled',
    'i-tabler:playlist',
    'i-tabler:maximize',
    'i-tabler:minimize',
    'i-tabler:windmill',
    'i-tabler:windmill-filled',
    'i-tabler:device-gamepad-2',
    'i-tabler:building-store',
    'i-tabler:cat',
    'i-tabler:sword',
  ],
  rules: [
    // Hairline borders (one device pixel, the separator and edge width):
    // `border="hairline …"`, `border-t-hairline`.
    [/^(?:border|b)(?:-([trblxy]))?-hairline$/, ([, side]) => {
      const sides = ({ t: ['top'], r: ['right'], b: ['bottom'], l: ['left'], x: ['left', 'right'], y: ['top', 'bottom'] } as Record<string, string[]>)[side ?? ''] ?? ['']
      return Object.fromEntries(sides.flatMap((name) => {
        const property = name ? `border-${name}` : 'border'
        return [[`${property}-width`, 'var(--bew-hairline)'], [`${property}-style`, 'solid']]
      }))
    }],
  ],
  presets: [
    presetWind3(),
    presetAttributify(),
    presetIcons({
      // The Dock's own tab glyphs (`i-bew-dock:*`); every other icon is Tabler.
      collections: { 'bew-dock': DOCK_ICONS },
      customizations: {
        customize(defaults, icon, name) {
          if (name.startsWith('tabler:'))
            icon.body = icon.body.replace(/stroke-width="2"/g, 'stroke-width="1.75"')
          return defaults
        },
      },
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
        'width': '1.2em',
        'height': '1.2em',
      },
    }),
    presetTypography(),

    {
      name: 'semantic-rem-transformer',
      postprocess: (util) => {
        util.entries.forEach((i) => {
          const value = i[1]

          if (typeof value === 'string') {
            i[1] = value.replace(remRE, (_, raw: string) => {
              const num = Number(raw)
              // Typography follows the 15px body base; layout retains Uno's
              // 16px rem grid and shares the same spacing as component SCSS.
              if (i[0] === 'font-size' || i[0] === 'line-height')
                return `calc(var(--bew-base-font-size) * ${num})`
              const token = spacingTokens[Math.abs(num)]
              if (token)
                return num < 0 ? `calc(var(--bew-space-${token}) * -1)` : `var(--bew-space-${token})`
              return `${num * 16}px`
            })
          }
        })
      },
    },
    {
      name: 'smooth-corner-shape',
      postprocess: (util) => {
        const radiusEntries = util.entries.filter(([property]) => radiusPropertyRE.test(property))
        if (radiusEntries.length === 0)
          return

        const hasRoundRadius = radiusEntries.some(([, value]) => {
          return typeof value === 'string'
            && (circleRadiusRE.test(value) || fullRadiusRE.test(value))
        })
        const hasSmoothRadius = radiusEntries.some(([, value]) => {
          return typeof value === 'string'
            && !zeroRadiusRE.test(value)
            && !circleRadiusRE.test(value)
            && !fullRadiusRE.test(value)
            && value !== 'inherit'
        })
        const inheritsRadius = radiusEntries.every(([, value]) => value === 'inherit')
        if (!hasSmoothRadius && !hasRoundRadius && !inheritsRadius)
          return

        // A full radius is a capsule (smooth); only 50% is a true circle.
        const hasCircleRadius = radiusEntries.some(([, value]) => typeof value === 'string' && circleRadiusRE.test(value))
        util.entries.push([
          'corner-shape',
          inheritsRadius
            ? 'inherit'
            : hasSmoothRadius ? 'var(--bew-corner-shape)' : hasCircleRadius ? 'var(--bew-corner-shape-round)' : 'var(--bew-corner-shape-capsule)',
        ])
      },
    },
  ],
  transformers: [
    transformerDirectives(),
  ],
})
