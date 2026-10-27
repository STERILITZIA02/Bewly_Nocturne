interface RgbColor {
  r: number
  g: number
  b: number
}

function parseHexColor(value: string): RgbColor | null {
  const normalized = value.trim().replace(/^#/, '')
  const hex = normalized.length === 3
    ? normalized.split('').map(character => character.repeat(2)).join('')
    : normalized

  if (!/^[\da-f]{6}$/i.test(hex))
    return null

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

function toHex({ r, g, b }: RgbColor): string {
  return `#${[r, g, b]
    .map(channel => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')}`
}

function mix(source: RgbColor, target: RgbColor, amount: number): RgbColor {
  return {
    r: source.r + (target.r - source.r) * amount,
    g: source.g + (target.g - source.g) * amount,
    b: source.b + (target.b - source.b) * amount,
  }
}

function relativeLuminance(color: RgbColor): number {
  const channels = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

export function relativeContrast(foreground: string, background: string): number {
  const foregroundRgb = parseHexColor(foreground)
  const backgroundRgb = parseHexColor(background)
  if (!foregroundRgb || !backgroundRgb)
    return 1

  const lighter = Math.max(relativeLuminance(foregroundRgb), relativeLuminance(backgroundRgb))
  const darker = Math.min(relativeLuminance(foregroundRgb), relativeLuminance(backgroundRgb))
  return (lighter + 0.05) / (darker + 0.05)
}

export function ensureContrast(color: string, backgrounds: readonly string[], targetColor: string, minimumContrast: number): string {
  const source = parseHexColor(color)
  const target = parseHexColor(targetColor)
  const backgroundLuminances = backgrounds.map((background) => {
    const rgb = parseHexColor(background)
    return rgb ? relativeLuminance(rgb) : undefined
  })
  const contrast = (value: string) => {
    const rgb = parseHexColor(value)
    if (!rgb)
      return 1
    const luminance = relativeLuminance(rgb)
    return Math.min(...backgroundLuminances.map(background => background === undefined ? 1 : (Math.max(luminance, background) + 0.05) / (Math.min(luminance, background) + 0.05)))
  }
  if (!source || !target || contrast(color) >= minimumContrast)
    return color
  // Extremely conflicting custom surfaces may have no reachable solution in
  // this direction. Do not lower the contrast that the original colour had.
  if (contrast(targetColor) < minimumContrast)
    return contrast(targetColor) > contrast(color) ? targetColor : color

  let low = 0
  let high = 1
  for (let index = 0; index < 12; index += 1) {
    const amount = (low + high) / 2
    const candidate = toHex(mix(source, target, amount))
    if (contrast(candidate) >= minimumContrast)
      high = amount
    else
      low = amount
  }
  return toHex(mix(source, target, high))
}

export function getContrastingForeground(background: string): string {
  return relativeContrast('#000000', background) >= relativeContrast('#ffffff', background) ? '#000000' : '#ffffff'
}

/** Read all colors before any style writes; one canvas is released per batch. */
function readOpaqueCssColors(root: HTMLElement, tokens: readonly string[]): Map<string, RgbColor> {
  const colors = new Map<string, RgbColor>()
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function')
    return colors
  const styles = root.ownerDocument.defaultView?.getComputedStyle(root)
  const canvas = root.ownerDocument.createElement('canvas')
  canvas.width = canvas.height = 1
  try {
    const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })
    if (!styles || !context)
      return colors
    const resolved = new Map<string, RgbColor | null>()
    for (const token of tokens) {
      const value = styles.getPropertyValue(token).trim()
      if (resolved.has(value)) {
        const color = resolved.get(value)
        if (color)
          colors.set(token, color)
        continue
      }
      resolved.set(value, null)
      if (!value || !CSS.supports('color', value))
        continue
      const hex = parseHexColor(value)
      if (hex) {
        colors.set(token, hex)
        resolved.set(value, hex)
        continue
      }
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data
      if (alpha === 255) {
        const color = { r, g, b }
        colors.set(token, color)
        resolved.set(value, color)
      }
    }
  }
  catch {
    // A failed batch must not leave a partially updated palette.
    colors.clear()
  }
  finally {
    canvas.width = canvas.height = 0
  }
  return colors
}

const NATIVE_NEUTRAL_COLOR_NAMES = ['Ga0', 'Ga0_s', 'Ga1', 'Ga1_s', 'Ga2', 'Ga3', 'Ga5', 'Ga7', 'Ga10', 'Ga11', 'Ga12', 'Ga12_s', 'Ga13', 'Ga13_s', 'Wh0', 'Wh0_s', 'bg1', 'graph_bg_thin'] as const
export const NATIVE_NEUTRAL_RGB_PROPERTIES = NATIVE_NEUTRAL_COLOR_NAMES.map(name => `--bew-native-${name}-rgb`)
const THEME_CONTRAST_SURFACES = ['--bew-bg', '--bew-content-solid', '--bew-content-alt-solid-hover', '--bew-elevated-solid-hover', '--bew-elevated-alt-solid-hover', '--bew-sidebar-background-solid', '--bew-selected-bg'] as const

/** Sample both palettes before writing: native tuples must not force a second style flush. */
export function syncThemeColors(root: HTMLElement, host: HTMLElement | null, accent: string, dark: boolean) {
  const nativeTokens = NATIVE_NEUTRAL_COLOR_NAMES.map(name => `--${name}`)
  const colors = readOpaqueCssColors(root, host ? nativeTokens : [...nativeTokens, ...THEME_CONTRAST_SURFACES])
  const surfaces = host ? readThemeContrastSurfaces(host) : [...new Set(THEME_CONTRAST_SURFACES.flatMap(token => colors.has(token) ? [toHex(colors.get(token)!)] : []))]
  const tokens = getThemeColorTokens(accent, dark, surfaces)
  for (const name of NATIVE_NEUTRAL_COLOR_NAMES) {
    const property = `--bew-native-${name}-rgb`
    const color = colors.get(`--${name}`)
    if (!color) {
      // Clear old-mode projections so the current CSS fallback can take over.
      root.style.removeProperty(property)
      continue
    }
    const value = `${color.r}, ${color.g}, ${color.b}`
    if (root.style.getPropertyValue(property) !== value)
      root.style.setProperty(property, value)
  }
  applyThemeColorTokens(root, tokens)
  if (host)
    applyThemeColorTokens(host, tokens)
}

/**
 * Resolve the existing CSS palette, including custom dark bases, without copying
 * its color-mix recipes into a second JS palette or mounting measurement nodes.
 */
export function readThemeContrastSurfaces(root: HTMLElement): string[] {
  return [...new Set([...readOpaqueCssColors(root, THEME_CONTRAST_SURFACES).values()].map(toHex))]
}

/** Theme color setting value meaning "no accent": black in light mode, white in dark mode. */
export const NEUTRAL_THEME_COLOR = 'neutral'
export const DEFAULT_THEME_COLOR = '#00a1d6'
/**
 * A custom accent must stay distinguishable from both a white page and a pure
 * black page; every preset clears it (lowest: #fda4af at 1.89:1 on white).
 */
export const THEME_COLOR_MIN_PAGE_CONTRAST = 1.8

function srgbToLinear(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value: number): number {
  return 255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055)
}

