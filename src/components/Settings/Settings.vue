<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import type { CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'

import CloseButton from '~/components/CloseButton.vue'
import type { SettingsNavigationRequest } from '~/composables/useAppProvider'
import { useBewlyApp } from '~/composables/useAppProvider'
import { useReadyPageTransition } from '~/composables/useReadyPageTransition'
import { useReducedMotion } from '~/composables/useReducedMotion'
import type { SettingDescriptor } from '~/logic/layoutEdit'
import { enterLayoutEditMode, getSettingDescriptors, subscribeSettingNavigation } from '~/logic/layoutEdit'
import { createAsyncPageRegistry } from '~/utils/asyncPage'
import { getTopDialog } from '~/utils/dialogFocus'
import { subscribeViewportFrame } from '~/utils/viewportGeometry'

import { navigateToSetting } from './navigateToSetting'
import type { SettingsSearchEntry } from './searchCatalog'
import { settingsSearchEntries } from './searchCatalog'
import type { MenuItem } from './types'
import { MenuType } from './types'

const props = defineProps<{
  navigationRequest?: SettingsNavigationRequest | null
}>()
const emit = defineEmits(['close'])

const requestedNavigation = shallowRef<SettingsNavigationRequest | null>(null)

const { t, tm, rt } = useI18n()
const reducedMotion = useReducedMotion()
const searchQuery = ref('')
const isSearchFocused = ref(false)
const settingsContentKey = ref(0)
const descriptorTargetIds = new Map(getSettingDescriptors().map(descriptor => [descriptor.titleKey, descriptor.id]))
const settingsContentReady = ref(false)
const settingsLayerRef = ref<HTMLElement | null>(null)
let settingNavigationController: AbortController | undefined
let quickLayoutEditFrame: number | undefined
const settingsModalActive = ref(false)
let previouslyFocusedElement: HTMLElement | null = null
const inertSiblingStates = new Map<HTMLElement, boolean>()

const settingsFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getSettingsActiveElement() {
  const root = settingsLayerRef.value?.getRootNode()
  return root instanceof ShadowRoot ? root.activeElement : document.activeElement
}

function activateSettingsModal() {
  if (settingsModalActive.value || !settingsLayerRef.value)
    return
  settingsModalActive.value = true
  const activeElement = getSettingsActiveElement()
  previouslyFocusedElement = activeElement instanceof HTMLElement ? activeElement : null

  const parent = settingsLayerRef.value.parentElement
  if (parent) {
    for (const sibling of Array.from(parent.children)) {
      if (!(sibling instanceof HTMLElement) || sibling === settingsLayerRef.value)
        continue
      inertSiblingStates.set(sibling, sibling.inert)
      sibling.inert = true
    }
  }

  nextTick(() => settingsLayerRef.value?.focus({ preventScroll: true }))
}

function deactivateSettingsModal() {
  cancelSettingNavigation()
  if (!settingsModalActive.value)
    return
  settingsModalActive.value = false
  isSearchFocused.value = false
  inertSiblingStates.forEach((inert, sibling) => {
    if (sibling.isConnected)
      sibling.inert = inert
  })
  inertSiblingStates.clear()
  if (previouslyFocusedElement?.isConnected)
    previouslyFocusedElement.focus({ preventScroll: true })
  previouslyFocusedElement = null
}

function trapSettingsFocus(event: KeyboardEvent) {
  if (!settingsModalActive.value || event.key !== 'Tab' || !settingsLayerRef.value)
    return
  // A child Dialog owns Tab while open, including its teleported controls.
  if (getTopDialog(settingsLayerRef.value.getRootNode() as ParentNode))
    return
  const focusable = Array.from(settingsLayerRef.value.querySelectorAll<HTMLElement>(settingsFocusableSelector))
    .filter(element => element.offsetParent !== null && !element.inert)
  if (!focusable.length) {
    event.preventDefault()
    settingsLayerRef.value.focus({ preventScroll: true })
    return
  }

  const activeElement = getSettingsActiveElement()
  const currentIndex = focusable.indexOf(activeElement as HTMLElement)
  const nextIndex = event.shiftKey
    ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
    : (currentIndex < 0 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1)
  event.preventDefault()
  focusable[nextIndex].focus({ preventScroll: true })
}

onMounted(() => {
  activateSettingsModal()
})
onActivated(activateSettingsModal)
onDeactivated(deactivateSettingsModal)
useEventListener(() => settingsModalActive.value ? window : undefined, 'keydown', trapSettingsFocus, { capture: true })

provide('startQuickLayoutEdit', startQuickLayoutEdit)
const asyncSettings = createAsyncPageRegistry()
const settingsMenu = {
  [MenuType.General]: asyncSettings.define(() => import('./PluginComponentsAndPages/General/General.vue'), {}),
  [MenuType.BewlyPages]: asyncSettings.define(() => import('./Navigation/BewlyPages.vue'), {}),
  [MenuType.BewlyComponents]: asyncSettings.define(() => import('./Navigation/BewlyComponents.vue'), {}),
  [MenuType.Playback]: asyncSettings.define(() => import('./Navigation/Playback.vue'), {}),
  [MenuType.Bilibili]: asyncSettings.define(() => import('./BilibiliFeaturesEnhancement/BilibiliFeaturesEnhancement.vue'), {}),
  [MenuType.Appearance]: asyncSettings.define(() => import('./Appearance/Appearance.vue'), {}),
  [MenuType.About]: asyncSettings.define(() => import('./About/About.vue'), {}),
}
const settingsMenuStorageKey = 'bewly-settings-active-menu'
const bewlyPagesStorageKey = 'bewly-settings-bewly-pages-page'
const bewlyComponentsStorageKey = 'bewly-settings-bewly-components-page'
const storedMenuItem = sessionStorage.getItem(settingsMenuStorageKey)
const initialMenuItem = storedMenuItem
  ? storedMenuItem as MenuType
  : null
const activatedMenuItem = ref<MenuType>(
  initialMenuItem && Object.values(MenuType).includes(initialMenuItem)
    ? initialMenuItem
    : MenuType.General,
)
// The open page of each category with pages (its SettingsCategoryLayout
// reports it); the header shows the path to it. Kept per category so the path
// is complete the moment a category opens again, not dropped and re-added
// once its page mounts.
const pageTitles = reactive<Partial<Record<MenuType, string>>>({})
const pageTitle = computed(() => pageTitles[activatedMenuItem.value])
provide('setSettingsPageTitle', () => {
  const menuItem = activatedMenuItem.value
  return (title?: string) => {
    pageTitles[menuItem] = title
  }
})
const contentTransition = useReadyPageTransition(() => settingsMenu[activatedMenuItem.value], asyncSettings.preload)
watch(
  () => props.navigationRequest?.id,
  () => {
    requestedNavigation.value = props.navigationRequest ?? null
    const target = props.navigationRequest?.target
    if (target)
      activatedMenuItem.value = target.category === 'playback' ? MenuType.Playback : MenuType.BewlyPages
    if (target?.category === 'playback' && target.settingId) {
      const requestId = props.navigationRequest!.id
      nextTick(() => {
        if (requestedNavigation.value?.id === requestId)
          scrollToSettingId(target.settingId!, cancelSettingNavigation())
      })
    }
  },
  { immediate: true },
)
const settingsWindow = ref<HTMLDivElement>()
const settingsSearchRef = ref<HTMLElement>()
const searchInputRef = ref<HTMLInputElement>()
const searchPopoverStyle = ref<CSSProperties>({})
const { mainAppRef } = useBewlyApp()

function handleSearchBlur() {
  isSearchFocused.value = false
}

function handleSearchFocus() {
  isSearchFocused.value = true
}

function updateSearchPopoverBounds() {
  if (!settingsModalActive.value || !isSearchFocused.value)
    return
  const searchElement = settingsSearchRef.value
  const windowElement = settingsWindow.value
  if (!searchElement || !windowElement)
    return

  const searchRect = searchElement.getBoundingClientRect()
  const windowRect = windowElement.getBoundingClientRect()
  const edgeInset = 8
  const popoverGap = 8
  // Under the field from its left edge, as wide as the results need, inside
  // the window.
  const left = Math.max(searchRect.left, windowRect.left + edgeInset)
  const width = Math.min(Math.max(searchRect.width, 360), windowRect.right - edgeInset - left)
  const bottomEdge = Math.min(window.innerHeight, windowRect.bottom) - edgeInset

  // Fixed positioning so the popover can be teleported out of the settings
  // window, above its clipped columns.
  searchPopoverStyle.value = {
    position: 'fixed',
    top: `${searchRect.bottom + popoverGap}px`,
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(0, bottomEdge - searchRect.bottom - popoverGap)}px`,
  }
}

function focusSettingsSearch(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('.settings-search-results'))
    return

  searchInputRef.value?.focus({ preventScroll: true })
}

const scrollViewportRef = ref<HTMLElement>()
watch([settingsModalActive, isSearchFocused, scrollViewportRef], ([active, focused, viewport], _previous, onCleanup) => {
  if (!active || !focused || !viewport)
    return
  updateSearchPopoverBounds()
  onCleanup(subscribeViewportFrame(viewport, (_geometry, reason) => {
    if (reason === 'layout')
      updateSearchPopoverBounds()
  }))
}, { flush: 'post' })

// 滚动时关闭搜索弹窗（保留搜索词）
useEventListener(() => scrollViewportRef.value, 'scroll', () => {
  if (isSearchFocused.value) {
    isSearchFocused.value = false
    searchInputRef.value?.blur()
  }
}, { capture: true })

provide('scrollSettingsContentToTop', () => {
  cancelSettingNavigation()
  scrollViewportRef.value?.scrollTo({ top: 0 })
})

watch(
  () => activatedMenuItem.value,
  (menuItem) => {
    sessionStorage.setItem(settingsMenuStorageKey, menuItem)
    scrollViewportRef.value?.scrollTo({ top: 0 })
  },
)

const settingsMenuItems: MenuItem[] = [
  {
    value: MenuType.General,
    icon: 'i-tabler:settings',
    iconActivated: 'i-tabler:settings-filled',
    titleKey: 'settings.menu_general',
  },
  {
    value: MenuType.BewlyPages,
    icon: 'i-tabler:world',
    iconActivated: 'i-tabler:world',
    titleKey: 'settings.menu_bewly_pages',
  },
  {
    value: MenuType.BewlyComponents,
    icon: 'i-tabler:tool',
    iconActivated: 'i-tabler:tool',
    titleKey: 'settings.menu_bewly_components',
  },
  {
    value: MenuType.Playback,
    icon: 'i-tabler:player-play',
    iconActivated: 'i-tabler:player-play-filled',
    titleKey: 'settings.menu_playback',
  },
  {
    value: MenuType.Bilibili,
    icon: 'i-tabler:sparkles',
    iconActivated: 'i-tabler:sparkles',
    titleKey: 'settings.menu_bilibili',
    sectionStart: true,
  },
  {
    value: MenuType.Appearance,
    titleKey: 'settings.menu_appearance',
    icon: 'i-tabler:brush',
    iconActivated: 'i-tabler:brush',
  },
  {
    value: MenuType.About,
    icon: 'i-tabler:info-circle',
    iconActivated: 'i-tabler:info-circle-filled',
    titleKey: 'settings.menu_about',
    sectionStart: true,
  },
]
const activeSettingsComponentProps = computed(() => (
  (activatedMenuItem.value === MenuType.BewlyPages || activatedMenuItem.value === MenuType.Playback)
    ? { navigationTarget: requestedNavigation.value }
    : {}
))

function getSearchEntryTitle(entry: SettingsSearchEntry) {
  return entry.titleKey ? t(entry.titleKey) : entry.title ?? ''
}

function getSearchEntryLocation(entry: SettingsSearchEntry) {
  const primaryTitle = getMenuTitle(entry.menu)
  const location = entry.secondaryTitleKey
    ? `${primaryTitle} / ${t(entry.secondaryTitleKey)}`
    : primaryTitle
  return entry.contextTitleKey ? `${t(entry.contextTitleKey)} · ${location}` : location
}

function getTranslatedSearchTerms(key: string): string[] {
  const collectTerms = (message: unknown): string[] => {
    if (typeof message === 'string' || typeof message === 'function')
      return [rt(message as Parameters<typeof rt>[0])]
    if (Array.isArray(message))
      return message.flatMap(collectTerms)
    if (message && typeof message === 'object')
      return Object.values(message).flatMap(collectTerms)
    return []
  }

  return collectTerms(tm(key))
}

function getSearchEntryText(entry: SettingsSearchEntry) {
  const inferredKeywordKeys = entry.titleKey
    ? [`${entry.titleKey}_desc`, `${entry.titleKey}_opt`, `${entry.titleKey}_option`, `${entry.titleKey}_unit`, ...(entry.titleKey.endsWith('.title') ? [entry.titleKey.slice(0, -6)] : [])]
    : []
  const translatedKeywords = [...inferredKeywordKeys, ...(entry.keywordKeys ?? [])]
    .flatMap(getTranslatedSearchTerms)

  // 菜单路径只用于结果定位，避免输入分类名时命中整组设置。
  return [
    getSearchEntryTitle(entry),
    ...translatedKeywords,
    ...(entry.keywords ?? []),
  ].join(' ').toLocaleLowerCase()
}

const searchIndex = computed(() => settingsSearchEntries.filter(entry => !entry.developmentOnly || __DEV__).map(entry => ({
  entry,
  title: getSearchEntryTitle(entry).toLocaleLowerCase(),
  text: getSearchEntryText(entry),
})))
const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query)
    return []
  const parts = query.split(/\s+/)
  return searchIndex.value
    .filter(item => parts.every(part => item.text.includes(part)))
    .map(item => ({
      entry: item.entry,
      rank: item.title === query ? 0 : item.title.startsWith(query) ? 1 : item.title.includes(query) ? 2 : parts.every(part => item.title.includes(part)) ? 3 : 4,
    }))
    .sort((a, b) => a.rank - b.rank)
    .map(item => item.entry)
})

const activeSearchResultIndex = ref(-1)
const searchResultsRef = ref<HTMLElement>()

watch(searchQuery, () => {
  cancelSettingNavigation()
  activeSearchResultIndex.value = -1
}, { flush: 'sync' })

function moveSearchResultSelection(event: KeyboardEvent, direction: 1 | -1) {
  if (event.isComposing)
    return

  const resultCount = searchResults.value.length
  if (!resultCount)
    return

  event.preventDefault()
  if (activeSearchResultIndex.value < 0)
    activeSearchResultIndex.value = direction > 0 ? 0 : resultCount - 1
  else
    activeSearchResultIndex.value = (activeSearchResultIndex.value + direction + resultCount) % resultCount

  // 键盘导航时让选中项滚动到可视区内
  nextTick(() => {
    const list = searchResultsRef.value
    const item = list?.children[activeSearchResultIndex.value]
    if (!list || !item)
      return
    const rect = list.getBoundingClientRect()
    const target = item.getBoundingClientRect()
    if (target.top < rect.top)
      list.scrollTop += target.top - rect.top
    else if (target.bottom > rect.bottom)
      list.scrollTop += target.bottom - rect.bottom
  })
}

function activateSearchResult(event: KeyboardEvent) {
  if (event.isComposing)
    return

  const entry = searchResults.value[activeSearchResultIndex.value] ?? searchResults.value[0]
  if (entry) {
    event.preventDefault()
    navigateToSearchResult(entry, true)
  }
}

function getMenuTitle(menu: MenuType) {
  const menuItem = settingsMenuItems.find(item => item.value === menu)
  return menuItem ? t(menuItem.titleKey) : t('settings.title')
}

let highlightedSearchTarget: HTMLElement | undefined
let searchTargetHighlightTimer: number | undefined
let searchNavigationId = 0

function clearSearchTargetHighlight() {
  if (searchTargetHighlightTimer)
    window.clearTimeout(searchTargetHighlightTimer)

  highlightedSearchTarget?.classList.remove('settings-search-target')
  highlightedSearchTarget?.removeAttribute('data-settings-search-highlight')
  highlightedSearchTarget = undefined
  searchTargetHighlightTimer = undefined
}

function highlightSearchTarget(target: HTMLElement, hint?: string) {
  clearSearchTargetHighlight()
  const visualTarget = target.matches('.b-settings-item-group')
    ? target.querySelector<HTMLElement>(':scope > .group-heading, :scope > .group-title') ?? target
    : target

  highlightedSearchTarget = visualTarget
  visualTarget.dataset.settingsSearchHighlight = hint ?? t('settings.search.located')
  visualTarget.classList.add('settings-search-target')
  searchTargetHighlightTimer = window.setTimeout(clearSearchTargetHighlight, 2400)
}

function cancelSettingNavigation() {
  searchNavigationId++
  settingNavigationController?.abort()
  settingNavigationController = undefined
  clearSearchTargetHighlight()
  return searchNavigationId
}

async function locateSetting(find: () => HTMLElement | undefined, navigationId: number, keyboard = false, hint?: (target: HTMLElement) => string | undefined) {
  if (!settingsModalActive.value || navigationId !== searchNavigationId || !settingsWindow.value || !scrollViewportRef.value)
    return
  const owner = new AbortController()
  settingNavigationController = owner
  const target = await navigateToSetting({ root: settingsWindow.value, viewport: scrollViewportRef.value, find, signal: owner.signal, behavior: keyboard || reducedMotion.value ? 'auto' : 'smooth' })
  if (target && !owner.signal.aborted && settingsModalActive.value && navigationId === searchNavigationId) {
    highlightSearchTarget(target, hint?.(target))
    if (keyboard) {
      const selector = 'button:not([disabled]), input:not([disabled]), select:not([disabled])'
      const control = target.matches(selector) ? target : target.querySelector<HTMLElement>(selector)
      control?.focus({ preventScroll: true })
    }
  }
  if (settingNavigationController === owner)
    settingNavigationController = undefined
}

function scrollToSearchTarget(entry: SettingsSearchEntry, navigationId: number, keyboard = false) {
  const ids = [entry.targetId!, ...(entry.fallbackIds ?? [])].map(id => descriptorTargetIds.get(id) ?? id)
  const find = () => {
    for (const id of ids) {
      const target = Array.from(settingsWindow.value?.querySelectorAll<HTMLElement>(`[data-setting-id="${CSS.escape(id)}"]`) ?? [])
        .find(element => !element.closest('.page-fade-leave-active'))
      if (target)
        return target
    }
  }
  void locateSetting(find, navigationId, keyboard, target => target.dataset.settingId === ids[0]
    ? undefined
    : t('settings.search.parent_control_hint', { setting: entry.conditionTitleKey ? t(entry.conditionTitleKey) : target.dataset.settingsTitle ?? getSearchEntryTitle(entry) }))
}

function navigateToSearchResult(entry: SettingsSearchEntry, keyboard = false) {
  requestedNavigation.value = null
  searchQuery.value = ''
  const navigationId = cancelSettingNavigation()
  activateSettingsRoute(entry.menu, entry.storageValues)
  nextTick(() => scrollToSearchTarget(entry, navigationId, keyboard))
}

function activateSettingsRoute(menu: MenuType, values: ReadonlyArray<{ key: string, value: string }> = []) {
  let changed = false
  for (const { key, value } of values) {
    if (sessionStorage.getItem(key) !== value) {
      sessionStorage.setItem(key, value)
      changed = true
    }
  }
  // A primary-category change mounts its own component. Only a changed route
  // within the same mounted category needs the storage-backed subtree rebuilt.
  if (activatedMenuItem.value === menu && changed)
    settingsContentKey.value++
  activatedMenuItem.value = menu
}

function scrollToSettingId(settingId: string, navigationId: number) {
  void locateSetting(() => settingsWindow.value?.querySelector<HTMLElement>(`[data-setting-id="${CSS.escape(settingId)}"]`) ?? undefined, navigationId)
}

function navigateToSettingDescriptor(descriptor: SettingDescriptor) {
  requestedNavigation.value = null
  const menu = descriptor.category as MenuType
  if (!(menu in settingsMenu))
    return
  const navigationId = cancelSettingNavigation()
  const key = menu === MenuType.BewlyPages ? bewlyPagesStorageKey : menu === MenuType.BewlyComponents ? bewlyComponentsStorageKey : undefined
  activateSettingsRoute(menu, key ? [{ key, value: descriptor.page }] : [])
  nextTick(() => scrollToSettingId(descriptor.id, navigationId))
}

const unsubscribeSettingNavigation = subscribeSettingNavigation(navigateToSettingDescriptor)

onBeforeUnmount(() => {
  deactivateSettingsModal()
  unsubscribeSettingNavigation()
  if (quickLayoutEditFrame !== undefined)
    cancelAnimationFrame(quickLayoutEditFrame)
})

function handleClose() {
  emit('close')
}

function startQuickLayoutEdit() {
  handleClose()
  if (quickLayoutEditFrame !== undefined)
    cancelAnimationFrame(quickLayoutEditFrame)
  quickLayoutEditFrame = requestAnimationFrame(() => {
    quickLayoutEditFrame = undefined
    enterLayoutEditMode()
  })
}

function changeMenuItem(menuItem: MenuType) {
  requestedNavigation.value = null
  cancelSettingNavigation()
  activatedMenuItem.value = menuItem
}
</script>

<template>
  <div
    ref="settingsLayerRef"
    class="settings-layer fixed w-full h-full top-0 left-0"
    role="dialog"
    aria-modal="true"
    :aria-label="$t('settings.title')"
    tabindex="-1"
    @bew-settings-motion-ready="settingsContentReady = true"
  >
    <div class="settings-backdrop" @click="handleClose" />
    <!-- One solid window ruled into regions by hairlines (user-specified, after
         Claude Code): the header across the top, then the categories (search
         on top), a category's pages, and the open page. No glass, no top blur. -->
    <div
      id="settings-window"
      ref="settingsWindow"
      class="settings-window"
      pos="fixed top-1/2 left-1/2" transform="~ translate-x--1/2 translate-y--1/2 gpu"
    >
      <div class="settings-window__surface" aria-hidden="true" />
      <header class="settings-header">
        <!-- The path to the open page: settings, its category, its page. -->
        <h2 class="settings-header__title">
          <span class="settings-header__crumb">{{ $t('settings.title') }}</span>
          <i class="settings-header__separator" i-tabler:chevron-right aria-hidden="true" />
          <span class="settings-header__crumb" :class="{ 'is-current': !pageTitle }">{{ getMenuTitle(activatedMenuItem) }}</span>
          <Transition name="settings-crumb">
            <span v-if="pageTitle" class="settings-header__page">
              <i class="settings-header__separator" i-tabler:chevron-right aria-hidden="true" />
              <span class="settings-header__crumb is-current">{{ pageTitle }}</span>
            </span>
          </Transition>
        </h2>
        <CloseButton
          class="settings-header__close"
          :label="$t('common.close')"
          @click="handleClose"
        />
      </header>

      <div class="settings-body">
        <!-- The categories, with the search pinned above them. -->
        <div class="settings-primary">
          <div
            ref="settingsSearchRef"
            class="settings-search"
            :class="{ 'has-query': Boolean(searchQuery) }"
            @click="focusSettingsSearch"
          >
            <i i-tabler:search aria-hidden="true" />
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="search"
              :placeholder="$t('settings.search.placeholder')"
              :aria-label="$t('settings.search.placeholder')"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="settings-search-results"
              :aria-expanded="Boolean(searchQuery && isSearchFocused)"
              :aria-activedescendant="activeSearchResultIndex >= 0 ? `settings-search-result-${activeSearchResultIndex}` : undefined"
              @keydown.esc="searchQuery = ''"
              @keydown.down="moveSearchResultSelection($event, 1)"
              @keydown.up="moveSearchResultSelection($event, -1)"
              @keydown.enter="activateSearchResult"
              @focus="() => { handleSearchFocus(); updateSearchPopoverBounds() }"
              @blur="handleSearchBlur"
            >
          </div>
          <nav class="settings-primary-navigation" :aria-label="$t('settings.title')">
            <ul class="settings-primary-navigation__list">
              <li
                v-for="menuItem in settingsMenuItems"
                :key="menuItem.value"
                :class="{ 'menu-section-start': menuItem.sectionStart }"
              >
                <button
                  type="button"
                  class="settings-primary-navigation__item"
                  :class="{ 'menu-item-activated': menuItem.value === activatedMenuItem }"
                  :aria-current="menuItem.value === activatedMenuItem ? 'page' : undefined"
                  :aria-label="$t(menuItem.titleKey)"
                  @click="changeMenuItem(menuItem.value)"
                >
                  <span
                    class="settings-nav-icon"
                    :class="menuItem.value === activatedMenuItem ? menuItem.iconActivated : menuItem.icon"
                    aria-hidden="true"
                  />
                  <span class="settings-nav-label">{{ $t(menuItem.titleKey) }}</span>
                  <span v-if="menuItem.badge" class="settings-primary-navigation__badge bew-warning-badge">
                    {{ menuItem.badge }}
                  </span>
                </button>
              </li>
            </ul>
          </nav>
        </div>

        <div
          ref="scrollViewportRef"
          class="settings-content__scroll"
        >
          <main class="settings-main">
            <Transition mode="out-in" v-bind="contentTransition">
              <Component
                :is="settingsMenu[activatedMenuItem as keyof typeof settingsMenu]"
                v-if="settingsContentReady"
                :key="settingsContentKey"
                v-bind="activeSettingsComponentProps"
              />
            </Transition>
          </main>
        </div>
      </div>
    </div>

    <Teleport :to="mainAppRef" :disabled="!mainAppRef">
      <Transition name="settings-search-popover">
        <div
          v-if="searchQuery && isSearchFocused"
          id="settings-search-results"
          ref="searchResultsRef"
          class="settings-search-results bew-popover-surface"
          role="listbox"
          :style="[
            searchPopoverStyle,
            {
              zIndex: 'var(--bew-z-control-menu)',
            },
          ]"
        >
          <button
            v-for="(entry, index) in searchResults"
            :id="`settings-search-result-${index}`"
            :key="`${entry.menu}-${entry.secondaryTitleKey ?? ''}-${entry.titleKey ?? entry.title}-${index}`"
            type="button"
            role="option"
            tabindex="-1"
            :aria-selected="index === activeSearchResultIndex"
            :class="{ active: index === activeSearchResultIndex }"
            @mouseenter="activeSearchResultIndex = index"
            @click="navigateToSearchResult(entry)"
          >
            <strong>{{ getSearchEntryTitle(entry) }}</strong>
            <span>{{ getSearchEntryLocation(entry) }}</span>
          </button>
          <p v-if="searchResults.length === 0">
            {{ $t('settings.search.no_results') }}
          </p>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
@use "../../styles/modalWindow";
@use "../../styles/settingsNav";
@use "../../styles/truncateFade";

// The page dims behind the window like behind every modal.
.settings-backdrop {
  @include modalWindow.backdrop;
  position: absolute;
  inset: 0;
}

#settings-window {
  --bew-panel-enter-duration: var(--bew-duration-moderate);
  --bew-panel-leave-duration: var(--bew-duration-moderate);
  container: settings-window / inline-size;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: min(1120px, calc(100% - var(--bew-space-12)));
  height: min(860px, calc(100% - var(--bew-space-12)));
  transform-origin: center;
}

// The window's paint is a layer of its own, so opening fades it while the
// window itself only scales (useSettingsMotion).
.settings-window__surface {
  @include modalWindow.surface;
  position: absolute;
  inset: 0;
  z-index: 0;
  box-sizing: border-box;
  pointer-events: none;
}

// The window header every modal shares; its title lines up with the
// navigation rows' icons (both start at the window's content inset).
.settings-header {
  @include modalWindow.header;
  position: relative;
  z-index: 1;
}

.settings-header__title {
  @include modalWindow.title;
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: var(--bew-space-1);
  min-width: 0;
  color: var(--bew-text-2);
}

// Each step shrinks and fades at its end when the path is too long; the
// open one reads as the title.
.settings-header__crumb {
  flex: 0 1 auto;
  min-width: 0;
  transition: color var(--bew-duration-fast) var(--bew-ease-standard);
  @include truncateFade.line;

  &.is-current {
    color: var(--bew-text-1);
  }
}

.settings-header__separator {
  flex: none;
  width: var(--bew-icon-size-xs);
  height: var(--bew-icon-size-xs);
  color: var(--bew-text-3);
}

.settings-header__page {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: var(--bew-space-1);
  min-width: 0;
}

.settings-crumb-enter-active,
.settings-crumb-leave-active {
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.settings-crumb-enter-from,
.settings-crumb-leave-to {
  opacity: 0;
}

// Pinned above the categories, a row tall, its icon where the rows' icons are.
.settings-search {
  position: relative;
  display: flex;
  flex: none;
  box-sizing: border-box;
  align-items: center;
  gap: var(--bew-space-2);
  height: var(--bew-space-8);
  padding: 0 #{settingsNav.$row-inset};
  color: var(--bew-text-1);
  background: var(--bew-input-bg);
  border: 1px solid var(--bew-field-edge-color);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  cursor: text;
  transition: border-color var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover {
    border-color: var(--bew-field-edge-color-hover);
  }

  > i {
    flex: 0 0 auto;
    width: var(--bew-icon-size-sm);
    height: var(--bew-icon-size-sm);
    color: var(--bew-text-3);
    pointer-events: none;
  }

  input {
    width: 100%;
    min-width: 0;
    color: var(--bew-text-1);
    background: transparent;
    border: 0;
    outline: 0;
    font-size: var(--bew-font-size-control);
    font-weight: var(--bew-font-weight-regular);
    line-height: var(--bew-line-height-control);

    &::placeholder {
      color: var(--bew-text-4);
    }
  }
}

.settings-header__close {
  flex: none;
}

// The columns below the header: the categories, then the open category
// (its own pages column, if it has pages, and the page).
.settings-body {
  // The open page's padding and measure; SettingsCategoryLayout reads them
  // for the column it lays a page out in. Set here, under the window, so the
  // window's own container queries can change them.
  --settings-content-padding: var(--bew-space-6) var(--bew-space-8) var(--bew-space-10);
  --settings-content-max-width: 720px;
  --settings-primary-width: 216px;
  position: relative;
  z-index: 1;
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: var(--settings-primary-width) minmax(0, 1fr);
  // The columns are exactly as tall as the window leaves them; each scrolls.
  grid-template-rows: minmax(0, 1fr);
  min-height: 0;
}

// The search stays put; only the categories under it scroll.
.settings-primary {
  @include settingsNav.column;
  gap: var(--bew-space-3);
}

.settings-primary-navigation {
  @include settingsNav.scroller;
  flex: 1 1 auto;
  min-height: 0;
}

.settings-primary-navigation__list {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

// A new group of categories: space, not another line.
.menu-section-start {
  margin-top: var(--bew-space-4);
}

.settings-primary-navigation__item {
  @include settingsNav.row(".menu-item-activated");
}

.settings-primary-navigation__badge {
  flex: none;
}

// The open page scrolls on its own. It is a size container so the pages
// column of a category (sticky inside it) can be exactly as tall as it.
.settings-content__scroll {
  container: settings-viewport / size;
  min-width: 0;
  min-height: 0;
  overflow: hidden auto;
  overflow-anchor: none;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  // Its scrollbar ends inside the window's bottom corner.
  border-end-end-radius: var(--bew-modal-radius);
  corner-shape: var(--bew-corner-shape);
}

.settings-main {
  box-sizing: border-box;
  min-height: 100%;
  max-width: calc(var(--settings-content-max-width) + var(--bew-space-8) * 2);
  padding: var(--settings-content-padding);
}

// A category with pages lays out its own columns edge to edge.
.settings-main:has(> .settings-category-layout) {
  max-width: none;
  padding: 0;
}

.settings-search-results {
  box-sizing: border-box;
  padding: var(--bew-space-2);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;

  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--bew-space-3);
    width: 100%;
    min-height: var(--bew-control-height);
    padding: var(--bew-space-2) var(--bew-space-4);
    text-align: left;
    border-radius: var(--bew-interactive-radius);
    corner-shape: var(--bew-corner-shape);
    transition: background-color var(--bew-duration-normal) var(--bew-ease-standard);

    &:hover {
      background: var(--bew-fill-2);
    }

    &.active {
      background: var(--bew-fill-2);
    }
  }

  strong {
    min-width: 0;
    color: var(--bew-text-1);
    font-size: var(--bew-font-size-body);
    font-weight: var(--bew-font-weight-regular);
    line-height: var(--bew-line-height-body);
    @include truncateFade.line;
  }

  span,
  p {
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
  }

  span {
    flex: 0 1 auto;
    @include truncateFade.line;
  }

  p {
    padding: var(--bew-space-3);
    text-align: center;
  }
}

.settings-search-results {
  transform-origin: top left;
}

.settings-search-popover-enter-active,
.settings-search-popover-leave-active {
  transition:
    opacity 0.24s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-search-popover-enter-from,
.settings-search-popover-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

:deep(.settings-search-target) {
  position: relative;
  z-index: 2;
  isolation: isolate;
  border-radius: var(--bew-surface-radius);
  corner-shape: var(--bew-corner-shape);
}

:deep(.settings-search-target > *) {
  position: relative;
  z-index: 1;
}

:deep(.settings-search-target::before) {
  position: absolute;
  inset: 0 -12px;
  z-index: 0;
  background: var(--bew-selected-bg);
  border-radius: var(--bew-surface-radius);
  corner-shape: inherit;
  content: "";
  opacity: 0;
  pointer-events: none;
  animation: settings-search-target-flash 2.4s ease-in-out;
}

:deep(.settings-search-target::after) {
  position: absolute;
  top: -13px;
  right: 12px;
  z-index: 3;
  padding: var(--bew-space-1) var(--bew-space-2);
  color: var(--bew-text-1);
  background: var(--bew-selected-bg);
  border-radius: var(--bew-pill-radius);
  corner-shape: var(--bew-corner-shape-capsule);
  box-shadow: var(--bew-shadow-2);
  content: attr(data-settings-search-highlight);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-control);
  pointer-events: none;
  white-space: nowrap;
  animation: settings-search-target-label 2.4s ease-out;
}

@keyframes settings-search-target-flash {
  0%,
  100% {
    opacity: 0;
  }

  18%,
  48%,
  78% {
    opacity: 0.18;
  }

  33%,
  63% {
    opacity: 0;
  }
}

@keyframes settings-search-target-label {
  0% {
    opacity: 0;
    transform: translateY(5px);
  }

  14%,
  72% {
    opacity: 1;
    transform: translateY(0);
  }

  100% {
    opacity: 0;
    transform: translateY(-5px);
  }
}

// A narrower window keeps every column: the categories become icons and the
// search folds to its icon, opening over the next column while in use.
@container settings-window (max-width: 820px) {
  .settings-body {
    --settings-primary-width: calc(#{settingsNav.$column-inset} * 2 + var(--bew-space-8) + var(--bew-space-2));
    --settings-content-padding: var(--bew-space-5) var(--bew-space-5) var(--bew-space-8);
  }

  .settings-primary-navigation__item {
    justify-content: center;
    padding-inline: 0;

    > .settings-nav-label,
    > .settings-primary-navigation__badge {
      display: none;
    }
  }

  .settings-search {
    justify-content: center;
    padding: 0;
    cursor: pointer;

    input {
      width: 0;
      opacity: 0;
      pointer-events: none;
    }

    // Still in the column's flow, so nothing under it moves.
    &:focus-within,
    &.has-query {
      z-index: 2;
      justify-content: flex-start;
      width: 240px;
      padding: 0 #{settingsNav.$row-inset};
      cursor: text;

      input {
        width: 100%;
        opacity: 1;
        pointer-events: auto;
      }
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .settings-search,
  .settings-header__crumb,
  .settings-crumb-enter-active,
  .settings-crumb-leave-active {
    transition: none;
  }

  .settings-search-popover-enter-active,
  .settings-search-popover-leave-active {
    transition-property: opacity;
    transform: none;
  }

  :deep(.settings-search-target::before),
  :deep(.settings-search-target::after) {
    animation: none;
  }
}
</style>
