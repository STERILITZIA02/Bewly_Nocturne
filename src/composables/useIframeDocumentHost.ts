import type { Ref } from 'vue'
import { onScopeDispose, ref, watch } from 'vue'

import { IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'
import { createIframeDocumentHost } from '~/utils/iframeDocument'
import { getIframeMessageData } from '~/utils/iframeMessage'
import { IFRAME_SEARCH_REQUEST, parseIframeSearch } from '~/utils/iframeSearch'
import { IFRAME_PLAYBACK_RATE, registerIframePlaybackRate } from '~/utils/playbackRateCommand'
import { openSearchResultsInCurrentTab, resolveSearchNavigationTarget } from '~/utils/searchNavigation'

import { useDark } from './useDark'

/** Theme and verified current location share one ready handshake per host. */
export function useIframeDocumentHost(frame: Ref<HTMLIFrameElement | null | undefined>, active: () => boolean, playbackActive: () => boolean = () => false) {
  const { isDark, isOledDark, darkModeBaseColor } = useDark()
  const currentHref = ref('')
  const channel = createIframeDocumentHost(() => active() ? frame.value : null)
  let lastSearchRequestId = 0
  let commandId = 0
  let pendingRate: { id: number, finish: (applied: boolean) => void } | undefined
  function applyRate(rate: number): Promise<boolean> {
    pendingRate?.finish(false)
    return new Promise((resolve) => {
      const id = ++commandId
      const timer = setTimeout(() => finish(false), 1500)
      function finish(applied: boolean) {
        clearTimeout(timer)
        if (pendingRate?.id === id)
          pendingRate = undefined
        resolve(applied)
      }
      pendingRate = { id, finish }
      if (!active() || !playbackActive() || !channel.send({ type: IFRAME_PLAYBACK_RATE, phase: 'apply', requestId: id, rate }))
        finish(false)
    })
  }
  watch(playbackActive, (enabled, _previous, onCleanup) => {
    if (enabled)
      onCleanup(registerIframePlaybackRate(applyRate))
  }, { immediate: true, flush: 'sync' })
  function syncTheme() {
    if (active())
      channel.send({ type: IFRAME_DARK_MODE_CHANGE, isDark: isDark.value, isOledDark: isOledDark.value, darkModeBaseColor: darkModeBaseColor.value })
  }
  function loaded() {
    pendingRate?.finish(false)
    currentHref.value = ''
    lastSearchRequestId = 0
    channel.request()
  }
  function receive(event: MessageEvent) {
    if (!active())
      return
    const binding = channel.receive(event)
    if (binding) {
      currentHref.value = binding.href
      syncTheme()
    }
    const data = getIframeMessageData(event, frame.value)
    if (data?.type === IFRAME_PLAYBACK_RATE && channel.matches(data) && data.phase === 'result'
      && data.requestId === pendingRate?.id) {
      pendingRate?.finish(data.applied === true)
      return
    }
    if (data?.type !== IFRAME_SEARCH_REQUEST || !channel.matches(data) || data.intent !== 'currentTab'
      || !Number.isSafeInteger(data.requestId) || Number(data.requestId) <= lastSearchRequestId) {
      return
    }
    const search = parseIframeSearch(data)
    if (!search)
      return
    lastSearchRequestId = Number(data.requestId)
    const target = new URL(resolveSearchNavigationTarget(search.keyword))
    if (search.category !== 'all') {
      if (target.hostname === 'www.bilibili.com')
        target.searchParams.set('category', search.category)
      else target.pathname = `/${search.category === 'user' ? 'upuser' : search.category}`
    }
    openSearchResultsInCurrentTab(target.href)
  }
  watch([frame, active], ([iframe, enabled], _previous, onCleanup) => {
    pendingRate?.finish(false)
    channel.clear()
    lastSearchRequestId = 0
    currentHref.value = ''
    if (!iframe || !enabled)
      return
    window.addEventListener('message', receive)
    iframe.addEventListener('load', loaded)
    channel.request()
    onCleanup(() => {
      iframe.removeEventListener('load', loaded)
      window.removeEventListener('message', receive)
    })
  }, { flush: 'post', immediate: true })
  watch([isDark, isOledDark, darkModeBaseColor], syncTheme)
  onScopeDispose(() => {
    pendingRate?.finish(false)
    window.removeEventListener('message', receive)
    channel.clear()
  })
  return { currentHref, channel }
}
