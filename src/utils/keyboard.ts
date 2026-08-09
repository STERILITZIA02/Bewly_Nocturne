type KeyboardEventInput = Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>

const MODIFIER_KEYS = new Set(['Alt', 'Control', 'Dead', 'Meta', 'Shift'])

export function normalizeKeyboardEvent(event: KeyboardEventInput): string | null {
  if (MODIFIER_KEYS.has(event.key))
    return null

  const parts: string[] = []
  const isShiftedEqual = event.code === 'Equal' && event.shiftKey && event.key === '+'

  if (event.ctrlKey)
    parts.push('Ctrl')
  if (event.altKey)
    parts.push('Alt')
  if (event.shiftKey && !isShiftedEqual)
    parts.push('Shift')
  if (event.metaKey)
    parts.push('Meta')

  const specialKeys: Record<string, string> = {
    ' ': 'Space',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'Escape': 'Esc',
  }
  const mainKey = specialKeys[event.key]
    ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key)

  parts.push(mainKey)
  return parts.join('+')
}
