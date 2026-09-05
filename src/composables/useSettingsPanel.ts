import { ref, shallowRef } from 'vue'

import type { SettingsNavigationRequest, SettingsNavigationTarget } from '~/composables/useAppProvider'
import { LAYOUT_BREAKPOINTS } from '~/constants/layout'
import { exitLayoutEditMode, openSettingById } from '~/logic/layoutEdit'

export function useSettingsPanel() {
  const showSettings = ref(false)
  const settingsLaunchStyle = ref<Record<string, string>>({})
  const settingsNavigationRequest = shallowRef<SettingsNavigationRequest | null>(null)
  let settingsNavigationRequestId = 0

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
  }

  function toggleSettings(origin: DOMRect) {
    if (showSettings.value) {
      showSettings.value = false
      return
    }

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const compactLayout = viewportWidth <= LAYOUT_BREAKPOINTS.compactMax
    const panelWidth = compactLayout
      ? Math.min(1072, viewportWidth - 24)
      : Math.min(viewportWidth * 0.9, 1000)
    const panelHeight = Math.min(viewportHeight * 0.9, 900)
    const panelCenterX = viewportWidth / 2 + (compactLayout ? -4 : 0)
    const panelCenterY = viewportHeight / 2
    const sourceX = origin.left + origin.width / 2
    const sourceY = origin.top + origin.height / 2
    const enterX = clamp(sourceX - panelCenterX, -96, 96)
    const enterY = clamp(sourceY - panelCenterY, -72, 72)

    settingsLaunchStyle.value = {
      '--bew-settings-origin-x': `${clamp(sourceX - (panelCenterX - panelWidth / 2), 0, panelWidth)}px`,
      '--bew-settings-origin-y': `${clamp(sourceY - (panelCenterY - panelHeight / 2), 0, panelHeight)}px`,
      '--bew-settings-enter-x': `${enterX}px`,
      '--bew-settings-enter-y': `${enterY}px`,
      '--bew-settings-leave-x': `${enterX * 0.35}px`,
      '--bew-settings-leave-y': `${enterY * 0.35}px`,
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

  return { showSettings, settingsLaunchStyle, settingsNavigationRequest, toggleSettings, openSettingsAt, openLayoutEditorSetting }
}
