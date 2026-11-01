import { isContentScriptTargetUrl } from '../constants/contentScript'
import { isConfirmedLiveEmbeddedFrame } from '../utils/bilibiliLiveContext'
import { getPageLoadingGuard } from './pageLoadingGuard'

declare const chrome: { runtime: Pick<typeof browser.runtime, 'getURL'> }

if (!/Electron/i.test(navigator.userAgent) && isContentScriptTargetUrl(document.URL) && !isConfirmedLiveEmbeddedFrame()) {
  const loading = getPageLoadingGuard()
  const runtime = typeof browser === 'undefined' ? chrome.runtime : browser.runtime
  // Watch rewrites this small entry at a stable path. Revalidate its chunk
  // selection on every dev page load; the imported chunks keep their hashes.
  const entry = runtime.getURL('dist/contentScripts/runtime.js')
  void import(__DEV__ ? `${entry}?dev=${Date.now()}` : entry).catch((error) => {
    loading.dispose(true)
    console.error('[Bewly Nocturne] Failed to load content runtime:', error)
  })
}
