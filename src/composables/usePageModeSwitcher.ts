import { useMutationObserver } from '@vueuse/core'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { computed, ref, toValue, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useCurrentLocationHref } from '~/composables/useCurrentLocationHref'
import type { BewlyWidescreenManualToggleDetail } from '~/constants/globalEvents'
import { BEWLY_WIDESCREEN_MANUAL_TOGGLE } from '~/constants/globalEvents'
import type { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { useSettingsStore } from '~/stores/settingsStore'
import { applyBewlyWidescreen, exitBewlyWidescreen, isBewlyWidescreenEngaged } from '~/utils/bewlyWidescreen'
import { isVideoOrBangumiPage } from '~/utils/main'
import type { PageMode } from '~/utils/pageMode'
import {
  getNextPageMode,
  resolvePageModeNavigationUrl,
  resolvePageModeTarget,
} from '~/utils/pageMode'

export interface PageModeSwitcherState {
  currentIcon: ComputedRef<string>
  disabled: ComputedRef<boolean>
  nextIcon: ComputedRef<string>
  tooltip: ComputedRef<string>
  cyclePageMode: () => Promise<void>
}

const PAGE_MODE_ICONS: Readonly<Record<PageMode, string>> = {
  original: 'mingcute:bilibili-line',
  bewly: 'mingcute:cat-line',
  custom: 'mingcute:pencil-ruler-line',
}

const PAGE_MODE_LABEL_KEYS: Readonly<Record<PageMode, string>> = {
  original: 'dock.page_mode_original',
  bewly: 'dock.page_mode_bewly',
  custom: 'dock.page_mode_custom',
}

export function usePageModeSwitcher(
  activatedPage: MaybeRefOrGetter<AppPage>,
): PageModeSwitcherState {
  const { t } = useI18n()
  const settingsStore = useSettingsStore()
  const currentLocationHref = useCurrentLocationHref()
  const switchingPageMode = ref(false)
  const widescreenEngaged = ref(false)
  const videoPlaybackPage = computed(() => isVideoOrBangumiPage(currentLocationHref.value))

  function syncWidescreenState() {
    widescreenEngaged.value = videoPlaybackPage.value && isBewlyWidescreenEngaged()
    switchingPageMode.value = false
  }

  watch(currentLocationHref, syncWidescreenState, { immediate: true })
  useMutationObserver(document.body, syncWidescreenState, {
    attributes: true,
    attributeFilter: ['class'],
    childList: true,
  })

  const target = computed(() => {
    return resolvePageModeTarget(currentLocationHref.value, toValue(activatedPage))
  })
  const unavailable = computed(() => target.value === null)
  const disabled = computed(() => switchingPageMode.value || (!videoPlaybackPage.value && unavailable.value))
  const nextMode = computed(() => getNextPageMode(settings.value.pageMode))
  const currentIcon = computed(() => videoPlaybackPage.value
    ? PAGE_MODE_ICONS[widescreenEngaged.value ? 'bewly' : 'original']
    : PAGE_MODE_ICONS[settings.value.pageMode])
  const nextIcon = computed(() => videoPlaybackPage.value
    ? PAGE_MODE_ICONS[widescreenEngaged.value ? 'original' : 'bewly']
    : PAGE_MODE_ICONS[nextMode.value])
  const tooltip = computed(() => {
    if (videoPlaybackPage.value)
      return t(widescreenEngaged.value ? 'widescreen.exit' : 'widescreen.enter')

    if (unavailable.value)
      return t('dock.bewly_page_unavailable')

    return t('dock.page_mode_switch_tooltip', {
      current: t(PAGE_MODE_LABEL_KEYS[settings.value.pageMode]),
      next: t(PAGE_MODE_LABEL_KEYS[nextMode.value]),
    })
  })

  async function cyclePageMode() {
    if (switchingPageMode.value)
      return

    if (videoPlaybackPage.value) {
      switchingPageMode.value = true
      if (widescreenEngaged.value) {
        exitBewlyWidescreen({ userInitiated: true })
      }
      else {
        window.dispatchEvent(new CustomEvent<BewlyWidescreenManualToggleDetail>(
          BEWLY_WIDESCREEN_MANUAL_TOGGLE,
          { detail: { action: 'enter', userInitiated: true } },
        ))
        applyBewlyWidescreen(settings.value.bewlyWidescreenSidebarPosition)
      }
      queueMicrotask(syncWidescreenState)
      return
    }

    const currentHref = currentLocationHref.value
    const currentTarget = resolvePageModeTarget(currentHref, toValue(activatedPage))
    if (!currentTarget)
      return

    const previousPageMode = settings.value.pageMode
    const selectedPageMode = nextMode.value
    settings.value = {
      ...settings.value,
      pageMode: selectedPageMode,
    }

    const useOriginalBiliPage = settingsStore.getDockItemIsUseOriginalBiliPage(
      currentTarget.preferencePage,
    )
    const navigationUrl = resolvePageModeNavigationUrl(
      currentHref,
      currentTarget,
      useOriginalBiliPage,
    )

    const shouldNavigate = navigationUrl && navigationUrl !== currentHref
    if (shouldNavigate) {
      switchingPageMode.value = true
      try {
        await settings.flush()
      }
      catch {
        settings.value = {
          ...settings.value,
          pageMode: previousPageMode,
        }
        switchingPageMode.value = false
        return
      }
    }

    if (navigationUrl && navigationUrl !== currentHref)
      window.location.assign(navigationUrl)
  }

  return {
    currentIcon,
    disabled,
    nextIcon,
    tooltip,
    cyclePageMode,
  }
}
