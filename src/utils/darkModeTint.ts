export const NEUTRAL_DARK_BASE_COLOR = '#2b2b2b'

/** Keep the saved tint intact while the neutral default is active. */
export function resolveDarkModeBaseColor(settings: { enableDarkModeTint?: unknown, darkModeBaseColor?: unknown }): string {
  return settings.enableDarkModeTint === true
    && typeof settings.darkModeBaseColor === 'string'
    && /^#[\da-f]{6}$/i.test(settings.darkModeBaseColor)
    ? settings.darkModeBaseColor
    : NEUTRAL_DARK_BASE_COLOR
}
