import type { Settings } from '~/logic/storage'

import type { AppearancePreferences, ColorScheme } from './appearance'
import { INTERFACE_FONT_SIZE, isAppearanceColorsInput, normalizeAppearanceColors, normalizeAppearanceNumber, resolveAppearanceAccent } from './appearance'
import type { AppearancePreset } from './appearancePresets'
import { CODEX_APPEARANCE_PRESETS } from './appearancePresets'
import { DEFAULT_THEME_COLOR, normalizeHexColor, normalizeThemeColor } from './themeColor'

// Preset editing and theme files are only loaded with the settings page.
export const ACCENT_COLORS = ['#22c55e', '#34d399', '#14b8a6', '#06b6d4', '#00a1d6', '#60a5fa', '#3b82f6', '#6366f1', '#818cf8', '#a78bfa', '#f46d43', '#fb923c', '#f59e0b', '#eab308', '#f43f5e', '#fb7299', '#fda4af'] as const

export const APPEARANCE_PRESETS: readonly AppearancePreset[] = [
  { id: 'nocturne', light: { accent: DEFAULT_THEME_COLOR, background: null, foreground: null }, dark: { accent: DEFAULT_THEME_COLOR, background: null, foreground: null } },
  { id: 'graphite', light: { accent: 'neutral', background: '#f7f7f7', foreground: '#202020' }, dark: { accent: 'neutral', background: '#202020', foreground: '#efefef' } },
  { id: 'paper', light: { accent: '#b87953', background: '#f8f4ed', foreground: '#302b25' }, dark: { accent: '#b87953', background: '#292724', foreground: '#f4eee5' } },
  { id: 'sage', light: { accent: '#4f9275', background: '#f1f5f0', foreground: '#25312b' }, dark: { accent: '#4f9275', background: '#202824', foreground: '#e8f0ea' } },
  { id: 'slate', light: { accent: '#6486b0', background: '#f1f4f8', foreground: '#252d38' }, dark: { accent: '#6486b0', background: '#222831', foreground: '#e8edf4' } },
  { id: 'chatgpt', name: 'ChatGPT', light: { accent: '#3a83f7', background: '#fcfcfc', foreground: '#0d0d0d' }, dark: { accent: '#3a83f7', background: '#000000', foreground: '#ededed' } },
  ...CODEX_APPEARANCE_PRESETS,
]

// The catalog is immutable. Normalize each variant once, not on every settings echo.
const presetMatches = APPEARANCE_PRESETS.map((preset) => {
  const colors = normalizeAppearanceColors({ light: preset.light, dark: preset.dark })
  return { preset, colors, lightAccent: preset.light && normalizeThemeColor(preset.light.accent) }
})

export function appearancePresetPatch(preset: AppearancePreset, settings: AppearancePreferences, scheme?: ColorScheme): Partial<AppearancePreferences> {
  const colors = settings.appearanceColors
  const light = scheme !== 'dark' ? preset.light : undefined
  const dark = scheme !== 'light' ? preset.dark : undefined
  if (!light && !dark)
    return {}
  const patch: Partial<AppearancePreferences> = {
    appearanceColors: normalizeAppearanceColors({
      ...colors,
      ...(light ? { light } : {}),
      ...(dark ? { dark } : {}),
      darkAccent: dark?.accent ?? colors.darkAccent ?? settings.themeColor,
    }),
  }
  if (light)
    patch.themeColor = normalizeThemeColor(light.accent)
  return patch
}

export function matchingAppearancePreset(settings: AppearancePreferences, scheme: ColorScheme): string {
  const actual = settings.appearanceColors[scheme]
  const accent = resolveAppearanceAccent(settings, scheme === 'dark')
  return presetMatches.find(({ preset, colors, lightAccent }) => {
    if (!preset[scheme])
      return false
    return actual.background === colors[scheme].background
      && actual.foreground === colors[scheme].foreground
      && accent === (scheme === 'light' ? lightAccent : preset.dark!.accent)
  })?.preset.id ?? 'custom'
}

const APPEARANCE_KEYS = [
  'themeColor',
  'appearanceColors',
  'appearanceContrast',
  'interfaceFontSize',
  'customizeFont',
  'fontFamily',
  'videoCardTitleFontSize',
  'videoCardAuthorFontSize',
  'textAutospaceMode',
  'removeTheIndentFromChinesePunctuation',
  'overrideDanmakuFont',
  'disableFrostedGlass',
  'frostedGlassBlurIntensity',
  'disableShadow',
  'useLinearGradientThemeColorBackground',
  'motionPreference',
] as const satisfies readonly (keyof Settings)[]
type AppearanceFilePreferences = Pick<Settings, typeof APPEARANCE_KEYS[number]>

export function serializeAppearance(settings: AppearanceFilePreferences): string {
  return JSON.stringify({ format: 'bewly-nocturne-appearance', version: 2, settings: Object.fromEntries(APPEARANCE_KEYS.map(key => [key, settings[key]])) }, null, 2)
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function parseAppearance(text: string): Partial<AppearanceFilePreferences> {
  const input = record(JSON.parse(text))
  const fields = record(input.settings)
  if (input.format !== 'bewly-nocturne-appearance' || (input.version !== 1 && input.version !== 2)
    || APPEARANCE_KEYS.some(key => (input.version === 2 || key !== 'motionPreference') && !(key in fields))) {
    throw new TypeError('Invalid appearance file')
  }
  const booleanKeys = ['removeTheIndentFromChinesePunctuation', 'overrideDanmakuFont', 'disableFrostedGlass', 'disableShadow', 'useLinearGradientThemeColorBackground'] as const
  const options = { customizeFont: ['default', 'recommend', 'custom'], videoCardTitleFontSize: ['xs', 'sm', 'base', 'lg'], videoCardAuthorFontSize: ['xs', 'sm', 'base', 'lg'], textAutospaceMode: ['default', 'on', 'off'] }
  if (booleanKeys.some(key => typeof fields[key] !== 'boolean')
    || (fields.motionPreference !== undefined && !['system', 'reduce', 'full'].includes(String(fields.motionPreference)))
    || Object.entries(options).some(([key, allowed]) => !allowed.includes(String(fields[key])))
    || typeof fields.fontFamily !== 'string'
    || !isAppearanceColorsInput(fields.appearanceColors)
    || (fields.themeColor !== 'neutral' && !normalizeHexColor(fields.themeColor))
    || ['appearanceContrast', 'interfaceFontSize', 'frostedGlassBlurIntensity'].some(key => typeof fields[key] !== 'number' || !Number.isFinite(fields[key]))) {
    throw new TypeError('Invalid appearance settings')
  }
  return {
    ...Object.fromEntries(APPEARANCE_KEYS.filter(key => key in fields).map(key => [key, fields[key]])) as AppearanceFilePreferences,
    themeColor: normalizeThemeColor(fields.themeColor),
    appearanceColors: normalizeAppearanceColors(fields.appearanceColors),
    appearanceContrast: normalizeAppearanceNumber(fields.appearanceContrast, 0, 100, 0),
    interfaceFontSize: normalizeAppearanceNumber(fields.interfaceFontSize, INTERFACE_FONT_SIZE.min, INTERFACE_FONT_SIZE.max, INTERFACE_FONT_SIZE.default),
  }
}
