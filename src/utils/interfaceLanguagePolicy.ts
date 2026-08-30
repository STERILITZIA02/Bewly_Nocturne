import { LanguageType } from '~/enums/appEnums'

export function normalizeInterfaceLanguageTag(value: string): string {
  return value.trim().replaceAll('_', '-').toLowerCase()
}

export function resolveInterfaceLanguage(
  uiLanguage: string,
  acceptedLanguages: readonly string[],
): LanguageType {
  const uiTag = normalizeInterfaceLanguageTag(uiLanguage)
  const acceptedTags = acceptedLanguages.map(normalizeInterfaceLanguageTag)
  const usesCantonese = [uiTag, ...acceptedTags].some(tag => (
    tag === 'yue'
    || tag.startsWith('yue-')
    || tag === 'zh-hk'
    || tag.startsWith('zh-hk-')
    || tag === 'zh-mo'
    || tag.startsWith('zh-mo-')
  ))
  if (usesCantonese)
    return LanguageType.Cantonese
  if (uiTag === 'zh-tw' || uiTag.startsWith('zh-tw-') || uiTag.includes('hant'))
    return LanguageType.Mandarin_TW
  if (uiTag === 'zh-cn' || uiTag.startsWith('zh-cn-') || uiTag.includes('hans') || uiTag === 'zh')
    return LanguageType.Mandarin_CN
  return LanguageType.English
}
