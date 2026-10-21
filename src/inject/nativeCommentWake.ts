interface NativeCommentList extends HTMLElement {
  lazyLoadDP?: { resolve?: () => void } | null
  reload?: () => Promise<unknown>
}

/**
 * `bili-comments` is `lazy-load`: its first request waits for an
 * IntersectionObserver hit. On the playback page the list shows in its own
 * column, but Bilibili re-renders its comment app after load and the fresh
 * list can wait below the fold, where no hit ever comes; its spinner then
 * never stops. Waking releases that wait exactly as the observer would. With
 * `reload`, a first page that still spins (a stalled request) loads again.
 */
export function wakeNativeCommentLists(value: unknown) {
  const reload = (value as { reload?: unknown } | null)?.reload === true
  let woken = 0
  for (const list of Array.from(document.querySelectorAll<NativeCommentList>('bili-comments'))) {
    const pending = list.lazyLoadDP
    if (pending && typeof pending.resolve === 'function') {
      pending.resolve()
      list.lazyLoadDP = null
      woken++
    }
    else if (reload && list.shadowRoot?.querySelector('#spinner-container') && typeof list.reload === 'function') {
      // A failed load is already logged by the list itself.
      list.reload().catch(() => {})
      woken++
    }
  }
  return woken
}
