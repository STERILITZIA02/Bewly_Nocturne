import { i18n } from '~/utils/i18n'

export function t(key: string) {
  return String(i18n.global.t(key))
}
