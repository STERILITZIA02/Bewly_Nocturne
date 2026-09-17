import { defineConfig, presetAttributify, presetIcons, presetTypography, presetWind3, transformerDirectives } from 'unocss'

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
const fullRadiusRE = /^(?:9999px|var\(--bew-(?:radius-full|badge-radius|control-radius|control-item-radius|liquid-indicator-radius|top-bar-primary-control-radius)\))$/

export default defineConfig({
  content: {
    filesystem: [
      '**/*.{js,ts,vue,svelte,jsx,tsx,mdx,md,astro,elm,php,phtml,html}',
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
      base: ['var(--bew-font-size-body)', 'var(--bew-line-height-body)'],
      lg: ['var(--bew-font-size-heading)', 'var(--bew-line-height-heading)'],
      xl: ['var(--bew-font-size-display)', 'var(--bew-line-height-data)'],
      '2xl': ['var(--bew-font-size-data-emphasis)', 'var(--bew-line-height-data)'],
    },
    // Preserve existing weights while using the same tokens as component SCSS.
    fontWeight: {
      400: 'var(--bew-font-weight-regular)',
      normal: 'var(--bew-font-weight-regular)',
      500: 'var(--bew-font-weight-medium)',
      medium: 'var(--bew-font-weight-medium)',
      600: 'var(--bew-font-weight-semibold)',
      semibold: 'var(--bew-font-weight-semibold)',
      700: 'var(--bew-font-weight-bold)',
      bold: 'var(--bew-font-weight-bold)',
    },
  },
  safelist: [
    'i-mingcute:home-5-line',
    'i-mingcute:home-5-fill',
    'i-mingcute:search-2-line',
    'i-mingcute:search-2-fill',
    'i-mingcute:tv-2-line',
    'i-mingcute:tv-2-fill',
    'i-mingcute:star-line',
    'i-mingcute:star-fill',
    'i-mingcute:time-line',
    'i-mingcute:time-fill',
    'i-mingcute:carplay-line',
    'i-mingcute:carplay-fill',
    'i-tabler:windmill',
    'i-tabler:windmill-filled',
    'i-mingcute:game-2-fill',
    'i-mingcute:store-fill',
    'i-mingcute:cat-fill',
    'i-mingcute:sword-fill',
  ],
  presets: [
    presetWind3(),
    presetAttributify(),
    presetIcons({
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

        util.entries.push([
          'corner-shape',
          inheritsRadius
            ? 'inherit'
            : hasSmoothRadius ? 'var(--bew-corner-shape)' : 'var(--bew-corner-shape-round)',
        ])
      },
    },
  ],
  transformers: [
    transformerDirectives(),
  ],
})
