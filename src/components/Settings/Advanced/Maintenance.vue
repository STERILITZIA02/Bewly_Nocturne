<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import { useConfirmDialog } from '~/composables/useConfirmDialog'
import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { AppPage } from '~/enums/appEnums'
import { originalSettings, settings } from '~/logic'
import type { Settings } from '~/logic/storage'
import { videoCardContextMenuKeys } from '~/logic/storage'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const { t } = useI18n()
const toast = useToast()
const { confirm: showConfirmDialog } = useConfirmDialog()
const importSettingsRef = ref<HTMLInputElement>()

const blockedPropertyNames = new Set(['__proto__', 'constructor', 'prototype'])
const settingEnumValues = {
  language: ['', 'en', 'cmn-CN', 'cmn-TW', 'jyut'],
  commentReplyTreeMode: ['lineCollapseMain', 'lineKeepMain', 'indentOnly'],
  customizeFont: ['default', 'recommend', 'custom'],
  videoCardLinkOpenMode: ['drawer', 'newTab', 'currentTab', 'background'],
  topBarLinkOpenMode: ['currentTab', 'currentTabIfNotHomepage', 'newTab', 'background'],
  searchBarLinkOpenMode: ['currentTab', 'currentTabIfNotHomepage', 'newTab', 'background'],
  videoPageTopBarConfig: ['alwaysShow', 'alwaysHide', 'showOnMouse', 'showOnScroll'],
  topBarLogoStyle: ['icon', 'brand'],
  topBarIconBadges: ['number', 'dot', 'none'],
  momentsGridColumns: ['1', '2', '3'],
  momentsCardOpenMode: ['dialog', 'newTab', 'background'],
  dockPosition: ['left', 'right', 'bottom'],
  pageMode: ['original', 'bewly', 'custom'],
  sidebarPosition: ['left', 'right'],
  theme: ['light', 'dark', 'auto', 'scheduled'],
  searchPageLogoColor: ['white', 'themeColor'],
  searchResultsPaginationMode: ['scroll', 'pagination'],
  recommendationMode: ['web', 'app', 'webNoCookie'],
  collectedSeasonPlayAllMode: ['beginning', 'latest', 'lastWatched'],
  videoCardTitleFontSize: ['xs', 'sm', 'base', 'lg'],
  videoCardAuthorFontSize: ['xs', 'sm', 'base', 'lg'],
  videoCardMetaFontSize: ['xs', 'sm', 'base', 'lg'],
  videoCardLayout: ['modern', 'old'],
  defaultVideoPlayerMode: ['default', 'webFullscreen', 'widescreen', 'bewlyWidescreen'],
  bewlyWidescreenSidebarPosition: ['left', 'right'],
  defaultDanmakuState: ['system', 'remember', 'on', 'off'],
  defaultCaptionState: ['system', 'remember', 'on', 'off'],
  autoPlayMultipart: ['default', 'autoPlay', 'autoPlayWithRecommend', 'pauseAtEnd', 'loop'],
  autoPlayCollection: ['default', 'autoPlay', 'autoPlayWithRecommend', 'pauseAtEnd', 'loop'],
  autoPlayRecommend: ['default', 'autoPlay', 'autoPlayWithRecommend', 'pauseAtEnd', 'loop'],
  autoPlayWatchLater: ['default', 'autoPlay', 'autoPlayWithRecommend', 'pauseAtEnd', 'loop'],
  autoPlayPlaylist: ['default', 'autoPlay', 'autoPlayWithRecommend', 'pauseAtEnd', 'loop'],
  savedVideoAspectRatio: [null, '0:0', '4:3', '16:9'],
  defaultCustomPlayOrder: ['sequential', 'reverse', 'random'],
  randomPlayMode: ['manual', 'auto'],
} satisfies Partial<Record<keyof Settings, readonly unknown[]>>

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactProperties(value: Record<string, unknown>, properties: string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === properties.length && keys.every(key => properties.includes(key))
}

