export type EffectiveTopBarSource = 'bewly' | 'bilibili-native'

export const EFFECTIVE_TOP_BAR_SOURCE_ATTRIBUTE = 'data-bewly-top-bar-source'

export function resolveEffectiveTopBarSource(
  useOriginalBilibiliTopBar: boolean,
): EffectiveTopBarSource {
  return useOriginalBilibiliTopBar ? 'bilibili-native' : 'bewly'
}

export function applyEffectiveTopBarSource(doc: Document, source: EffectiveTopBarSource) {
  doc.documentElement.setAttribute(EFFECTIVE_TOP_BAR_SOURCE_ATTRIBUTE, source)
}
