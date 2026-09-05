import { DANMAKU_EMPTY_STATE_SELECTOR, DANMAKU_GLASS_CLASS, DANMAKU_LIST_ITEM_SELECTOR, DANMAKU_LIST_VIEWPORT_SELECTOR, DANMAKU_RESIZE_DELAYS, DANMAKU_SOURCE_CLASS, DANMAKU_SOURCE_HOST_CLASS, selectors } from '~/utils/bewlyWidescreen/constants'
import { syncControlsGlassGeometry } from '~/utils/bewlyWidescreen/geometry'
import { t } from '~/utils/bewlyWidescreen/labels'
import { findFirst, findMovable } from '~/utils/bewlyWidescreen/nativeDom'
import { session } from '~/utils/bewlyWidescreen/session'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'
import { setupWidescreenDanmakuSemantics } from '~/utils/bewlyWidescreenNative'

function setupDanmakuSettingsClickToggle(source: HTMLElement) {
  let settingsPinned = false
  let stylePinned = false
  let dispatchingNativeHover = false
  const settingSelector = '.bpx-player-dm-setting'
  const settingPanelSelector = '.bpx-player-dm-setting-wrap, .bpx-player-dm-setting-box'
  const styleSelector = '.bpx-player-video-btn-dm'
  const stylePanelSelector = '.bpx-player-mode-selection-container'
  const setting = source.querySelector<HTMLElement>(settingSelector)
  const styleButton = source.querySelector<HTMLElement>(styleSelector)
  const originalAriaExpanded = setting?.getAttribute('aria-expanded') ?? null
  const originalStyleAriaExpanded = styleButton?.getAttribute('aria-expanded') ?? null
  const settingPanel = setting?.querySelector<HTMLElement>('.bpx-player-dm-setting-wrap')
  const stylePanel = styleButton?.querySelector<HTMLElement>(stylePanelSelector)
  const originalPanelDisplay = settingPanel?.style.display ?? ''
  const originalStylePanelActive = stylePanel?.classList.contains('active') ?? false
  setting?.setAttribute('aria-expanded', 'false')
  styleButton?.setAttribute('aria-expanded', 'false')
  stylePanel?.classList.remove('active')

  function dispatchNativeSettingHover(currentSetting: HTMLElement, entering: boolean) {
    const types = entering
      ? ['mouseover', 'mouseenter'] as const
      : ['mouseout', 'mouseleave'] as const
    dispatchingNativeHover = true
    try {
      for (const type of types) {
        currentSetting.dispatchEvent(new MouseEvent(type, {
          bubbles: type === 'mouseover' || type === 'mouseout',
          cancelable: true,
          composed: true,
          relatedTarget: entering ? null : source,
          view: window,
        }))
      }
    }
    finally {
      dispatchingNativeHover = false
    }
  }

  const setSettingsPinned = (nextPinned: boolean) => {
    const currentSetting = source.querySelector<HTMLElement>(settingSelector)
    if (!currentSetting || settingsPinned === nextPinned)
      return

    settingsPinned = nextPinned
    currentSetting.setAttribute('aria-expanded', String(nextPinned))
    let currentPanel = currentSetting.querySelector<HTMLElement>('.bpx-player-dm-setting-wrap')
    if (nextPinned && !currentPanel) {
      // Bilibili creates this panel lazily on hover. Keep that initialization
      // inside its native player tree, while CSS gates visibility to the click state.
      dispatchNativeSettingHover(currentSetting, true)
      currentPanel = currentSetting.querySelector<HTMLElement>('.bpx-player-dm-setting-wrap')
    }
    if (currentPanel)
      currentPanel.style.display = nextPinned ? 'block' : 'none'
    if (!nextPinned)
      dispatchNativeSettingHover(currentSetting, false)
  }

  const setStylePinned = (nextPinned: boolean) => {
    const currentStyleButton = source.querySelector<HTMLElement>(styleSelector)
    if (!currentStyleButton || stylePinned === nextPinned)
      return

    stylePinned = nextPinned
    currentStyleButton.setAttribute('aria-expanded', String(nextPinned))
    let currentPanel = currentStyleButton.querySelector<HTMLElement>(stylePanelSelector)
    if (nextPinned && !currentPanel) {
      dispatchNativeSettingHover(currentStyleButton, true)
      currentPanel = currentStyleButton.querySelector<HTMLElement>(stylePanelSelector)
    }
    currentPanel?.classList.toggle('active', nextPinned)
    if (!nextPinned) {
      dispatchNativeSettingHover(currentStyleButton, false)
      currentPanel?.classList.remove('active')
    }
  }

  const handleStyleHover = (event: Event) => {
    if (dispatchingNativeHover || !(event.target instanceof Element))
      return
    const currentStyleButton = event.target.closest<HTMLElement>(styleSelector)
    if (!currentStyleButton
      || !source.contains(currentStyleButton)
      || event.target.closest(stylePanelSelector)) {
      return
    }

    event.preventDefault()
    event.stopImmediatePropagation()
    if (!stylePinned)
      currentStyleButton.querySelector<HTMLElement>(stylePanelSelector)?.classList.remove('active')
  }

  const handleClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element))
      return

    const target = event.target
    const currentSetting = target.closest<HTMLElement>(settingSelector)
    const currentStyleButton = target.closest<HTMLElement>(styleSelector)
    if ((!currentSetting && !currentStyleButton) || !source.contains(target))
      return

    const insideSettingPanel = !!target.closest(settingPanelSelector)
    const insideStylePanel = !!target.closest(stylePanelSelector)
    if (currentSetting && !insideSettingPanel) {
      event.preventDefault()
      event.stopImmediatePropagation()
      setStylePinned(false)
      setSettingsPinned(!settingsPinned)
      return
    }

    if (currentStyleButton && !insideStylePanel) {
      event.preventDefault()
      event.stopImmediatePropagation()
      setSettingsPinned(false)
      setStylePinned(!stylePinned)
    }
  }

  const handleOutsideClick = (event: MouseEvent) => {
    if (!settingsPinned && !stylePinned)
      return
    const currentSetting = source.querySelector<HTMLElement>(settingSelector)
    const currentStyleButton = source.querySelector<HTMLElement>(styleSelector)
    if (event.target instanceof Node) {
      if (currentSetting?.contains(event.target) || currentStyleButton?.contains(event.target))
        return
    }
    setSettingsPinned(false)
    setStylePinned(false)
  }

  source.addEventListener('mouseover', handleStyleHover, true)
  source.addEventListener('mouseenter', handleStyleHover, true)
  source.addEventListener('mouseout', handleStyleHover, true)
  source.addEventListener('mouseleave', handleStyleHover, true)
  source.addEventListener('pointerover', handleStyleHover, true)
  source.addEventListener('pointerenter', handleStyleHover, true)
  source.addEventListener('pointerout', handleStyleHover, true)
  source.addEventListener('pointerleave', handleStyleHover, true)
  source.addEventListener('click', handleClick, true)
  document.addEventListener('click', handleOutsideClick, true)

  return () => {
    if (settingsPinned)
      setSettingsPinned(false)
    if (stylePinned)
      setStylePinned(false)
    source.removeEventListener('mouseover', handleStyleHover, true)
    source.removeEventListener('mouseenter', handleStyleHover, true)
    source.removeEventListener('mouseout', handleStyleHover, true)
    source.removeEventListener('mouseleave', handleStyleHover, true)
    source.removeEventListener('pointerover', handleStyleHover, true)
    source.removeEventListener('pointerenter', handleStyleHover, true)
    source.removeEventListener('pointerout', handleStyleHover, true)
    source.removeEventListener('pointerleave', handleStyleHover, true)
    source.removeEventListener('click', handleClick, true)
    document.removeEventListener('click', handleOutsideClick, true)
    const currentSetting = source.querySelector<HTMLElement>(settingSelector)
    const currentPanel = currentSetting?.querySelector<HTMLElement>('.bpx-player-dm-setting-wrap')
    if (currentPanel)
      currentPanel.style.display = originalPanelDisplay
    if (currentSetting) {
      if (originalAriaExpanded === null)
        currentSetting.removeAttribute('aria-expanded')
      else
        currentSetting.setAttribute('aria-expanded', originalAriaExpanded)
    }
    const currentStyleButton = source.querySelector<HTMLElement>(styleSelector)
    const currentStylePanel = currentStyleButton?.querySelector<HTMLElement>(stylePanelSelector)
    currentStylePanel?.classList.toggle('active', originalStylePanelActive)
    if (currentStyleButton) {
      if (originalStyleAriaExpanded === null)
        currentStyleButton.removeAttribute('aria-expanded')
      else
        currentStyleButton.setAttribute('aria-expanded', originalStyleAriaExpanded)
    }
  }
}