function hasBlockedProperty(value: unknown): boolean {
  if (Array.isArray(value))
    return value.some(hasBlockedProperty)
  if (!isPlainObject(value))
    return false

  return Object.keys(value).some(key => blockedPropertyNames.has(key) || hasBlockedProperty(value[key]))
}

function matchesSettingType(value: unknown, defaultValue: unknown): boolean {
  if (hasBlockedProperty(value))
    return false
  if (Array.isArray(defaultValue)) {
    if (!Array.isArray(value))
      return false
    return defaultValue.length === 0 || value.every(item => matchesSettingType(item, defaultValue[0]))
  }
  if (isPlainObject(defaultValue)) {
    if (!isPlainObject(value))
      return false
    const keys = Object.keys(value)
    return keys.length === Object.keys(defaultValue).length && keys.every(key =>
      Object.prototype.hasOwnProperty.call(defaultValue, key)
      && matchesSettingType(value[key], defaultValue[key]),
    )
  }
  if (typeof defaultValue === 'number')
    return typeof value === 'number' && Number.isFinite(value)
  if (defaultValue === null)
    return value === null || typeof value === 'string'
  return typeof value === typeof defaultValue
}

const appPageValues = new Set<string>(Object.values(AppPage))
const homeSubPageValues = new Set<string>(Object.values(HomeSubPage))
const videoPlayerModeOverrideValues = new Set(['default', 'webFullscreen', 'widescreen', 'bewlyWidescreen', 'inherit'])
const customPlayOrderOverrideValues = new Set(['sequential', 'reverse', 'random', 'inherit'])

const settingValueValidators = {
  videoCardContextMenuConfig: value => Array.isArray(value) && value.every(item =>
    isPlainObject(item)
    && hasExactProperties(item, ['key', 'visible'])
    && videoCardContextMenuKeys.includes(item.key as typeof videoCardContextMenuKeys[number])
    && typeof item.visible === 'boolean'),
  topBarComponentsConfig: value => Array.isArray(value) && value.every(item =>
    isPlainObject(item)
    && hasExactProperties(item, ['key', 'visible', 'badgeType'])
    && typeof item.key === 'string'
    && typeof item.visible === 'boolean'
    && ['number', 'dot', 'none'].includes(item.badgeType as string)),
  topBarPinnedChannels: value => Array.isArray(value) && value.every(item => typeof item === 'string'),
  dockItemsConfig: value => Array.isArray(value) && value.every(item =>
    isPlainObject(item)
    && hasExactProperties(item, ['page', 'visible', 'openInNewTab', 'useOriginalBiliPage'])
    && appPageValues.has(item.page as string)
    && typeof item.visible === 'boolean'
    && typeof item.openInNewTab === 'boolean'
    && typeof item.useOriginalBiliPage === 'boolean'),
  filterByTitle: value => Array.isArray(value) && value.every(item =>
    isPlainObject(item)
    && hasExactProperties(item, ['keyword', 'remark'])
    && typeof item.keyword === 'string'
    && typeof item.remark === 'string'),
  filterByUser: value => Array.isArray(value) && value.every(item =>
    isPlainObject(item)
    && hasExactProperties(item, ['keyword', 'remark'])
    && typeof item.keyword === 'string'
    && typeof item.remark === 'string'),
  homePageTabVisibilityList: value => Array.isArray(value) && value.every(item =>
    isPlainObject(item)
    && hasExactProperties(item, ['page', 'visible'])
    && homeSubPageValues.has(item.page as string)
    && typeof item.visible === 'boolean'),
  videoCardShadowCurve: value => Array.isArray(value) && value.every(item =>
    isPlainObject(item)
    && hasExactProperties(item, ['position', 'opacity'])
    && typeof item.position === 'number'
    && Number.isFinite(item.position)
    && typeof item.opacity === 'number'
    && Number.isFinite(item.opacity)),
  videoPlayerModeOverrides: value => isPlainObject(value)
    && Object.values(value).every(mode => videoPlayerModeOverrideValues.has(mode as string)),
  customPlayOrderOverrides: value => isPlainObject(value)
    && Object.values(value).every(mode => customPlayOrderOverrideValues.has(mode as string)),
} satisfies Partial<Record<keyof Settings, (value: unknown) => boolean>>

