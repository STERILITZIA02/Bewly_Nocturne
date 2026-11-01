import { watch } from 'vue'

import { AppPage } from '~/enums/appEnums'
import { useSettingsStore } from '~/stores/settingsStore'
import { buildPrivateConversationUrl } from '~/utils/privateConversationRoute'

/** Keep the native anchors so keyboard, middle click and the context menu use the same destination. */
export function bindAuthorMessageLinks(slot: HTMLElement) {
  const store = useSettingsStore()
  return watch(() => store.getDockItemIsUseOriginalBiliPage(AppPage.Notifications), (original, _, onCleanup) => {
    if (original)
      return

    const links = new Map<HTMLAnchorElement, { nativeHref: string, bewlyHref: string }>()
    function restore(link: HTMLAnchorElement) {
      const saved = links.get(link)!
      // A native rerender may already have assigned the next uploader's link.
      if (link.href === saved.bewlyHref)
        link.setAttribute('href', saved.nativeHref)
      links.delete(link)
    }
    function sync() {
      for (const [link, saved] of links) {
        if (!slot.contains(link) || link.href !== saved.bewlyHref)
          restore(link)
      }
      for (const link of slot.querySelectorAll<HTMLAnchorElement>('a[href]')) {
        if (link.hostname !== 'message.bilibili.com')
          continue
        const mid = /^#\/?whisper\/mid([1-9]\d*)\/?(?:\?.*)?$/.exec(link.hash)?.[1]
        if (!mid)
          continue
        const bewlyHref = buildPrivateConversationUrl({ talkerId: mid, sessionType: 1 })
        links.set(link, { nativeHref: link.getAttribute('href')!, bewlyHref })
        link.href = bewlyHref
      }
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(slot, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] })
    onCleanup(() => {
      observer.disconnect()
      for (const link of links.keys())
        restore(link)
    })
  }, { immediate: true, flush: 'sync' })
}
