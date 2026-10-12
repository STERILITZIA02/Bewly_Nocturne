import { onScopeDispose, ref, shallowRef, watch } from 'vue'

import type { SettingsNavigationRequest, SettingsNavigationTarget } from '~/composables/useAppProvider'
import { exitLayoutEditMode, openSettingById } from '~/logic/layoutEdit'

export function useSettingsPanel() {
  const showSettings = ref(false)
  const settingsDockHeld = ref(false)
  const DOCK_RELEASE_DELAY_MS = 250
  let dockReleaseTimer: ReturnType<typeof setTimeout> | undefined
  function cancelDockRelease() {
    clearTimeout(dockReleaseTimer)
    dockReleaseTimer = undefined
  }
  watch(showSettings, (open) => {
    if (!open)
      return
    cancelDockRelease()
    settingsDockHeld.value = true
  }, { flush: 'sync' })
  function onSettingsAfterLeave() {
    cancelDockRelease()
    if (showSettings.value)
      return
    dockReleaseTimer = setTimeout(() => {
      dockReleaseTimer = undefined
      settingsDockHeld.value = false
    }, DOCK_RELEASE_DELAY_MS)
  }
  onScopeDispose(cancelDockRelease)
  const settingsLaunchStyle = ref<Record<string, string>>({})
  const settingsNavigationRequest = shallowRef<SettingsNavigationRequest | null>(null)
  let settingsNavigationRequestId = 0

  function toggleSettings(origin: DOMRect) {
    if (showSettings.value) {
      showSettings.value = false
      return
    }

    settingsLaunchStyle.value = {
      '--bew-settings-source-x': `${origin.left + origin.width / 2}px`,
      '--bew-settings-source-y': `${origin.top + origin.height / 2}px`,
      '--bew-settings-source-size': `${Math.max(origin.width, origin.height)}px`,
    }
    showSettings.value = true
  }

  function openSettingsAt(target: SettingsNavigationTarget) {
    settingsNavigationRequest.value = {
      id: ++settingsNavigationRequestId,
      target,
    }
    if (!showSettings.value)
      toggleSettings(new DOMRect(window.innerWidth / 2, window.innerHeight / 2))
  }

  function openLayoutEditorSetting(settingId: string, origin?: DOMRect) {
    exitLayoutEditMode()
    if (!showSettings.value) {
      toggleSettings(origin ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 2))
    }
    openSettingById(settingId)
  }

  return { showSettings, settingsDockHeld, onSettingsAfterLeave, settingsLaunchStyle, settingsNavigationRequest, toggleSettings, openSettingsAt, openLayoutEditorSetting }
}
