import { usePreferredDark } from '@vueuse/core'
import { effectScope, onScopeDispose } from 'vue'

import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import { DARK_MODE_BASE_COLOR_CHANGE, IFRAME_DARK_MODE_CHANGE } from '~/constants/globalEvents'
import { settings } from '~/logic'
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

function syncBilibiliTheme(isDark: boolean) {
  const theme = isDark ? 'dark' : 'light'
  setCookie('theme_style', theme, 365 * 10)

  // useDark() is shared by several components. Only notify Bilibili when the
  // effective theme actually changes; repeated events rebuild native feeds.
  if (lastThemeChangeState === isDark)
    return

  lastThemeChangeState = isDark
  window.dispatchEvent(new CustomEvent('global.themeChange', { detail: theme }))
}

function createDarkState() {
  watch(() => settings.value.theme, (theme) => {
    if (theme === 'scheduled')
      startScheduleClock()
    else
      stopScheduleClock()
  }, { immediate: true })
  onScopeDispose(stopScheduleClock)
  const currentUrl = useCurrentLocationHref()

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
  const isDark = computed(() => currentAppColorScheme.value === 'dark' || isVideoPageDark.value)
  const isOledDark = computed(() => isDark.value && settings.value.enableOledDarkMode === true)

  const handleIframeThemeMessage = (event: MessageEvent) => {
    const data = getParentMessageData(event, [IFRAME_DARK_MODE_CHANGE])
    if (!data
      || typeof data.isDark !== 'boolean'
      || (data.isOledDark !== undefined && typeof data.isOledDark !== 'boolean')
      || (data.darkModeBaseColor !== undefined && typeof data.darkModeBaseColor !== 'string')) {
      return
    }

    const selective = isFestivalPage()
    const bewlyContainer = document.getElementById('bewly')
    bewlyContainer?.classList.toggle('dark', data.isDark)
    bewlyContainer?.classList.toggle('oled-dark', data.isDark && data.isOledDark === true)
    if (!selective) {
      document.documentElement.classList.toggle('dark', data.isDark)
      document.documentElement.classList.toggle('oled-dark', data.isDark && data.isOledDark === true)
      document.body?.classList.toggle('dark', data.isDark)
      document.body?.classList.toggle('oled-dark', data.isDark && data.isOledDark === true)
    }
    if (typeof data.darkModeBaseColor === 'string')
      setDarkModeBaseColor(data.darkModeBaseColor)
  }
  window.addEventListener('message', handleIframeThemeMessage)
  onScopeDispose(() => {
    window.removeEventListener('message', handleIframeThemeMessage)
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
    () => settings.value.darkModeBaseColor,
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
      setDarkModeBaseColor(settings.value.darkModeBaseColor)

    syncBilibiliTheme(isDark.value)

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

  function toggleDark(e: MouseEvent) {
    const updateThemeSettings = () => {
      if (currentAppColorScheme.value !== currentSystemColorScheme.value)
        settings.value.theme = 'auto'
      else
        settings.value.theme = isPreferredDark.value ? 'light' : 'dark'
    }

    const isAppearanceTransition = typeof document !== 'undefined'
    // @ts-expect-error: Transition API
      && document.startViewTransition
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!isAppearanceTransition) {
      updateThemeSettings()
    }
    else {
      const x = e.clientX
      const y = e.clientY
      const endRadius = Math.hypot(
        Math.max(x, innerWidth - x),
        Math.max(y, innerHeight - y),
      )
      // https://github.com/vueuse/vueuse/pull/3129
      const style = document.createElement('style')
      const styleString = `
            *, *::before, *::after
            {-webkit-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}`
      style.appendChild(document.createTextNode(styleString))
      document.head.appendChild(style)

      const viewTransitionStyle = document.createElement('style')
      viewTransitionStyle.textContent = `
            ::view-transition-old(root),
            ::view-transition-new(root) {
              animation: none !important;
              mix-blend-mode: normal;
            }
            `
      document.head.appendChild(viewTransitionStyle)

      // Since the above normal dom style cannot be applied in shadow dom style
      // We need to add this style again to the shadow dom
      const shadowDomStyle = document.createElement('style')
      const shadowDomStyleString = `
            *, *::before, *::after
            {-webkit-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important; will-change: background}`
      shadowDomStyle.appendChild(document.createTextNode(shadowDomStyleString))

      const bewlyShadowRoot = document.getElementById('bewly')?.shadowRoot
      const bewlyWrapper = bewlyShadowRoot?.getElementById('bewly-wrapper')
      if (!bewlyWrapper)
        throw new Error('mainAppRef is not found')

      bewlyWrapper.appendChild(shadowDomStyle)

      const transition = document.startViewTransition(async () => {
        updateThemeSettings()
        await nextTick()
      })

      transition.ready.then(() => {
        const isDarkNow = document.documentElement.classList.contains('dark')

        const zIndexStyle = document.createElement('style')
        const foregroundZIndex = 'var(--bew-z-popover)'
        zIndexStyle.textContent = `
            ::view-transition-old(root) { z-index: ${isDarkNow ? 1 : foregroundZIndex}; }
            ::view-transition-new(root) { z-index: ${isDarkNow ? foregroundZIndex : 1}; }
            `
        document.head.appendChild(zIndexStyle)

        const clipPath = [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ]
        const animation = document.documentElement.animate(
          {
            clipPath: isDarkNow ? clipPath : [...clipPath].reverse(),
          },
          {
            duration: 300,
            easing: 'ease-in-out',
            pseudoElement: isDarkNow
              ? '::view-transition-new(root)'
              : '::view-transition-old(root)',
          },
        )

        animation.finished.then(() => {
          zIndexStyle.remove()
        })
      })

      transition.finished.then(() => {
        style.remove()
        viewTransitionStyle.remove()
        shadowDomStyle.remove()
      })
    }
  }

  return {
    isDark,
    isOledDark,
    toggleDark,
  }
}

type DarkState = ReturnType<typeof createDarkState>
let darkStateScope = effectScope(true)
let darkState: DarkState | undefined

export function useDark(): DarkState {
  if (!darkState)
    darkState = darkStateScope.run(createDarkState)
  return darkState!
}

export function stopDarkState() {
  darkStateScope.stop()
  darkState = undefined
  darkStateScope = effectScope(true)
}