export function syncDanmakuInputSource(currentState: BewlyWidescreenState, force = false) {
  const source = findFirst(selectors.danmakuInput, currentState.playerEl)
    || findMovable(selectors.danmakuInput)
  const host = source?.parentElement
  if (!source || !host)
    return false

  if (!force
    && source === currentState.danmakuSemanticsSource
    && host === currentState.danmakuSourceHost
    && currentState.danmakuGlass?.isConnected
    && currentState.danmakuGlass.parentElement === host.parentElement) {
    return true
  }

  currentState.danmakuSemanticsCleanup?.()
  currentState.danmakuSettingsCleanup?.()
  currentState.danmakuGlass?.remove()
  currentState.danmakuGlass = undefined
  currentState.danmakuSemanticsSource?.classList.remove(DANMAKU_SOURCE_CLASS)
  currentState.danmakuSourceHost?.classList.remove(DANMAKU_SOURCE_HOST_CLASS)
  if (currentState.danmakuSourceHost && currentState.danmakuSourceHost !== host)
    currentState.resizeObserver?.unobserve(currentState.danmakuSourceHost)

  source.classList.add(DANMAKU_SOURCE_CLASS)
  host.classList.add(DANMAKU_SOURCE_HOST_CLASS)
  const glass = document.createElement('div')
  glass.className = DANMAKU_GLASS_CLASS
  glass.setAttribute('aria-hidden', 'true')
  host.parentElement?.insertBefore(glass, host)
  currentState.danmakuGlass = glass
  currentState.danmakuSemanticsSource = source
  currentState.danmakuSourceHost = host
  currentState.danmakuSemanticsCleanup = setupWidescreenDanmakuSemantics(
    source,
    {
      send: t('widescreen.send_danmaku'),
      settings: t('widescreen.danmaku_settings'),
      style: t('widescreen.danmaku_style'),
    },
  )
  currentState.danmakuSettingsCleanup = setupDanmakuSettingsClickToggle(source)
  currentState.resizeObserver?.observe(host)
  syncControlsGlassGeometry(currentState)
  requestAnimationFrame(() => {
    if (session.current === currentState)
      syncControlsGlassGeometry(currentState)
  })
  return true
}

