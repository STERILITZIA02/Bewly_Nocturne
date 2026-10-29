import { usePreferredDark } from '@vueuse/core'
import { effectScope, onScopeDispose } from 'vue'

import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { applyAppearanceStyle, getAppearanceStyle, resolveAppearanceAccent } from '~/utils/appearance'
import { createIframeDocumentClient } from '~/utils/iframeDocument'
import { getParentMessageData } from '~/utils/iframeMessage'
import { isVideoPlaybackPage, setCookie } from '~/utils/main'
import { holdAnimation } from '~/utils/motionPriority'
import { getMotionDuration } from '~/utils/motionTiming'
import { applyMotionPreference, prefersReducedMotion } from '~/utils/reducedMotion'

const currentMinuteOfDay = ref(getCurrentMinuteOfDay())
let scheduleClockInterval: number | null = null
let lastThemeChangeState: boolean | undefined

function getCurrentMinuteOfDay(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

function parseTime(value: string, fallback: number): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match)
    return fallback

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59)
    return fallback

  return hours * 60 + minutes
}

function isWithinLightSchedule(current: number, startTime: string, endTime: string): boolean {
  const start = parseTime(startTime, 6 * 60)
  const end = parseTime(endTime, 18 * 60)

  if (start === end)
    return true
  if (start < end)
    return current >= start && current < end
  return current >= start || current < end
}

function startScheduleClock() {
  if (scheduleClockInterval !== null || typeof window === 'undefined')
    return

  currentMinuteOfDay.value = getCurrentMinuteOfDay()
  scheduleClockInterval = window.setInterval(() => {
    currentMinuteOfDay.value = getCurrentMinuteOfDay()
  }, 30_000)
}

function stopScheduleClock() {
  if (scheduleClockInterval !== null) {
    clearInterval(scheduleClockInterval)
    scheduleClockInterval = null
  }
}

/**
 * Check if current page is festival page
 */
function isFestivalPage(): boolean {
  return /https?:\/\/(?:www\.)?bilibili\.com\/festival\/.*/.test(document.URL)
}

function syncBilibiliTheme(isDark: boolean, persist = true) {
  const theme = isDark ? 'dark' : 'light'

  // useDark() is shared by several components. Only notify Bilibili when the
  // effective theme actually changes; repeated events rebuild native feeds.
  if (lastThemeChangeState === isDark)
    return

  if (persist)
    setCookie('theme_style', theme, 365 * 10)
  lastThemeChangeState = isDark
  window.dispatchEvent(new CustomEvent('global.themeChange', { detail: theme }))
}

