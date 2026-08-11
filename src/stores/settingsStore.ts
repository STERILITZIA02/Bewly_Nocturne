import { defineStore } from 'pinia'

import type { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import type { DockItem } from '~/stores/mainStore'
import { useMainStore } from '~/stores/mainStore'
import { resolveEffectiveTopBarSource, showNativeBilibiliTopBar } from '~/utils/effectiveTopBarSource'
import { getDefaultCustomUseOriginalBiliPage, resolveUseOriginalBiliPage } from '~/utils/pageMode'

export interface DockItemConfig {
  page: AppPage
  visible: boolean
  openInNewTab: boolean
  useOriginalBiliPage: boolean
}

export const useSettingsStore = defineStore('settings', () => {
  const mainStore = useMainStore()

  function createDefaultDockItemsConfig(): DockItemConfig[] {
    return mainStore.dockItems.map(dock => ({
      page: dock.page,
      visible: true,
      openInNewTab: false,
      useOriginalBiliPage: dock.useOriginalBiliPage,
    }))
  }

  function ensureDockItemsConfig(): DockItemConfig[] {
    const currentConfig = Array.isArray(settings.value.dockItemsConfig)
      ? settings.value.dockItemsConfig
      : []
    const defaultConfig = createDefaultDockItemsConfig()
    const defaultPages = new Set(defaultConfig.map(item => item.page))
    const seenPages = new Set<AppPage>()
    const preservedConfig = currentConfig.filter((item) => {
      if (!defaultPages.has(item.page) || seenPages.has(item.page))
        return false

      seenPages.add(item.page)
      return true
    })
    const missingConfig = defaultConfig.filter(item => !seenPages.has(item.page))
    const normalizedConfig = [...preservedConfig, ...missingConfig]
    const configChanged = normalizedConfig.length !== currentConfig.length
      || normalizedConfig.some((item, index) => item !== currentConfig[index])

    if (configChanged)
      settings.value.dockItemsConfig = normalizedConfig

    return settings.value.dockItemsConfig
  }

  function resetDockItemsConfig(): void {
    settings.value.dockItemsConfig = createDefaultDockItemsConfig()
  }

  function getDockItemConfigByPage(page: AppPage): DockItemConfig | undefined {
    return settings.value.dockItemsConfig.find(e => e.page === page)
  }

  function getDockItemCustomUseOriginalBiliPage(page: AppPage): boolean {
    return getDockItemConfigByPage(page)?.useOriginalBiliPage
      ?? getDefaultCustomUseOriginalBiliPage(page)
  }

  function getDockItemIsUseOriginalBiliPage(page: AppPage): boolean {
    return resolveUseOriginalBiliPage(
      settings.value.pageMode,
      getDockItemCustomUseOriginalBiliPage(page),
    )
  }

  function getEffectiveDockItemByPage(page: AppPage): DockItem | undefined {
    const defaultItem = mainStore.getDockItemByPage(page)
    if (!defaultItem)
      return undefined

    const config = getDockItemConfigByPage(page)
    return {
      ...defaultItem,
      openInNewTab: config?.openInNewTab ?? defaultItem.openInNewTab,
      useOriginalBiliPage: getDockItemIsUseOriginalBiliPage(page) || !defaultItem.hasBewlyPage,
    }
  }

  function resolveDockPageHref(page: AppPage): string {
    const dockItem = getEffectiveDockItemByPage(page)
    if (!dockItem)
      return 'https://www.bilibili.com/'

    return dockItem.useOriginalBiliPage
      ? mainStore.getBiliWebPageURLByPage(page)
      : `https://www.bilibili.com/?page=${page}`
  }

  function setDockItemCustomUseOriginalBiliPage(page: AppPage, useOriginalBiliPage: boolean): void {
    if (settings.value.pageMode !== 'custom')
      return

    ensureDockItemsConfig()
    const config = getDockItemConfigByPage(page)
    if (!config)
      return

    config.useOriginalBiliPage = useOriginalBiliPage
  }

  function getCustomUseOriginalBilibiliTopBar(): boolean {
    return settings.value.useOriginalBilibiliTopBar
  }

  function getEffectiveTopBarSource() {
    return resolveEffectiveTopBarSource(
      settings.value.pageMode,
      getCustomUseOriginalBilibiliTopBar(),
    )
  }

  function getUseOriginalBilibiliTopBar(): boolean {
    return showNativeBilibiliTopBar(getEffectiveTopBarSource())
  }

  function setCustomUseOriginalBilibiliTopBar(useOriginalBilibiliTopBar: boolean): void {
    if (settings.value.pageMode !== 'custom')
      return

    settings.value.useOriginalBilibiliTopBar = useOriginalBilibiliTopBar
  }

  ensureDockItemsConfig()

  return {
    ensureDockItemsConfig,
    getDockItemConfigByPage,
    getDockItemCustomUseOriginalBiliPage,
    getDockItemIsUseOriginalBiliPage,
    getEffectiveDockItemByPage,
    getCustomUseOriginalBilibiliTopBar,
    getEffectiveTopBarSource,
    getUseOriginalBilibiliTopBar,
    resetDockItemsConfig,
    resolveDockPageHref,
    setCustomUseOriginalBilibiliTopBar,
    setDockItemCustomUseOriginalBiliPage,
  }
})
