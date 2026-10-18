import type { SettingsStorageInitializationState } from '~/composables/useSettingsStorage'
import { AppPage } from '~/enums/appEnums'
import { getBilibiliLogicalPathname } from '~/utils/bilibiliLocale'

const BEWLY_BOOT_PAGES = new Set<string>(Object.values(AppPage))

export function shouldShowBewlyBootOverlay(rawUrl: string, inIframe: boolean): boolean {
  if (inIframe)
    return false

  try {
    const url = new URL(rawUrl)
    const pathname = getBilibiliLogicalPathname(url)
    const isBilibiliHome = (url.hostname === 'www.bilibili.com' || url.hostname === 'bilibili.com')
      && (pathname === '/' || pathname === '/index.html')
    return isBilibiliHome && BEWLY_BOOT_PAGES.has(url.searchParams.get('page') ?? '')
  }
  catch {
    return false
  }
}

export function canStartSettingsDependentBoot(
  state: SettingsStorageInitializationState,
  aborted: boolean,
  hasLocalSnapshot = false,
): boolean {
  return !aborted && (state === 'loaded' || (state === 'degraded' && hasLocalSnapshot))
}
