import browser from 'webextension-polyfill'

import { LanguageType } from '~/enums/appEnums'
import { settings } from '~/logic'

import { i18n } from './i18n'
import { normalizeInterfaceLanguageTag, resolveInterfaceLanguage } from './interfaceLanguagePolicy'

const supportedLanguages = new Set<string>(Object.values(LanguageType))
let languageResolution: Promise<LanguageType> | undefined

export function applyInterfaceLanguage(language: LanguageType): void {
  i18n.global.locale.value = language
  if (typeof document === 'undefined')
    return

  document.documentElement.lang = language === LanguageType.Mandarin_CN
    ? 'zh-CN'
    : language === LanguageType.Mandarin_TW
      ? 'zh-TW'
      : language === LanguageType.Cantonese
        ? 'zh-HK'
        : 'en'
}

export async function ensureInterfaceLanguage(): Promise<LanguageType> {
  const configuredLanguage = settings.value.language
  if (supportedLanguages.has(configuredLanguage)) {
    const language = configuredLanguage as LanguageType
    applyInterfaceLanguage(language)
    return language
  }

  const resolution = languageResolution ??= (async () => {
    let uiLanguage = 'en'
    try {
      uiLanguage = browser.i18n.getUILanguage()
    }
    catch {
      // A stale extension context keeps the deterministic English fallback.
    }
    let acceptedLanguages: string[] = []
    if (normalizeInterfaceLanguageTag(uiLanguage).startsWith('zh-tw')) {
      try {
        acceptedLanguages = await browser.i18n.getAcceptLanguages()
      }
      catch {
        // Extension invalidation falls back to the synchronous UI language.
      }
    }

    const detectedLanguage = resolveInterfaceLanguage(uiLanguage, acceptedLanguages)
    const currentLanguage = settings.value.language
    const language = supportedLanguages.has(currentLanguage)
      ? currentLanguage as LanguageType
      : detectedLanguage
    if (!supportedLanguages.has(currentLanguage))
      settings.value.language = language
    applyInterfaceLanguage(language)
    return language
  })()

  try {
    return await resolution
  }
  finally {
    if (languageResolution === resolution)
      languageResolution = undefined
  }
}
