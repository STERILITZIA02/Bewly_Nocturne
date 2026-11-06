import { watch } from 'vue'

import { useRouteState } from '~/composables/useRouteState'
import { BEWLY_IFRAME_DRAWER_HOST_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { momentFilterPolicy } from '~/logic/momentFilters'
import { isBilibiliMomentsFeed } from '~/utils/bilibiliLocale'
import { getDeepActiveElement } from '~/utils/dialogFocus'
import { i18n } from '~/utils/i18n'
import { isIframeDrawerHost } from '~/utils/iframeDrawerHost'
import type { MomentFilterCandidate } from '~/utils/momentFilter'
import { scrollToPosition } from '~/utils/scrollIntent'

const FEED = '.bili-dyn-list__items'
const CARD = '.bili-dyn-item'
const ROW = '.bili-dyn-list__item'
const HIDDEN = 'bewly-filtered-original-moment'
const COMMENTS = '.bili-comment-container, .bb-comment'
const FOLD = 'bewly-original-moments-fold-comment'
const BLANK = 'html, body, #app, #app > .bg, #app > .bgc, .bili-dyn-home--member, .bili-dyn-home--visitor, .bili-dyn-home--member > main, .bili-dyn-home--member > aside, .bili-dyn-list, .bili-dyn-list__items'
const INTERACTIVE = 'a, button, input, textarea, select, label, summary, video, audio, [contenteditable], [role], [popover], #bewly, .bili-dialog-bomb, .modal-wrapper, .bili-album__watch'

function syncFoldButton(card: HTMLElement) {
  const action = card.querySelector<HTMLElement>('.bili-dyn-action.comment.active')
  const container = card.querySelector<HTMLElement>(COMMENTS)
  const existing = card.querySelector<HTMLButtonElement>(`.${FOLD}`)
  if (!action || !container || card.querySelector('.fold-comment')) {
    existing?.remove()
    return
  }
  const button = existing ?? document.createElement('button')
  const label = String(i18n.global.t('moment_card.collapse_comments'))
  if (button.textContent !== label)
    button.textContent = label
  if (existing?.parentElement === container)
    return
  button.type = 'button'
  button.className = FOLD
  button.onclick = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const currentAction = card.querySelector<HTMLElement>('.bili-dyn-action.comment.active')
    if (!currentAction)
      return
    const scroller = document.scrollingElement as HTMLElement
    const top = card.getBoundingClientRect().top + scroller.scrollTop
    currentAction.click()
    currentAction.focus({ preventScroll: true })
    void scrollToPosition(scroller, Math.max(0, top - (Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bew-top-bar-height')) || 0)), 'smooth')
  }
  container.append(button)
}

function readOriginalMoment(card: HTMLElement, includeText = true): MomentFilterCandidate & { text: string } {
  const content = card.querySelector('.bili-dyn-content')
  if (!content)
    return { text: '' }
  const has = (selector: string) => content.matches(selector) || !!content.querySelector(selector)
  const labels = Array.from(card.querySelectorAll('.bili-dyn-item__tag, .bili-dyn-card-video__badge, .dyn-additional-common__head')).map(element => element.textContent ?? '').join(' ')
  const reservation = content.querySelector('.bili-dyn-card-reserve')
  const reservationLabel = reservation?.querySelector('[data-reservation-type], .bili-dyn-card-reserve__type')?.textContent?.trim()
    ?? reservation?.textContent ?? ''
  const reservationType = reservation?.getAttribute('data-reservation-type')
  const isVideoReservation = reservationType === 'video' || /视频预约|预约视频|影片預約|預約影片/u.test(reservationLabel)
  const isLiveReservation = reservationType === 'live' || /直播预约|预约直播|直播預約|預約直播/u.test(reservationLabel)
  const isPgc = has('.bili-dyn-card-pgc')
  const isUgcSeason = has('.bili-dyn-card-medialist, .dyn-ugc__wrap')
  return {
    text: includeText ? `${card.querySelector('.bili-dyn-title__text')?.textContent ?? ''}\n${content.textContent ?? ''}` : '',
    isUpRecommendation: labels.includes('UP主的推荐') || labels.includes('UP主的推薦'),
    isChargeExclusive: /充电专属|充電專屬/u.test(labels) || has('.bili-dyn-upower-common'),
    isVideoReservation: isVideoReservation && !isLiveReservation,
    isLiveReservation: isLiveReservation && !isVideoReservation,
    isLive: has('.bili-dyn-card-live'),
    isForward: has('.bili-dyn-content__orig.reference, .bili-dyn-content__forw'),
    isRegularVideo: has('.bili-dyn-card-video') && !isPgc && !isUgcSeason,
    isPgc,
    isUgcSeason,
    isArticle: has('.bili-dyn-card-article'),
    isDraw: has('.dyn-card-opus__pics, .bili-dyn-card-draw'),
  }
}

export function setupOriginalMomentsFeed() {
  if (location.hostname !== 't.bilibili.com')
    return () => {}
  const route = useRouteState()
  const feeds = new Map<HTMLElement, MutationObserver>()
  const pending = new Set<HTMLElement>()
  let discovery: MutationObserver | undefined
  let ancestors: MutationObserver | undefined
  let frame: number | undefined
  let style: HTMLStyleElement | undefined
  let listening = false
  let blankListening = false
  let pointerStart: { x: number, y: number, suppressed: boolean } | undefined
  let disposed = false
  const onFeed = () => isBilibiliMomentsFeed(route.href)
  const allowed = () => !disposed && !document.hidden && !isIframeDrawerHost()
    && onFeed()

  function pointerDown(event: PointerEvent) {
    const active = getDeepActiveElement(document)
    pointerStart = {
      x: event.clientX,
      y: event.clientY,
      suppressed: event.button !== 0 || window.getSelection()?.isCollapsed === false
        || !!active?.matches('input, textarea, select, [contenteditable], [role="textbox"]'),
    }
  }
  function cancelPointer() {
    pointerStart = undefined
  }
  function pointerMove(event: PointerEvent) {
    if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4)
      pointerStart.suppressed = true
  }
  function blankClick(event: MouseEvent) {
    const start = pointerStart
    pointerStart = undefined
    if (!start || start.suppressed || !event.isTrusted || event.defaultPrevented || event.button !== 0 || !event.detail
      || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey
      || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4 || window.getSelection()?.isCollapsed === false) {
      return
    }
    const path = event.composedPath().filter((node): node is Element => node instanceof Element)
    if (!path[0]?.matches(BLANK) || path.some(node => node.matches(INTERACTIVE)))
      return
    const actions: HTMLElement[] = []
    for (const root of feeds.keys()) {
      root.querySelectorAll<HTMLElement>('.bili-dyn-action.comment.active').forEach((action) => {
        const comments = action.closest(CARD)?.querySelector<HTMLElement>(COMMENTS)
        if (!comments?.checkVisibility())
          return
        const rect = comments.getBoundingClientRect()
        if (rect.bottom > 0 && rect.top < window.innerHeight)
          actions.push(action)
      })
    }
    actions.forEach(action => action.click())
  }

  function containerOf(element: Element) {
    let card = element.closest<HTMLElement>(CARD)
    while (card?.parentElement?.closest(CARD))
      card = card.parentElement.closest<HTMLElement>(CARD)
    const row = card?.closest<HTMLElement>(ROW) ?? element.closest<HTMLElement>(ROW)
    return row && !row.parentElement?.closest(CARD) ? row : card
  }
  function restore(element: Element) {
    element.classList.remove(HIDDEN)
    element.querySelectorAll(`.${HIDDEN}`).forEach(node => node.classList.remove(HIDDEN))
    element.querySelectorAll(`.${FOLD}`).forEach(node => node.remove())
  }
  function flush() {
    frame = undefined
    if (!allowed()) {
      pending.clear()
      return
    }
    const policy = momentFilterPolicy.value
    for (const container of pending) {
      const feed = container.closest<HTMLElement>(FEED)
      if (!container.isConnected || !feed || !feeds.has(feed))
        continue
      const card = container.matches(CARD) ? container : container.querySelector<HTMLElement>(CARD)
      const candidate = card && settings.value.originalMomentsUseBewlyFilters ? readOriginalMoment(card, policy.keywords.length > 0) : undefined
      const hidden = !!candidate && !policy.passes(candidate, candidate.text)
      if (container.classList.contains(HIDDEN) !== hidden)
        container.classList.toggle(HIDDEN, hidden)
      if (card)
        syncFoldButton(card)
    }
    pending.clear()
  }
  function queue(element: Element, descendants = false) {
    const container = containerOf(element)
    if (container)
      pending.add(container)
    if (descendants) {
      element.querySelectorAll<HTMLElement>(`${CARD},${ROW}`).forEach((node) => {
        const container = containerOf(node)
        if (container)
          pending.add(container)
      })
    }
    if (pending.size && frame === undefined)
      frame = requestAnimationFrame(flush)
  }
  function bind() {
    if (!allowed())
      return
    const roots = new Set(Array.from(document.querySelectorAll<HTMLElement>(FEED)))
    for (const [root, observer] of feeds) {
      if (!roots.has(root)) {
        observer.disconnect()
        restore(root)
        feeds.delete(root)
      }
    }
    for (const root of roots) {
      if (!feeds.has(root)) {
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            const element = record.target instanceof Element ? record.target : record.target.parentElement
            if (element)
              queue(element)
            record.addedNodes.forEach(node => node instanceof Element && queue(node, true))
            record.removedNodes.forEach(node => node instanceof Element && restore(node))
          }
        })
        observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-reservation-type'] })
        feeds.set(root, observer)
      }
      queue(root, true)
    }
    ancestors?.disconnect()
    if (roots.size) {
      discovery?.disconnect()
      discovery = undefined
      ancestors ??= new MutationObserver((records) => {
        if ([...feeds.keys()].some(root => !root.isConnected) || records.some(record => Array.from(record.addedNodes)
          .some(node => node instanceof Element && (node.matches(FEED) || node.querySelector(FEED))))) {
          bind()
        }
      })
      const parents = new Set<HTMLElement>()
      for (const root of roots) {
        for (let parent = root.parentElement; parent; parent = parent.parentElement)
          parents.add(parent)
      }
      parents.forEach(parent => ancestors!.observe(parent, { childList: true }))
    }
    else if (!discovery && document.body) {
      discovery = new MutationObserver((records) => {
        if (records.some(record => Array.from(record.addedNodes).some(node => node instanceof Element && (node.matches(FEED) || node.querySelector(FEED)))))
          bind()
      })
      discovery.observe(document.body, { childList: true, subtree: true })
    }
  }
  function release() {
    discovery?.disconnect()
    ancestors?.disconnect()
    discovery = undefined
    ancestors = undefined
    feeds.forEach((observer, root) => {
      observer.disconnect()
      restore(root)
    })
    feeds.clear()
    if (frame !== undefined)
      cancelAnimationFrame(frame)
    frame = undefined
    pending.clear()
    style?.remove()
    style = undefined
    document.querySelectorAll(`.${HIDDEN}`).forEach(element => element.classList.remove(HIDDEN))
  }
  function refresh() {
    const enabled = !disposed && onFeed()
    if (enabled !== listening) {
      listening = enabled
      if (enabled) {
        document.addEventListener('visibilitychange', refresh)
        window.addEventListener(BEWLY_IFRAME_DRAWER_HOST_CHANGE, refresh)
      }
      else {
        document.removeEventListener('visibilitychange', refresh)
        window.removeEventListener(BEWLY_IFRAME_DRAWER_HOST_CHANGE, refresh)
      }
    }
    const blankEnabled = allowed() && settings.value.originalMomentsClickBlankToFoldComments
    if (blankListening !== blankEnabled) {
      blankListening = blankEnabled
      if (blankEnabled) {
        document.addEventListener('pointerdown', pointerDown, true)
        document.addEventListener('pointermove', pointerMove, { capture: true, passive: true })
        document.addEventListener('pointercancel', cancelPointer, true)
        document.addEventListener('dragstart', cancelPointer, true)
        document.addEventListener('click', blankClick)
      }
      else {
        document.removeEventListener('pointerdown', pointerDown, true)
        document.removeEventListener('pointermove', pointerMove, true)
        document.removeEventListener('pointercancel', cancelPointer, true)
        document.removeEventListener('dragstart', cancelPointer, true)
        document.removeEventListener('click', blankClick)
        pointerStart = undefined
      }
    }
    if (!allowed()) {
      release()
      return
    }
    if (!style) {
      style = document.createElement('style')
      style.textContent = `.${HIDDEN} { display: none !important; }`
      document.documentElement.append(style)
    }
    bind()
  }
  const stop = watch([() => settings.value.originalMomentsUseBewlyFilters, () => settings.value.originalMomentsClickBlankToFoldComments, i18n.global.locale, () => route.navigationId, momentFilterPolicy], refresh, { immediate: true })
  return () => {
    disposed = true
    stop()
    refresh()
  }
}
