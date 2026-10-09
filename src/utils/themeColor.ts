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

function ensureContrast(color: string, backgrounds: readonly string[], targetColor: string, minimumContrast: number): string {
  const source = parseHexColor(color)
  const target = parseHexColor(targetColor)
  const contrast = (value: string) => Math.min(...backgrounds.map(background => relativeContrast(value, background)))
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

/**
 * Resolve the existing CSS palette, including custom dark bases, without copying
 * its color-mix recipes into a second JS palette or mounting measurement nodes.
 */
export function readThemeContrastSurfaces(root: HTMLElement): string[] {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function')
    return []
  const doc = root.ownerDocument
  const styles = doc.defaultView?.getComputedStyle(root)
  if (!styles)
    return []
  const canvas = doc.createElement('canvas')
  canvas.width = canvas.height = 1
  try {
    const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })
    if (!context)
      return []
    const colors = new Set<string>()
    for (const token of ['--bew-bg', '--bew-content-solid', '--bew-content-alt-solid-hover', '--bew-elevated-solid-hover']) {
      const value = styles.getPropertyValue(token).trim()
      if (!value || !CSS.supports('color', value))
        continue
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data
      if (alpha === 255)
        colors.add(toHex({ r, g, b }))
    }
    return [...colors]
  }
  catch {
    // Retain the existing deterministic fallback if canvas readback is unavailable.
    return []
  }
  finally {
    canvas.width = canvas.height = 0
  }
}

export function getThemeColorTokens(themeColor: string, isDark: boolean, surfaces: readonly string[] = []) {
  const backgrounds = surfaces.filter(surface => parseHexColor(surface))
  if (!backgrounds.length)
    backgrounds.push(isDark ? '#181a1e' : '#ffffff')
  const direction = isDark ? '#ffffff' : '#000000'
  const onTheme = getContrastingForeground(themeColor)
  return {
    theme: themeColor,
    onTheme,
    // Keep native checkbox artwork, with the same contrast decision as text.
    checkmarkImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14' fill='none'%3E%3Cpath d='M3 7.2 5.7 10 11 4.5' stroke='${encodeURIComponent(onTheme)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    switchThumb: relativeContrast('#ffffff', themeColor) >= 3 ? '#ffffff' : '#000000',
    foreground: ensureContrast(themeColor, backgrounds, direction, 4.5),
    focusRing: ensureContrast(themeColor, backgrounds, direction, 3),
  }
}
