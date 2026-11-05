// @unocss-include
import { nextTick } from 'vue'

import { t } from '~/utils/bewlyWidescreen/labels'
import type { DanmakuView } from '~/utils/bewlyWidescreen/railTabs'
import { danmakuViews } from '~/utils/bewlyWidescreen/railTabs'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'
import { afterMotion } from '~/utils/motionPriority'

const VIEW_LABELS: Record<DanmakuView, string> = {
  LIST: 'widescreen.danmaku_list',
  BLOCK: 'widescreen.danmaku_block',
  ADV: 'widescreen.danmaku_advanced',
}
const VIEWS = Object.keys(VIEW_LABELS) as DanmakuView[]
const HISTORY_ICON_CLASS = 'bewly-danmaku-history-icon'

/*
 * The danmaku panel's list / block settings / advanced views as a track
 * segment row in place of Bpx's view menu. Bpx stays the authority: a pick
 * clicks its menu item (once the plate lands), and the row follows the item
 * Bpx marks as shown (`bui-hide`).
 */

export function createDanmakuViews() {
  const tablist = document.createElement('div')
  tablist.className = 'bewly-widescreen-danmaku-views bew-segment-control bew-segment-control--surface bew-segment-control--track'
  tablist.setAttribute('role', 'tablist')
  tablist.hidden = true
  for (const view of VIEWS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'bew-segment-control__item'
    button.dataset.segmentItem = ''
    button.dataset.view = view
    button.setAttribute('role', 'tab')
    button.textContent = t(VIEW_LABELS[view])
    button.addEventListener('click', () => chooseView(view))
    tablist.append(button)
  }
  tablist.addEventListener('keydown', (event) => {
    const index = VIEWS.indexOf((event.target as HTMLElement).dataset.view as DanmakuView)
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
    if (index < 0 || !step)
      return
    event.preventDefault()
    const next = VIEWS[(index + step + VIEWS.length) % VIEWS.length]
    chooseView(next)
    tablist.querySelector<HTMLElement>(`[data-view="${next}"]`)?.focus({ preventScroll: true })
  })
  return tablist
}

export function refreshDanmakuViewLabels(tablist: HTMLElement) {
  for (const button of tablist.querySelectorAll<HTMLElement>('[data-view]'))
    button.textContent = t(VIEW_LABELS[button.dataset.view as DanmakuView])
}

function markView(tablist: HTMLElement, view: DanmakuView) {
  for (const button of tablist.querySelectorAll<HTMLElement>('[data-view]')) {
    const active = button.dataset.view === view
    button.dataset.active = String(active)
    button.setAttribute('aria-selected', String(active))
    button.tabIndex = active ? 0 : -1
  }
  danmakuViews.publish(tablist, view)
}

function shownView(currentState: BewlyWidescreenState) {
  return currentState.danmakuViewItems?.find(item => item.classList.contains('bui-hide'))?.dataset.value as DanmakuView | undefined
}

/** Also tells the panel which view shows (the list's column hairline, layout.ts). */
function markShownView(currentState: BewlyWidescreenState) {
  const view = shownView(currentState)
  const panel = currentState.panels.danmaku
  if (!view) {
    delete panel.dataset.bewlyDanmakuView
    return
  }
  panel.dataset.bewlyDanmakuView = view
  markView(currentState.danmakuViews, view)
}

let viewChoice = 0

function chooseView(view: DanmakuView) {
  const currentState = session.current
  if (!currentState)
    return
  const choice = ++viewChoice
  markView(currentState.danmakuViews, view)
  if (shownView(currentState) === view)
    return
  void nextTick()
    .then(() => afterMotion(danmakuViews.motion))
    .then(() => {
      if (choice !== viewChoice || session.current !== currentState)
        return
      currentState.danmakuViewItems?.find(item => item.dataset.value === view)?.click()
      markShownView(currentState)
    })
}

/** Binds the row to the menu of the danmaku box now in the panel. */
export function syncDanmakuViews(currentState: BewlyWidescreenState) {
  const items = Array.from(currentState.panels.danmaku.querySelectorAll<HTMLElement>('.bpx-player-filter .bui-dropdown-item[data-value]'))
  const bound = currentState.danmakuViewItems
  if (!bound || items.length !== bound.length || items.some((item, index) => item !== bound[index])) {
    currentState.danmakuViewsObserver?.disconnect()
    const observer = new MutationObserver(() => markShownView(currentState))
    for (const item of items)
      observer.observe(item, { attributes: true, attributeFilter: ['class'] })
    currentState.danmakuViewsObserver = observer
    currentState.danmakuViewItems = items
  }
  currentState.danmakuViews.hidden = items.length === 0
  markShownView(currentState)
  addHistoryIcon(currentState.panels.danmaku)
}

/** Bpx's history button is text only; a history glyph leads it. */
function addHistoryIcon(panel: HTMLElement) {
  const button = panel.querySelector('.bpx-player-dm-btn-history')
  if (!button || button.querySelector(`.${HISTORY_ICON_CLASS}`))
    return
  const icon = document.createElement('i')
  icon.className = `i-tabler:history ${HISTORY_ICON_CLASS}`
  icon.setAttribute('aria-hidden', 'true')
  button.prepend(icon)
}

export function clearDanmakuViews(currentState: BewlyWidescreenState) {
  currentState.danmakuViewsObserver?.disconnect()
  currentState.danmakuViewsObserver = undefined
  currentState.danmakuViewItems = undefined
  delete currentState.panels.danmaku.dataset.bewlyDanmakuView
  danmakuViews.clear(currentState.danmakuViews)
}
