export interface SearchFocusEffectOptions {
  disableFocusEffect: boolean
  disableFrostedGlass: boolean
}

export interface SearchFocusEffect {
  darkened: boolean
  blurred: boolean
}

export function resolveSearchFocusEffect(options: SearchFocusEffectOptions): SearchFocusEffect {
  if (options.disableFocusEffect)
    return { darkened: false, blurred: false }

  return options.disableFrostedGlass
    ? { darkened: true, blurred: false }
    : { darkened: false, blurred: true }
}