export function clearDanmakuActivation(currentState: BewlyWidescreenState) {
  if (currentState.danmakuActivationTimer)
    clearTimeout(currentState.danmakuActivationTimer)
  currentState.danmakuActivationTimer = undefined
  currentState.danmakuResizeTimers?.forEach(timer => clearTimeout(timer))
  currentState.danmakuResizeTimers = []
  currentState.danmakuActivatedSource = undefined
  currentState.danmakuPendingSource = undefined
}

function scheduleDanmakuNativeRelayout(currentState: BewlyWidescreenState) {
  currentState.danmakuResizeTimers?.forEach(timer => clearTimeout(timer))
  currentState.danmakuResizeTimers = DANMAKU_RESIZE_DELAYS.map(delay => setTimeout(() => {
    if (session.current === currentState && currentState.activeTab === 'danmaku')
      window.dispatchEvent(new Event('resize'))
  }, delay))
}

export function isDanmakuPanelReady(panel: HTMLElement) {
  const listViewport = panel.querySelector<HTMLElement>(DANMAKU_LIST_VIEWPORT_SELECTOR)
  if (!listViewport)
    return false

  // Current Bpx uses hide-status for a completed (possibly empty) list and
  // dm-close/reset for authoritative disabled/error states. Reveal its retry UI.
  if (panel.querySelector('.bpx-player-dm.bpx-player-hide-status, .bpx-player-dm-load-status.bpx-player-dm-close, .bpx-player-dm-load-status .bpx-player-reset'))
    return true

  const loading = panel.querySelector<HTMLElement>('.bpx-player-dm-load-status')
  if (loading) {
    const loadingStyle = getComputedStyle(loading)
    if (loadingStyle.display !== 'none'
      && loadingStyle.visibility !== 'hidden'
      && loadingStyle.opacity !== '0') {
      return false
    }
  }

  return !!panel.querySelector(DANMAKU_LIST_ITEM_SELECTOR)
    || !!panel.querySelector(DANMAKU_EMPTY_STATE_SELECTOR)
}

export function activateDanmakuTab(currentState: BewlyWidescreenState) {
  const panel = currentState.panels.danmaku
  const source = findFirst(selectors.danmaku, panel)
  if (!source)
    return

  if (currentState.danmakuActivatedSource === source)
    return
  if (currentState.danmakuActivationTimer && currentState.danmakuPendingSource === source)
    return

  clearDanmakuActivation(currentState)
  currentState.danmakuPendingSource = source
  currentState.danmakuActivationTimer = setTimeout(() => {
    currentState.danmakuActivationTimer = undefined
    currentState.danmakuPendingSource = undefined
    if (session.current !== currentState || currentState.activeTab !== 'danmaku' || !source.isConnected)
      return

    const focusable = findFirst(selectors.danmakuFocusable, panel)
    const collapseBody = panel.querySelector<HTMLElement>('.bui-collapse-body')
    const inlineHeight = collapseBody?.style.height.trim()
    if (!focusable && !isDanmakuPanelReady(panel)) {
      scheduleDanmakuNativeRelayout(currentState)
      return
    }
    const isFolded = () => !!source.querySelector('.bui-collapse-wrap-folded')
    if (focusable && (isFolded() || inlineHeight === '0' || inlineHeight === '0px'))
      focusable.click()
    // The header may appear before its native click handler is bound. A click
    // that leaves it folded must not permanently mark activation as complete.
    if (!isFolded() && (focusable || isDanmakuPanelReady(panel)))
      currentState.danmakuActivatedSource = source
    scheduleDanmakuNativeRelayout(currentState)
  }, 120)
}