function rgbToOklch({ r, g, b }: RgbColor) {
  const [lr, lg, lb] = [r, g, b].map(srgbToLinear)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  return {
    l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    c: Math.hypot(a, bAxis),
    h: Math.atan2(bAxis, a),
  }
}

/** Linear sRGB channels; values outside 0..1 are out of gamut. */
function oklchToLinear(lightness: number, chroma: number, hue: number): [number, number, number] {
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ]
}

/** Keep lightness and hue; reduce chroma until the color fits sRGB. */
function oklchToHex(lightness: number, chroma: number, hue: number): string {
  const inGamut = (value: number) => oklchToLinear(lightness, value, hue).every(channel => channel >= -1e-6 && channel <= 1 + 1e-6)
  let fitted = chroma
  if (!inGamut(chroma)) {
    let low = 0
    let high = chroma
    for (let index = 0; index < 16; index += 1) {
      const amount = (low + high) / 2
      if (inGamut(amount))
        low = amount
      else
        high = amount
    }
    fitted = low
  }
  const [r, g, b] = oklchToLinear(lightness, fitted, hue).map(channel => Math.min(255, Math.max(0, linearToSrgb(Math.min(1, Math.max(0, channel))))))
  return toHex({ r, g, b })
}

function isWithinThemeColorRange(color: string): boolean {
  return relativeContrast(color, '#ffffff') >= THEME_COLOR_MIN_PAGE_CONTRAST
    && relativeContrast(color, '#000000') >= THEME_COLOR_MIN_PAGE_CONTRAST
}

