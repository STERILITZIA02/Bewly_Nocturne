import type { Ref } from 'vue'
import { onScopeDispose, ref, watch } from 'vue'

import { IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'
import { createIframeDocumentHost } from '~/utils/iframeDocument'
import { getIframeMessageData } from '~/utils/iframeMessage'
import { IFRAME_SEARCH_REQUEST, parseIframeSearch } from '~/utils/iframeSearch'
import { openSearchResultsInCurrentTab, resolveSearchNavigationTarget } from '~/utils/searchNavigation'

import { useDark } from './useDark'

/** Theme and verified current location share one ready handshake per host. */
export function useIframeDocumentHost(frame: Ref<HTMLIFrameElement | null | undefined>, active: () => boolean) {
  const { isDark } = useDark()
  const currentHref = ref('')
  const photoViewerOpen = ref(false)
  const channel = createIframeDocumentHost(() => active() ? frame.value : null)
  let lastSearchRequestId = 0
  function syncTheme() {
    if (active())
      channel.send({ type: IFRAME_DARK_MODE_CHANGE, isDark: isDark.value })
  }
  function loaded() {
    currentHref.value = ''
    photoViewerOpen.value = false
    lastSearchRequestId = 0
    channel.request()
  }
  function receive(event: MessageEvent) {
    if (!active())
      return
    const binding = channel.receive(event)
    if (binding) {
      currentHref.value = binding.href
      photoViewerOpen.value = false
      syncTheme()
    }
    const data = getIframeMessageData(event, frame.value)
    if (data?.type === 'IFRAME_PHOTO_VIEWER_STATE' && channel.matches(data) && typeof data.isOpen === 'boolean') {
      photoViewerOpen.value = data.isOpen
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
    openSearchResultsInCurrentTab(resolveSearchNavigationTarget(search.keyword, search.category))
  }
  watch([frame, active], ([iframe, enabled], _previous, onCleanup) => {
    channel.clear()
    lastSearchRequestId = 0
    currentHref.value = ''
    photoViewerOpen.value = false
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
  watch(isDark, syncTheme)
  onScopeDispose(() => {
    window.removeEventListener('message', receive)
    channel.clear()
    photoViewerOpen.value = false
  })
  return { currentHref, channel, photoViewerOpen }
}
