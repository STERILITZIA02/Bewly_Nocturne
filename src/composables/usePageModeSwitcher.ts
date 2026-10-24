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
  /** Mode shown at rest; the component owns how each mode is drawn. */
  currentMode: ComputedRef<PageMode>
  disabled: ComputedRef<boolean>
  tooltip: ComputedRef<string>
  cyclePageMode: () => Promise<void>
}

const PAGE_MODE_LABEL_KEYS: Readonly<Record<PageMode, string>> = {
  original: 'dock.page_mode_original',
  bewly: 'dock.page_mode_bewly',
  custom: 'dock.page_mode_custom',
}

export const pageModeChangePending = ref(false)

export async function selectPageMode(selectedPageMode: PageMode, activatedPage: AppPage) {
  if (pageModeChangePending.value || selectedPageMode === settings.value.pageMode)
    return
  const currentHref = window.location.href
  const target = resolvePageModeTarget(currentHref, activatedPage)
  const previousPageMode = settings.value.pageMode
  settings.value = { ...settings.value, pageMode: selectedPageMode }
  if (!target)
    return
  const navigationUrl = resolvePageModeNavigationUrl(currentHref, target, useSettingsStore().getDockItemIsUseOriginalBiliPage(target.preferencePage))
  if (!navigationUrl || navigationUrl === currentHref)
    return
  pageModeChangePending.value = true
  try {
    await settings.flush()
    if (settings.value.pageMode === selectedPageMode)
      window.location.assign(navigationUrl)
  }
  catch {
    if (settings.value.pageMode === selectedPageMode)
      settings.value = { ...settings.value, pageMode: previousPageMode }
  }
  finally {
    pageModeChangePending.value = false
  }
}

export function usePageModeSwitcher(
  activatedPage: MaybeRefOrGetter<AppPage>,
): PageModeSwitcherState {
  const { t } = useI18n()
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
  const disabled = computed(() => pageModeChangePending.value || switchingPageMode.value || (!videoPlaybackPage.value && unavailable.value))
  const nextMode = computed(() => getNextPageMode(settings.value.pageMode))
  const currentMode = computed<PageMode>(() => videoPlaybackPage.value
    ? (widescreenEngaged.value ? 'bewly' : 'original')
    : settings.value.pageMode)
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

    if (!unavailable.value)
      await selectPageMode(nextMode.value, toValue(activatedPage))
  }

  return {
    currentMode,
    disabled,
    tooltip,
    cyclePageMode,
  }
}
