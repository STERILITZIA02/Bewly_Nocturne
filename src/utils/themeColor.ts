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

function ensureContrast(color: string, background: string, targetColor: string, minimumContrast: number): string {
  const source = parseHexColor(color)
  const target = parseHexColor(targetColor)
  if (!source || !target || relativeContrast(color, background) >= minimumContrast)
    return color

  let low = 0
  let high = 1
  for (let index = 0; index < 12; index += 1) {
    const amount = (low + high) / 2
    const candidate = toHex(mix(source, target, amount))
    if (relativeContrast(candidate, background) >= minimumContrast)
      high = amount
    else
      low = amount
  }
  return toHex(mix(source, target, high))
}

export function getThemeColorTokens(themeColor: string, isDark: boolean) {
  const surface = isDark ? '#181a1e' : '#ffffff'
  const direction = isDark ? '#ffffff' : '#000000'
  const blackContrast = relativeContrast('#000000', themeColor)
  const whiteContrast = relativeContrast('#ffffff', themeColor)

  return {
    theme: themeColor,
    onTheme: blackContrast >= whiteContrast ? '#000000' : '#ffffff',
    foreground: ensureContrast(themeColor, surface, direction, 4.5),
    focusRing: ensureContrast(themeColor, surface, direction, 3),
  }
}