function handleImportSettings() {
  importSettingsRef.value?.click()
}

function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const selectedFile = input.files?.[0]
  input.value = ''

  if (!selectedFile)
    return

  const reader = new FileReader()
  reader.onload = () => {
    try {
      const importedSettings = JSON.parse(String(reader.result)) as Record<string, unknown>
      if (!importedSettings || Array.isArray(importedSettings) || typeof importedSettings !== 'object')
        throw new TypeError('Invalid settings backup')

      const validSettings: Partial<Record<keyof Settings, unknown>> = {}
      let importedCount = 0
      let ignoredCount = 0
      Object.keys(importedSettings).forEach((key) => {
        if (blockedPropertyNames.has(key)
          || !Object.prototype.hasOwnProperty.call(originalSettings, key)) {
          ignoredCount++
          return
        }

        const settingKey = key as keyof Settings
        const value = importedSettings[key]
        const enumValues = settingEnumValues[settingKey]
        const valueValidator = settingValueValidators[settingKey]
        if (!matchesSettingType(value, originalSettings[settingKey])
          || (enumValues && !enumValues.includes(value))
          || (valueValidator && !valueValidator(value))) {
          ignoredCount++
          return
        }

        validSettings[settingKey] = value
        importedCount++
      })

      if (importedCount === 0) {
        toast.warning(t('settings.maintenance.import_no_matches'))
        return
      }

      settings.value = { ...settings.value, ...validSettings } as Settings

      toast.success(t('settings.maintenance.import_success', {
        imported: importedCount,
        ignored: ignoredCount,
      }))
    }
    catch {
      toast.error(t('settings.maintenance.import_failed'))
    }
  }
  reader.readAsText(selectedFile)
}

function handleExportSettings() {
  const jsonStr = JSON.stringify(settings.value, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const dateTimeStr = new Date().toLocaleString('sv-SE').replace(/[- :]/g, '')

  link.href = url
  link.download = `bewly-settings-${dateTimeStr}.json`
  link.click()
  URL.revokeObjectURL(url)
}

async function handleResetSettings() {
  if (!await showConfirmDialog(t('settings.reset_settings_confirm')))
    return

  // 重置时保留用户当前使用的语言
  const resetSettings = structuredClone(originalSettings)
  resetSettings.language = settings.value.language
  settings.value = resetSettings
}
</script>

<template>
  <div>
    <SettingsItemGroup
      :title="$t('settings.maintenance.backup_title')"
      :desc="$t('settings.maintenance.backup_desc')"
    >
      <SettingsItem
        :title="$t('settings.import_settings')"
        :desc="$t('settings.maintenance.import_desc')"
        right-width="auto"
      >
        <input
          ref="importSettingsRef"
          type="file"
          accept=".json"
          hidden
          @change="handleImportFile"
        >
        <Button @click="handleImportSettings">
          <template #left>
            <div i-uil:import />
          </template>
          {{ $t('settings.import_settings') }}
        </Button>
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.export_settings')"
        :desc="$t('settings.export_settings_desc')"
        right-width="auto"
      >
        <Button @click="handleExportSettings">
          <template #left>
            <div i-uil:export />
          </template>
          {{ $t('settings.export_settings') }}
        </Button>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.maintenance.reset_title')"
      :desc="$t('settings.maintenance.reset_desc')"
    >
      <SettingsItem
        :title="$t('settings.reset_settings')"
        :desc="$t('settings.maintenance.reset_warning')"
        :badge="$t('settings.badge_irreversible')"
        right-width="auto"
      >
        <Button class="danger-button" @click="handleResetSettings">
          <template #left>
            <i i-mingcute:back-line />
          </template>
          {{ $t('settings.reset_settings') }}
        </Button>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
.danger-button {
  color: var(--bew-error-color);
}
</style>
