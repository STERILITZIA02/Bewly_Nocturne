import { ensureContrast, normalizeHexColor, normalizeSurfaceColor } from './themeColor'

export type ColorScheme = 'light' | 'dark'
export interface AppearancePalette {
  background: string | null
  foreground: string | null
}
export interface AppearanceColors {
  light: AppearancePalette
  dark: AppearancePalette
  separateModes: boolean
  darkAccent: string | null
}

/** Existing color fields keep their ownership; these are only the additional palette inputs. */
export interface AppearancePreferences {
  themeColor: string
  darkModeBaseColor: string
  enableDarkModeTint: boolean
  enableOledDarkMode: boolean
  appearanceColors: AppearanceColors
  appearanceContrast: number
  interfaceFontSize: number
}

export const INTERFACE_FONT_SIZE = { default: 13, min: 11, max: 18 } as const

export function defaultAppearanceColors(): AppearanceColors {
  return { light: { background: null, foreground: null }, dark: { background: null, foreground: null }, separateModes: false, darkAccent: null }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function normalizeAppearanceColors(value: unknown): AppearanceColors {
  const colors = record(value)
  const palette = (scheme: ColorScheme): AppearancePalette => {
    const input = record(colors[scheme])
    return { background: normalizeSurfaceColor(input.background, scheme === 'dark'), foreground: normalizeHexColor(input.foreground) }
  }
  // The former toggle gated the saved dark accent. Preserve its effective color
  // when moving to an editing-scope preference that never changes the palette.
  const legacy = !Object.hasOwn(colors, 'separateModes')
  const separateModes = legacy ? colors.separateAccent === true : colors.separateModes === true
  const darkAccent = legacy && !separateModes ? null : colors.darkAccent === 'neutral' ? 'neutral' : normalizeHexColor(colors.darkAccent)
  const normalized = { light: palette('light'), dark: palette('dark'), separateModes, darkAccent }
  const unchanged = !legacy && Object.keys(colors).length === 4 && colors.separateModes === separateModes && colors.darkAccent === darkAccent
    && (['light', 'dark'] as const).every((scheme) => {
      const previous = record(colors[scheme])
      return Object.keys(previous).length === 2 && previous.background === normalized[scheme].background && previous.foreground === normalized[scheme].foreground
    })
  return unchanged ? value as AppearanceColors : normalized
}

export function isAppearanceColorsInput(value: unknown): boolean {
  const colors = record(value)
  return typeof (colors.separateModes ?? colors.separateAccent) === 'boolean'
    && (colors.darkAccent === null || colors.darkAccent === 'neutral' || normalizeHexColor(colors.darkAccent) !== null)
    && ['light', 'dark'].every((scheme) => {
      const palette = record(colors[scheme])
      return ['background', 'foreground'].every(key => palette[key] === null || normalizeHexColor(palette[key]) !== null)
    })
}

export function normalizeAppearanceNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback
}

export function resolveAppearanceAccent(settings: AppearancePreferences, dark: boolean): string {
  return dark ? settings.appearanceColors.darkAccent ?? settings.themeColor : settings.themeColor
}

/** CSS still owns surface derivation. Only explicit overrides are written here. */
export function getAppearanceStyle(settings: AppearancePreferences, dark: boolean, oled: boolean): Record<string, string> {
  const palette = settings.appearanceColors[dark ? 'dark' : 'light']
  const style: Record<string, string> = {
    '--bew-interface-scale': String(settings.interfaceFontSize / INTERFACE_FONT_SIZE.default),
    '--bew-contrast-boost': `${settings.appearanceContrast / 100 * 18}%`,
  }
  if (palette.background && !oled)
    style['--bew-custom-background'] = palette.background
  if (palette.foreground) {
    const background = oled ? '#000000' : palette.background ?? (dark ? '#141414' : '#ffffff')
    style['--bew-custom-foreground'] = ensureContrast(palette.foreground, [background], dark ? '#ffffff' : '#000000', 7)
  }
  return style
}

export const APPEARANCE_STYLE_KEYS = ['--bew-interface-scale', '--bew-contrast-boost', '--bew-custom-background', '--bew-custom-foreground'] as const

export function applyAppearanceStyle(element: HTMLElement, style: Record<string, string>) {
  for (const property of APPEARANCE_STYLE_KEYS) {
    const value = style[property] ?? ''
    if (element.style.getPropertyValue(property) !== value) {
      if (value)
        element.style.setProperty(property, value)
      else element.style.removeProperty(property)
    }
  }
}