function createDarkState(observeRoute = true, syncNativeTheme = true) {
  const parentTheme = shallowRef<{ isDark: boolean }>()
  watch([() => settings.value.theme, () => Boolean(parentTheme.value)], ([theme, inherited], _previous, onCleanup) => {
    const syncClock = () => {
      if (theme === 'scheduled' && !inherited && !document.hidden)
        startScheduleClock()
      else stopScheduleClock()
    }
    if (theme === 'scheduled' && !inherited)
      document.addEventListener('visibilitychange', syncClock)
    onCleanup(() => {
      document.removeEventListener('visibilitychange', syncClock)
      stopScheduleClock()
    })
    syncClock()
  }, { immediate: true })
  onScopeDispose(stopScheduleClock)
  // The appearance-only subsite entry has no playback mode or route-dependent
  // theme. It reuses this theme owner without starting the main site's fallback.
  const currentUrl = observeRoute ? useCurrentLocationHref() : ref(window.location.href)

  const isPreferredDark = usePreferredDark()
  const currentSystemColorScheme = computed(() => isPreferredDark.value ? 'dark' : 'light')
  const currentAppColorScheme = computed((): 'dark' | 'light' => {
    if (settings.value.theme === 'light' || settings.value.theme === 'dark')
      return settings.value.theme
    if (settings.value.theme === 'scheduled') {
      const shouldUseLightTheme = isWithinLightSchedule(
        currentMinuteOfDay.value,
        settings.value.themeScheduleStart,
        settings.value.themeScheduleEnd,
      )
      return shouldUseLightTheme ? 'light' : 'dark'
    }
    return currentSystemColorScheme.value
  })
  const isVideoPageDark = computed(() => {
    return settings.value.videoPageDarkMode && isVideoPlaybackPage(currentUrl.value)
  })
  const iframeDocument = createIframeDocumentClient()
  const isDark = computed(() => parentTheme.value?.isDark ?? (currentAppColorScheme.value === 'dark' || isVideoPageDark.value))
  const accentColor = computed(() => resolveAppearanceAccent(settings.value, isDark.value))
  const motionPreference = computed(() => settings.value.motionPreference)
  watch(motionPreference, (preference) => {
    for (const element of [document.documentElement, document.getElementById('bewly')]) {
      if (element)
        applyMotionPreference(element, preference)
    }
  }, { immediate: true })
  onScopeDispose(() => {
    for (const element of [document.documentElement, document.getElementById('bewly')]) {
      if (element)
        applyMotionPreference(element, undefined)
    }
  })
  const appearanceStyle = computed<Record<string, string>>((previous) => {
    const next = getAppearanceStyle(settings.value, isDark.value)
    return previous && Object.keys(previous).length === Object.keys(next).length && Object.keys(next).every(key => previous[key] === next[key]) ? previous : next
  })
  watch(appearanceStyle, (style) => {
    for (const element of [document.documentElement, document.getElementById('bewly')]) {
      if (element)
        applyAppearanceStyle(element, style)
    }
  }, { immediate: true })

  const handleIframeThemeMessage = (event: MessageEvent) => {
    iframeDocument.receive(event)
    const data = getParentMessageData(event, [IFRAME_DARK_MODE_CHANGE])
    if (!data
      || !iframeDocument.matches(data)
      || typeof data.isDark !== 'boolean') {
      return
    }

    parentTheme.value = { isDark: data.isDark }
  }
  window.addEventListener('message', handleIframeThemeMessage)
  const resumeDocument = (event: PageTransitionEvent) => {
    if (event.persisted)
      iframeDocument.reconnect()
  }
  window.addEventListener('pageshow', resumeDocument)
  watch(currentUrl, () => iframeDocument.report(), { immediate: true })
  onScopeDispose(() => {
    window.removeEventListener('message', handleIframeThemeMessage)
    window.removeEventListener('pageshow', resumeDocument)
    iframeDocument.dispose()
  })

  // Bilibili's own page may rebuild its native content on its theme event. Sent
  // inside a View Transition, that work would hold back the new snapshot, so
  // while a theme reveal runs the event waits until the reveal has finished.
  let nativeThemeAfter: Promise<void> | undefined

  // Apply appearance only when an effective theme input changes. The settings
  // adapter replaces its object on every write, so a getter returning an array
  // would otherwise fire for unrelated settings as well.
  watch(
    [
      isDark,
      currentAppColorScheme,
      () => settings.value.adaptToOtherPageStyles,
      currentUrl,
    ],
    () => {
      setAppAppearance()
    },
    { immediate: true },
  )

  /**
   * Watch for changes in the 'settings.value.theme' variable and add the 'dark' class to the 'mainApp' element
   * to prevent some Unocss dark-specific styles from failing to take effect
   */
  function setAppAppearance() {
    // Check if we should apply selective dark mode (plugin UI only) on festival pages
    const isSelectiveDark = isFestivalPage() && settings.value.adaptToOtherPageStyles
    const bewlyContainer = document.querySelector('#bewly')

    bewlyContainer?.classList.toggle('dark', isDark.value)

    // Only apply global theme classes if not on festival pages
    if (!isSelectiveDark) {
      document.documentElement.classList.toggle('dark', isDark.value)
      document.body?.classList.toggle('dark', isDark.value)

      if (isDark.value) {
        // bili_dark is bilibili's official dark mode class
        document.documentElement.classList.add('bili_dark')
      }
      else {
        document.documentElement.classList.remove('bili_dark')
      }
    }

    if (syncNativeTheme) {
      const syncNativeThemeNow = () => syncBilibiliTheme(isDark.value, !parentTheme.value)
      if (nativeThemeAfter)
        void nativeThemeAfter.then(syncNativeThemeNow)
      else
        syncNativeThemeNow()
    }

    // Only used as a temporary solution, which will eventually be removed
    // It seems like Bilibili already supports dark mode when the `bili_dark` class is added to the `html` element
    // but it's not yet fully refined.
    if (currentAppColorScheme.value === 'dark') {
      if (document.documentElement.classList.contains('bili_dark')) {
        document.documentElement.classList.remove('bili_dark')
      }
    }
    // else {
    //   if (!document.documentElement.classList.contains('bili_dark')) {
    //     document.documentElement.classList.add('bili_dark')
    //   }
    // }
  }

  let cancelAppearanceTransition: (() => void) | undefined
  let applyingAppearance = false
  onScopeDispose(() => cancelAppearanceTransition?.())
  watch([
    () => settings.value.theme,
    () => settings.value.appearanceColors.light.background,
    () => settings.value.appearanceColors.light.foreground,
    () => settings.value.appearanceColors.dark.background,
    () => settings.value.appearanceColors.dark.foreground,
    () => settings.value.appearanceColors.darkAccent,
    () => settings.value.appearanceColors.separateModes,
    appearanceStyle,
    accentColor,
    isDark,
    motionPreference,
    currentUrl,
  ], () => {
    if (!applyingAppearance)
      cancelAppearanceTransition?.()
  }, { flush: 'sync' })

  function transitionAppearance(update: () => void, event?: MouseEvent): Promise<void> {
    cancelAppearanceTransition?.()
    if (typeof document.startViewTransition !== 'function' || prefersReducedMotion() || document.hidden) {
      update()
      return Promise.resolve()
    }
    const style = getComputedStyle(document.documentElement)
    const duration = getMotionDuration(style, '--bew-duration-normal')
    const easing = style.getPropertyValue('--bew-ease-standard').trim() || 'ease-out'
    const trigger = event?.detail === 0 && event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : undefined
    const x = trigger ? trigger.left + trigger.width / 2 : event?.clientX ?? 0
    const y = trigger ? trigger.top + trigger.height / 2 : event?.clientY ?? 0
    const endRadius = Math.hypot(
      Math.max(x, innerWidth - x),
      Math.max(y, innerHeight - y),
    )
    let transitionStyle: HTMLStyleElement | undefined
    const suppressionStyles: HTMLStyleElement[] = []
    let active = true
    let committed = false
    let transition: ViewTransition | undefined
    let animation: Animation | undefined
    let finished: Promise<void> | undefined
    const cleanup = () => {
      if (nativeThemeAfter === finished)
        nativeThemeAfter = undefined
      if (!active)
        return
      active = false
      animation?.cancel()
      transitionStyle?.remove()
      suppressionStyles.forEach(style => style.remove())
      if (cancelAppearanceTransition === cancel)
        cancelAppearanceTransition = undefined
    }
    function cancel() {
      transition?.skipTransition()
      cleanup()
    }
    cancelAppearanceTransition = cancel
    try {
      transition = document.startViewTransition(async () => {
        if (!active)
          return
        applyingAppearance = true
        try {
          // The new view under the reveal is live: without this, every colour,
          // background and shadow transition the theme flip starts would run on
          // the main thread during the reveal and drop its frames. Mounted with
          // the flip, so it costs no restyle of its own; removed after the reveal.
          for (const parent of [document.head, document.getElementById('bewly')?.shadowRoot]) {
            if (!parent)
              continue
            const style = document.createElement('style')
            style.dataset.bewlyThemeTransition = ''
            style.textContent = '*, *::before, *::after { transition: none !important; }'
            parent.appendChild(style)
            suppressionStyles.push(style)
          }
          committed = true
          update()
          await nextTick()
          if (!active)
            return
          const reverse = event && !isDark.value
          transitionStyle = document.createElement('style')
          transitionStyle.dataset.bewlyThemeTransition = ''
          transitionStyle.textContent = `::view-transition-old(root), ::view-transition-new(root) { animation: none !important; mix-blend-mode: normal; } ::view-transition-old(root) { z-index: ${reverse ? 2 : 1}; } ::view-transition-new(root) { z-index: ${reverse ? 1 : 2}; }`
          document.head.appendChild(transitionStyle)
        }
        finally {
          applyingAppearance = false
        }
      })
      void transition.ready.then(() => {
        if (!active)
          return
        const isDarkNow = document.documentElement.classList.contains('dark')
        const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
        animation = document.documentElement.animate(event ? { clipPath: isDarkNow ? clipPath : [...clipPath].reverse() } : { opacity: [0, 1] }, {
          duration,
          easing,
          fill: 'forwards',
          pseudoElement: !event || isDarkNow ? '::view-transition-new(root)' : '::view-transition-old(root)',
        })
        holdAnimation(animation)
        return animation.finished
      }).catch(() => {
        if (active)
          transition?.skipTransition()
      })
      finished = transition.finished.then(cleanup, cleanup)
      nativeThemeAfter = finished
      return finished
    }
    catch {
      cleanup()
      if (!committed)
        update()
      return Promise.resolve()
    }
  }

  function toggleDark(event: MouseEvent) {
    const nextTheme = currentAppColorScheme.value !== currentSystemColorScheme.value
      ? 'auto'
      : isPreferredDark.value ? 'light' : 'dark'
    transitionAppearance(() => {
      settings.value.theme = nextTheme
    }, event)
  }

  return {
    isDark,
    accentColor,
    appearanceStyle,
    motionPreference,
    iframeDocument,
    toggleDark,
    transitionAppearance,
  }
}

type DarkState = ReturnType<typeof createDarkState>
let darkStateScope = effectScope(true)
let darkState: DarkState | undefined

export function useDark(options: { observeRoute?: boolean, syncNativeTheme?: boolean } = {}): DarkState {
  if (!darkState)
    darkState = darkStateScope.run(() => createDarkState(options.observeRoute, options.syncNativeTheme))
  return darkState!
}

export function stopDarkState() {
  darkStateScope.stop()
  darkState = undefined
  darkStateScope = effectScope(true)
}
