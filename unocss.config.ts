import { defineConfig, presetAttributify, presetIcons, presetTypography, presetWind3, transformerDirectives } from 'unocss'

const remRE = /(-?[.\d]+)rem/g
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
      name: 'text-size-transformer',
      postprocess: (util) => {
        util.entries.forEach((i) => {
          const value = i[1]

          if (typeof value === 'string' && remRE.test(value)) {
            i[1] = value.replace(remRE, (_, num: number) => {
              return `calc(var(--bew-base-font-size) * ${num})`
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
