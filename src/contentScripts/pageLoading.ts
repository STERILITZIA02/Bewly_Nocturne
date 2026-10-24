import { isContentScriptTargetUrl } from '../constants/contentScript'
import { isConfirmedLiveEmbeddedFrame } from '../utils/bilibiliLiveContext'
import { getPageLoadingGuard } from './pageLoadingGuard'

declare const chrome: { runtime: Pick<typeof browser.runtime, 'getURL'> }

if (!/Electron/i.test(navigator.userAgent) && isContentScriptTargetUrl(document.URL) && !isConfirmedLiveEmbeddedFrame()) {
  const loading = getPageLoadingGuard()
  const runtime = typeof browser === 'undefined' ? chrome.runtime : browser.runtime
  void import(runtime.getURL('dist/contentScripts/runtime.js')).catch((error) => {
    loading.dispose(true)
    console.error('[Bewly Nocturne] Failed to load content runtime:', error)
  })
}
