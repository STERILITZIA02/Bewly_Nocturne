export const DEFAULT_SCREENSHOT_SHORTCUT = 'Shift+S'

export function screenshotKey(event: KeyboardEvent) {
  return [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.metaKey && 'Meta', event.shiftKey && 'Shift', event.key.length === 1 ? event.key.toUpperCase() : event.key].filter(Boolean).join('+')
}

export function isValidScreenshotShortcut(value: unknown): value is string {
  if (value === '')
    return true
  if (typeof value !== 'string' || !/^(?:(?:Ctrl|Alt|Meta|Shift)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/.test(value))
    return false
  // Avoid common browser navigation and editing shortcuts.
  return !/^(?:Ctrl|Meta)\+(?:[ACFLNPRSTV-Z]|Shift\+[NPRTWZ])$/.test(value)
}
