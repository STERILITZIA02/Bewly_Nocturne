import type { SettingsStorageInitializationState } from '~/composables/useSettingsStorage'
import { AppPage } from '~/enums/appEnums'

const BEWLY_BOOT_PAGES = new Set<string>(Object.values(AppPage))

export function shouldShowBewlyBootOverlay(rawUrl: string, inIframe: boolean): boolean {
  if (inIframe)
    return false

  try {
    const url = new URL(rawUrl)
    const isBilibiliHome = (url.hostname === 'www.bilibili.com' || url.hostname === 'bilibili.com')
      && (url.pathname === '/' || url.pathname === '/index.html')
    return isBilibiliHome && BEWLY_BOOT_PAGES.has(url.searchParams.get('page') ?? '')
  }
  catch {
    return false
  }
}

export function canStartSettingsDependentBoot(
  state: SettingsStorageInitializationState,
  aborted: boolean,
): boolean {
  return state === 'loaded' && !aborted
}
