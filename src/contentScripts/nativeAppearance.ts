import '~/styles/variables.scss'
import '~/styles/fonts.scss'
import '~/styles/adaptedStyles/common/nativeSurfaces.scss'
import '~/styles/adaptedStyles/common/topBar.scss'
import '~/styles/adaptedStyles/common/footer.scss'
import '~/styles/adaptedStyles/common/btn.scss'
import '~/styles/blockAds.scss'

import browser from 'webextension-polyfill'

import { CONTENT_SCRIPT_COMMIT, CONTENT_SCRIPT_PING, CONTENT_SCRIPT_PONG } from '~/constants/contentScript'
import { getNativeSite } from '~/constants/nativeSites'
import { settings, settingsInitializationState } from '~/logic/storage'
import NATIVE_SITES_CSS from '~/styles/adaptedStyles/pages/nativeSites.scss?inline'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { selectNativeSiteCss } from '~/utils/nativeSiteCss'

import { setupNativeSiteAppearance } from './features/nativeSiteAppearance'

const DISPOSE_EVENT = 'bewly:native-appearance-dispose'
window.dispatchEvent(new Event(DISPOSE_EVENT))

// Only this site's rules, in place from document_start like the manifest
// sheet, and first in the document so native sheets still win ties.
const nativeSite = getNativeSite(location.hostname, location.pathname)
const siteStyle = nativeSite ? document.createElement('style') : undefined
if (nativeSite && siteStyle) {
  siteStyle.dataset.bewlyNativeSiteStyle = nativeSite
  siteStyle.textContent = selectNativeSiteCss(NATIVE_SITES_CSS, nativeSite)
  document.documentElement.prepend(siteStyle)
}
const events = new AbortController()
let stopAppearance = () => {}
let started = false
let startupAttempted = false
function start() {
  if (startupAttempted || events.signal.aborted)
    return
  if (settingsInitializationState.value === 'invalidated') {
    dispose()
    return
  }
  startupAttempted = true
  document.removeEventListener('DOMContentLoaded', start)
  document.removeEventListener('readystatechange', startWhenDocumentComplete)
  stopAppearance = setupNativeSiteAppearance()
  started = true
}
function startWhenDocumentComplete() {
  if (document.readyState === 'complete')
    start()
}
function dispose() {
  events.abort()
  started = false
  siteStyle?.remove()
  try {
    browser.runtime.onMessage.removeListener(handleRuntimeMessage)
  }
  catch (error) {
    if (!isExtensionContextInvalidatedError(error))
      console.error('[Bewly Nocturne] Failed to release native appearance messages:', error)
  }
  stopAppearance()
}
function handleRuntimeMessage(message: unknown) {
  if (events.signal.aborted || settingsInitializationState.value === 'invalidated'
    || !message || typeof message !== 'object' || !('type' in message) || message.type !== CONTENT_SCRIPT_PING) {
    return false
  }
  const manifest = browser.runtime.getManifest()
  const runtimeUrl = browser.runtime.getURL('')
  // A document can finish without delivering our DOMContentLoaded callback.
  // Reuse the existing bounded health check to recover that missed startup;
  // this never retries a failed attempt or revives an aborted context.
  startWhenDocumentComplete()
  const ready = started && settings.displayReady.value
  const expected = 'expectedIdentity' in message ? message.expectedIdentity : undefined
  if (ready && expected && typeof expected === 'object'
    && 'name' in expected && expected.name === manifest.name
    && 'version' in expected && expected.version === manifest.version
    && 'runtimeUrl' in expected && expected.runtimeUrl === runtimeUrl) {
    const runtimeGlobal = globalThis as typeof globalThis & {
      __BEWLY_NOCTURNE_RUNTIME_HEALTH__?: { checkedAt: number, version: string, runtimeUrl: string }
    }
    runtimeGlobal.__BEWLY_NOCTURNE_RUNTIME_HEALTH__ = { checkedAt: Date.now(), version: manifest.version, runtimeUrl }
    const prompt = document.getElementById('bewlycat-refresh-required')
    if (prompt?.dataset.promptVersion === manifest.version && prompt.dataset.runtimeUrl === runtimeUrl)
      prompt.remove()
  }
  return Promise.resolve({
    type: CONTENT_SCRIPT_PONG,
    name: manifest.name,
    version: manifest.version,
    runtimeUrl,
    commit: CONTENT_SCRIPT_COMMIT,
    phase: ready ? 'ready' : 'starting',
    documentStartedAt: performance.timeOrigin,
  })
}
browser.runtime.onMessage.addListener(handleRuntimeMessage)
window.addEventListener(DISPOSE_EVENT, dispose, { signal: events.signal })
window.addEventListener('pagehide', (event) => {
  if (!(event as PageTransitionEvent).persisted)
    dispose()
}, { signal: events.signal })
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true, signal: events.signal })
  document.addEventListener('readystatechange', startWhenDocumentComplete, { signal: events.signal })
}
else {
  start()
}
