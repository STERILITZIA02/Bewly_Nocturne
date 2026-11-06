import { settings } from '~/logic'
import { i18n } from '~/utils/i18n'

import { LanguageType } from './../enums/appEnums'

export const { t } = i18n.global

const COUNT_MULTIPLIERS: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, 万: 1e4, 萬: 1e4, 千万: 1e7, 千萬: 1e7, 亿: 1e8, 億: 1e8 }
const COUNT_UNITS = {
  simplified: [[1e8, ' 亿'], [1e7, ' 千万'], [1e4, ' 万'], [1, ' ']],
  traditional: [[1e8, ' 億'], [1e7, ' 千萬'], [1e4, ' 萬'], [1, ' ']],
  latin: [[1e9, 'B'], [1e6, 'M'], [1e3, 'K'], [1, '']],
} as const

export function parseStatNumber(value?: number | string | null): number | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined

  if (typeof value !== 'string')
    return undefined

  // A count may contain grouped digits and one display unit; arbitrary text
  // containing digits is not numeric evidence (nor is a missing-stat marker).
  const match = /^([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|[+-]?\.\d+)\s*([kmb亿億]|千?[万萬])?$/i.exec(value.trim())
  if (!match)
    return undefined
  const numeric = Number(match[1].replace(/,/g, '')) * (COUNT_MULTIPLIERS[match[2]?.toLowerCase()] ?? 1)
  return Number.isFinite(numeric) ? numeric : undefined
}

/** A compact count in the interface language (1.2 万, 1.2K); input that is not a count is shown as given. */
export function numFormatter(num: number | string | null | undefined): string {
  const value = parseStatNumber(num)
  if (value === undefined)
    return typeof num === 'string' && num.trim() ? num.trim() : '0'
  const language = settings.value.language
  const units = language === LanguageType.Mandarin_CN
    ? COUNT_UNITS.simplified
    : language === LanguageType.Cantonese || language === LanguageType.Mandarin_TW ? COUNT_UNITS.traditional : COUNT_UNITS.latin
  for (const [threshold, symbol] of units) {
    if (Math.abs(value) >= threshold)
      return (value / threshold).toFixed(1).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1') + symbol
  }
  return String(value)
}

export function calcTimeSince(date: number | string | Date) {
  const now = new Date()
  const targetDate = new Date(date)
  const diffMs = now.getTime() - targetDate.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)

  // Compare calendar dates: a local day can be 23 or 25 hours across DST.
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const target = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())
  const daysDiff = (today - target) / (1000 * 60 * 60 * 24)

  if (daysDiff === 0) {
    // 当天
    if (diffSeconds < 60) {
      return t('common.just_now')
    }
    const minutes = Math.floor(diffSeconds / 60)
    if (minutes < 60) {
      return `${minutes} ${t('common.minute', minutes)}`
    }
    const hours = Math.floor(diffSeconds / 3600)
    return `${hours} ${t('common.hour', hours)}`
  }
  else if (daysDiff === 1) {
    // 昨天
    return t('common.yesterday')
  }
  else {
    // 显示具体日期
    const year = targetDate.getFullYear()
    const month = targetDate.getMonth() + 1
    const day = targetDate.getDate()

    // 如果是同一年，只显示月日
    if (year === now.getFullYear()) {
      return `${month}-${day}`
    }
    else {
      return `${year}-${month}-${day}`
    }
  }
}

export function calcCurrentTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  totalSeconds %= 3600
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (hours <= 0)
    return `${minutes < 10 ? `0${minutes}` : minutes}:${seconds < 10 ? `0${seconds}` : seconds}`

  return `${hours < 10 ? `0${hours}` : hours}:${minutes < 10 ? `0${minutes}` : minutes}:${seconds < 10 ? `0${seconds}` : seconds}`
}
