import type { PageMode } from './pageMode'

export type EffectiveTopBarSource = 'bewly' | 'bilibili-native'

export const EFFECTIVE_TOP_BAR_SOURCE_ATTRIBUTE = 'data-bewly-top-bar-source'

export function resolveEffectiveTopBarSource(
  pageMode: PageMode,
  customUseOriginalBilibiliTopBar: boolean,
): EffectiveTopBarSource {
  if (pageMode === 'original')
    return 'bilibili-native'
  if (pageMode === 'bewly')
    return 'bewly'
  return customUseOriginalBilibiliTopBar ? 'bilibili-native' : 'bewly'
}

export function showBewlyTopBar(source: EffectiveTopBarSource) {
  return source === 'bewly'
}

export function showNativeBilibiliTopBar(source: EffectiveTopBarSource) {
  return source === 'bilibili-native'
}

export function applyEffectiveTopBarSource(doc: Document, source: EffectiveTopBarSource) {
  doc.documentElement.setAttribute(EFFECTIVE_TOP_BAR_SOURCE_ATTRIBUTE, source)
}
