export function normalizeIntlLocale(locale: string): string {
  return locale === 'jyut' ? 'zh-HK' : locale
}
