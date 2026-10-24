import type { LocaleMessages, VueMessageType } from 'vue-i18n'
import { createI18n } from 'vue-i18n'

const english = import.meta.glob<LocaleMessages<VueMessageType>>('../_locales/en.yml', { eager: true, import: 'default' })['../_locales/en.yml']

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  globalInjection: true,
  messages: { en: english } as Record<string, LocaleMessages<VueMessageType>>,
})

const localeModules = import.meta.glob<{ default: LocaleMessages<VueMessageType> }>('../_locales/{cmn-CN,cmn-TW,jyut}.yml')
const pendingLocales = new Map<string, Promise<void>>()

export function loadLocaleMessages(language: string): Promise<void> {
  if (i18n.global.availableLocales.includes(language))
    return Promise.resolve()
  const pending = pendingLocales.get(language)
  if (pending)
    return pending
  const task = (async () => {
    try {
      const { default: messages } = await localeModules[`../_locales/${language}.yml`]()
      i18n.global.setLocaleMessage(language, messages)
    }
    finally {
      pendingLocales.delete(language)
    }
  })()
  pendingLocales.set(language, task)
  return task
}
