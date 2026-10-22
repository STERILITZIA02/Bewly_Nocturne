interface NativeCommentList extends HTMLElement {
  showSpinner: boolean
  showContinuations: boolean
  showEnd: boolean
  paginationStr: string
  getList: () => Promise<unknown>
  disposables: { add: (dispose: () => void) => void }
}

interface Continuation {
  panel: Element
  trigger: Element
  observer: IntersectionObserver
  cursor?: string
}

const continuations = new WeakMap<HTMLElement, Continuation>()

/** The native window-scroll fallback does not follow a list moved into the rail. */
export function syncNativeCommentContinuation(component: HTMLElement) {
  const list = component as NativeCommentList
  const previous = continuations.get(list)
  const panel = list.closest('#bewly-widescreen-root .bewly-widescreen-panel-comment')
  const trigger = list.shadowRoot?.querySelector('#continuations .trigger')
  if (!list.isConnected || !panel || !trigger || list.showEnd) {
    previous?.observer.disconnect()
    continuations.delete(list)
    return
  }

  let state = previous
  if (!state || state.panel !== panel || state.trigger !== trigger) {
    previous?.observer.disconnect()
    const observer = new IntersectionObserver((entries) => {
      if (continuations.get(list)?.observer !== observer || !list.isConnected || panel.hasAttribute('hidden')
        || list.showSpinner || list.showContinuations || list.showEnd) {
        return
      }
      if (entries.some(entry => entry.isIntersecting))
        void list.getList()
    }, { root: panel })
    state = { panel, trigger, observer }
    continuations.set(list, state)
    observer.observe(trigger)
    list.disposables.add(() => {
      observer.disconnect()
      if (continuations.get(list)?.observer === observer)
        continuations.delete(list)
    })
  }

  // A hit while loading is ignored. Recheck after a successful page even if
  // the sentinel never left the viewport (short/filtered pages). An unchanged
  // cursor after a failed request must not become an automatic retry loop.
  if (!list.showSpinner && !list.showContinuations && state.cursor !== list.paginationStr) {
    state.cursor = list.paginationStr
    state.observer.unobserve(trigger)
    state.observer.observe(trigger)
  }
}
