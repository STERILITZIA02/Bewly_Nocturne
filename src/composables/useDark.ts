import { usePreferredDark } from '@vueuse/core'
import { effectScope, onScopeDispose } from 'vue'

import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { DARK_MODE_BASE_COLOR_CHANGE, IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
import { resolveDarkModeBaseColor } from '~/utils/darkModeTint'
import { createIframeDocumentClient } from '~/utils/iframeDocument'
import { getParentMessageData } from '~/utils/iframeMessage'
import { isVideoPlaybackPage, setCookie } from '~/utils/main'

const currentMinuteOfDay = ref(getCurrentMinuteOfDay())
let scheduleClockInterval: number | null = null
let lastThemeChangeState: boolean | undefined
let lastDarkModeBaseColor: string | undefined

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

/**
 * 设置深色模式基准颜色
 */
function setDarkModeBaseColor(color: string) {
  // 设置主文档的CSS变量（用于哔哩哔哩原站样式）
  document.documentElement.style.setProperty('--bew-dark-base-color', color)

  // 设置 Shadow DOM 内的 CSS 变量（用于 Bewly Nocturne 组件样式）
  const bewlyContainer = document.getElementById('bewly')
  if (bewlyContainer?.shadowRoot) {
    const shadowHost = bewlyContainer
    shadowHost.style.setProperty('--bew-dark-base-color', color)
  }
}

function syncBilibiliTheme(isDark: boolean, persist = true) {
  const theme = isDark ? 'dark' : 'light'
  if (persist)
    setCookie('theme_style', theme, 365 * 10)

  // useDark() is shared by several components. Only notify Bilibili when the
  // effective theme actually changes; repeated events rebuild native feeds.
  if (lastThemeChangeState === isDark)
    return

  lastThemeChangeState = isDark
  window.dispatchEvent(new CustomEvent('global.themeChange', { detail: theme }))
}

function createDarkState(observeRoute = true, syncNativeTheme = true) {
  const parentTheme = shallowRef<{ isDark: boolean, isOledDark: boolean, darkModeBaseColor: string }>()
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
  // Playback pages keep the dark-mode palette under pure black until they get
  // a pure-black design of their own. The URL is known at document start, so
  // the early loading cover and the playback page never flash black.
  const isOledDark = computed(() => isDark.value
    && !isVideoPlaybackPage(currentUrl.value)
    && (parentTheme.value?.isOledDark ?? settings.value.enableOledDarkMode === true))
  const darkModeBaseColor = computed(() => parentTheme.value?.darkModeBaseColor ?? resolveDarkModeBaseColor(settings.value))

  const handleIframeThemeMessage = (event: MessageEvent) => {
    iframeDocument.receive(event)
    const data = getParentMessageData(event, [IFRAME_DARK_MODE_CHANGE])
    if (!data
      || !iframeDocument.matches(data)
      || typeof data.isDark !== 'boolean'
      || (data.isOledDark !== undefined && typeof data.isOledDark !== 'boolean')
      || (data.darkModeBaseColor !== undefined && typeof data.darkModeBaseColor !== 'string')) {
      return
    }

    parentTheme.value = { isDark: data.isDark, isOledDark: data.isOledDark === true, darkModeBaseColor: typeof data.darkModeBaseColor === 'string' && /^#[\da-f]{6}$/i.test(data.darkModeBaseColor)
      ? data.darkModeBaseColor
      : resolveDarkModeBaseColor(settings.value) }
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

  // Apply appearance only when an effective theme input changes. The settings
  // adapter replaces its object on every write, so a getter returning an array
  // would otherwise fire for unrelated settings as well.
  watch(
    [
      isDark,
      isOledDark,
      currentAppColorScheme,
      () => settings.value.adaptToOtherPageStyles,
      currentUrl,
    ],
    () => {
      setAppAppearance()
    },
    { immediate: true },
  )

  // 监听深色模式基准颜色变化
  watch(
    darkModeBaseColor,
    (newColor) => {
      setDarkModeBaseColor(newColor)
      if (lastDarkModeBaseColor === newColor)
        return

      lastDarkModeBaseColor = newColor
      // 触发全局基准颜色变化事件
      window.dispatchEvent(new CustomEvent(DARK_MODE_BASE_COLOR_CHANGE, { detail: newColor }))
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
    bewlyContainer?.classList.toggle('oled-dark', isOledDark.value)

    // Only apply global theme classes if not on festival pages
    if (!isSelectiveDark) {
      document.documentElement.classList.toggle('dark', isDark.value)
      document.documentElement.classList.toggle('oled-dark', isOledDark.value)
      document.body?.classList.toggle('dark', isDark.value)
      document.body?.classList.toggle('oled-dark', isOledDark.value)

      if (isDark.value) {
        // bili_dark is bilibili's official dark mode class
        document.documentElement.classList.add('bili_dark')
      }
      else {
        document.documentElement.classList.remove('bili_dark')
      }
    }

    if (isDark.value)
      setDarkModeBaseColor(darkModeBaseColor.value)

    if (syncNativeTheme)
      syncBilibiliTheme(isDark.value, !parentTheme.value)

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
  onScopeDispose(() => cancelAppearanceTransition?.())

  function toggleDark(e: MouseEvent) {
    cancelAppearanceTransition?.()
    const nextTheme = currentAppColorScheme.value !== currentSystemColorScheme.value
      ? 'auto'
      : isPreferredDark.value ? 'light' : 'dark'
    const updateThemeSettings = () => {
      settings.value.theme = nextTheme
    }

    const isAppearanceTransition = typeof document !== 'undefined'
      && typeof document.startViewTransition === 'function'
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!isAppearanceTransition) {
      updateThemeSettings()
    }
    else {
      const trigger = e.detail === 0 && e.currentTarget instanceof HTMLElement ? e.currentTarget.getBoundingClientRect() : undefined
      const x = trigger ? trigger.left + trigger.width / 2 : e.clientX
      const y = trigger ? trigger.top + trigger.height / 2 : e.clientY
      const endRadius = Math.hypot(
        Math.max(x, innerWidth - x),
        Math.max(y, innerHeight - y),
      )
      const styles: HTMLStyleElement[] = []
      let active = true
      let transition: ViewTransition | undefined
      let animation: Animation | undefined
      const mountStyle = (parent: ParentNode, css: string) => {
        const style = document.createElement('style')
        style.dataset.bewlyThemeTransition = ''
        style.textContent = css
        styles.push(style)
        parent.appendChild(style)
      }
      const cleanup = () => {
        if (!active)
          return
        active = false
        animation?.cancel()
        styles.forEach(style => style.remove())
        if (cancelAppearanceTransition === cancel)
          cancelAppearanceTransition = undefined
      }
      function cancel() {
        transition?.skipTransition()
        cleanup()
      }
      cancelAppearanceTransition = cancel
      try {
        const suppressTransitions = '*, *::before, *::after { transition: none !important; }'
        mountStyle(document.head, suppressTransitions)
        mountStyle(document.head, '::view-transition-old(root), ::view-transition-new(root) { animation: none !important; mix-blend-mode: normal; }')
        const shadow = document.getElementById('bewly')?.shadowRoot
        if (shadow)
          mountStyle(shadow, suppressTransitions)
        transition = document.startViewTransition(async () => {
          if (!active)
            return
          updateThemeSettings()
          await nextTick()
        })
        void transition.ready.then(() => {
          if (!active)
            return
          const isDarkNow = document.documentElement.classList.contains('dark')
          const foregroundZIndex = 'var(--bew-z-popover)'
          mountStyle(document.head, `::view-transition-old(root) { z-index: ${isDarkNow ? 1 : foregroundZIndex}; } ::view-transition-new(root) { z-index: ${isDarkNow ? foregroundZIndex : 1}; }`)
          const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
          animation = document.documentElement.animate({ clipPath: isDarkNow ? clipPath : [...clipPath].reverse() }, {
            duration: 300,
            easing: 'ease-in-out',
            fill: 'forwards',
            pseudoElement: isDarkNow ? '::view-transition-new(root)' : '::view-transition-old(root)',
          })
          return animation.finished
        }).catch(() => {
          // Keep suppression and the final clip until the browser drops its snapshots.
          // Removing them at animation.finished briefly repaints the old theme.
          if (active)
            transition?.skipTransition()
        })
        void transition.finished.then(cleanup, cleanup)
      }
      catch {
        cleanup()
        updateThemeSettings()
      }
    }
  }

  return {
    isDark,
    isOledDark,
    darkModeBaseColor,
    iframeDocument,
    toggleDark,
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