/** Move a too-dark or too-light custom accent to the nearest allowed OKLCH lightness, keeping its hue. */
export function clampThemeColor(color: string): string {
  const rgb = parseHexColor(color)
  if (!rgb)
    return DEFAULT_THEME_COLOR
  const hex = toHex(rgb)
  if (isWithinThemeColorRange(hex))
    return hex
  const { l, c, h } = rgbToOklch(rgb)
  // Mid lightness is inside the range for every hue; search towards the original.
  let allowed = 0.6
  let rejected = l
  for (let index = 0; index < 20; index += 1) {
    const lightness = (allowed + rejected) / 2
    if (isWithinThemeColorRange(oklchToHex(lightness, c, h)))
      allowed = lightness
    else
      rejected = lightness
  }
  return oklchToHex(allowed, c, h)
}

/** Storage boundary: keep the neutral option, clamp custom colors, replace invalid values. */
export function normalizeThemeColor(value: unknown): string {
  if (value === NEUTRAL_THEME_COLOR)
    return value
  return typeof value === 'string' ? clampThemeColor(value) : DEFAULT_THEME_COLOR
}

export function normalizeHexColor(value: unknown): string | null {
  const rgb = typeof value === 'string' ? parseHexColor(value) : null
  return rgb ? toHex(rgb) : null
}

/** Keep the chosen hue while keeping a surface within its light/dark scheme. */
export function normalizeSurfaceColor(value: unknown, dark: boolean): string | null {
  const rgb = typeof value === 'string' ? parseHexColor(value) : null
  if (!rgb)
    return null
  const { l, c, h } = rgbToOklch(rgb)
  if (dark ? l <= 0.4 : l >= 0.88)
    return toHex(rgb)
  return oklchToHex(dark ? Math.min(l, 0.4) : Math.max(l, 0.88), c, h)
}

export function getThemeColorTokens(themeColor: string, isDark: boolean, surfaces: readonly string[] = []) {
  const backgrounds = surfaces.filter(surface => parseHexColor(surface))
  if (!backgrounds.length)
    backgrounds.push(isDark ? '#121212' : '#ffffff')
  const direction = isDark ? '#ffffff' : '#000000'
  const neutral = themeColor === NEUTRAL_THEME_COLOR
  const theme = neutral ? direction : themeColor
  const onTheme = getContrastingForeground(theme)
  return {
    // Solid actions always keep the chosen RGB value; only their foreground
    // changes. Contrast correction below is exclusively for text and markers.
    theme,
    onTheme,
    // Brand marks keep a chromatic hover even without an accent.
    brandAccent: neutral ? 'var(--bew-bili-pink)' : theme,
    // Keep native checkbox artwork, with the same contrast decision as text.
    checkmarkImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14' fill='none'%3E%3Cpath d='M3 7.2 5.7 10 11 4.5' stroke='${encodeURIComponent(onTheme)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    switchThumb: relativeContrast('#ffffff', theme) >= 3 ? '#ffffff' : '#000000',
    foreground: ensureContrast(theme, backgrounds, direction, 4.5),
    focusRing: ensureContrast(theme, backgrounds, direction, 3),
  }
}

const THEME_TOKEN_PROPERTIES = {
  theme: '--bew-theme-color',
  onTheme: '--bew-on-theme-color',
  brandAccent: '--bew-brand-accent',
  checkmarkImage: '--bew-theme-checkmark-image',
  switchThumb: '--bew-switch-thumb-active',
  foreground: '--bew-theme-foreground',
  focusRing: '--bew-theme-focus-ring',
} as const
export const THEME_COLOR_PROPERTIES = Object.values(THEME_TOKEN_PROPERTIES)

export function applyThemeColorTokens(element: HTMLElement, tokens: ReturnType<typeof getThemeColorTokens>) {
  for (const key of Object.keys(THEME_TOKEN_PROPERTIES) as (keyof typeof THEME_TOKEN_PROPERTIES)[]) {
    const property = THEME_TOKEN_PROPERTIES[key]
    if (element.style.getPropertyValue(property) !== tokens[key])
      element.style.setProperty(property, tokens[key])
  }
}
