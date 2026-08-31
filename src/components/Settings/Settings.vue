<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import type { CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'

import CloseButton from '~/components/CloseButton.vue'
import PanelTopBlur from '~/components/PanelTopBlur.vue'
import type { SettingsNavigationRequest } from '~/composables/useAppProvider'
import { useBewlyApp } from '~/composables/useAppProvider'
import { settings } from '~/logic'
import type { SettingDescriptor } from '~/logic/layoutEdit'
import { subscribeSettingNavigation } from '~/logic/layoutEdit'

import type { SettingsSearchEntry } from './searchCatalog'
import { settingsSearchEntries } from './searchCatalog'
import type { MenuItem } from './types'
import { MenuType } from './types'

const props = defineProps<{
  navigationRequest?: SettingsNavigationRequest | null
}>()

const emit = defineEmits(['close'])

const { t, tm, rt } = useI18n()
const breadcrumbDetail = ref<string>()
const searchQuery = ref('')
const settingsContentKey = ref(0)
const settingsContentReady = ref(false)
const settingsLayerRef = ref<HTMLElement | null>(null)
let settingsContentFrame: number | undefined
let settingNavigationTimer: number | undefined
let settingsModalActive = false
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
  if (settingsModalActive || !settingsLayerRef.value)
    return
  settingsModalActive = true
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
  if (!settingsModalActive)
    return
  settingsModalActive = false
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
  if (!settingsModalActive || event.key !== 'Tab' || !settingsLayerRef.value)
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
  // 先让设置外壳完成首帧绘制，再挂载异步设置页，避免点击反馈被重组件初始化阻塞。
  settingsContentFrame = requestAnimationFrame(() => {
    settingsContentFrame = requestAnimationFrame(() => {
      settingsContentFrame = undefined
      settingsContentReady.value = true
    })
  })
})
onActivated(activateSettingsModal)
onDeactivated(deactivateSettingsModal)
useEventListener(window, 'keydown', trapSettingsFocus, { capture: true })

provide('setSettingsBreadcrumb', (detail?: string) => {
  breadcrumbDetail.value = detail
})

const settingsMenu = {
  [MenuType.General]: defineAsyncComponent(() => import('./PluginComponentsAndPages/General/General.vue')),
  [MenuType.BewlyPages]: defineAsyncComponent(() => import('./Navigation/BewlyPages.vue')),
  [MenuType.BewlyComponents]: defineAsyncComponent(() => import('./Navigation/BewlyComponents.vue')),
  [MenuType.Bilibili]: defineAsyncComponent(() => import('./BilibiliFeaturesEnhancement/BilibiliFeaturesEnhancement.vue')),
  [MenuType.Appearance]: defineAsyncComponent(() => import('./Appearance/Appearance.vue')),
  [MenuType.About]: defineAsyncComponent(() => import('./About/About.vue')),
}
const settingsMenuStorageKey = 'bewly-settings-active-menu'
const navigationPageStorageKey = 'bewly-settings-navigation-page'
const bewlyPagesStorageKey = 'bewly-settings-bewly-pages-page'
const bewlyComponentsStorageKey = 'bewly-settings-bewly-components-page'
const playbackPageStorageKey = 'bewly-settings-playback-page'
const bilibiliPageStorageKey = 'bewly-settings-bilibili-page'
const storedMenuItem = sessionStorage.getItem(settingsMenuStorageKey)
const legacyNavigationPage = sessionStorage.getItem(navigationPageStorageKey)
const legacyPlaybackPages: Record<string, string> = {
  Player: 'player',
  AutoPlay: 'auto-play',
}
if (storedMenuItem && legacyPlaybackPages[storedMenuItem])
  sessionStorage.setItem(bilibiliPageStorageKey, legacyPlaybackPages[storedMenuItem])

if (!sessionStorage.getItem(bilibiliPageStorageKey)) {
  const legacyPlaybackPage = sessionStorage.getItem(playbackPageStorageKey)
  if (legacyPlaybackPage)
    sessionStorage.setItem(bilibiliPageStorageKey, legacyPlaybackPage)
}

const legacyNavigationComponentPages = new Set(['video-card', 'topbar', 'dock'])
const legacyNavigationMenu = legacyNavigationPage === 'link-opening'
  ? MenuType.General
  : legacyNavigationPage && legacyNavigationComponentPages.has(legacyNavigationPage)
    ? MenuType.BewlyComponents
    : MenuType.BewlyPages

const legacyMenuAliases: Record<string, MenuType> = {
  Browsing: legacyNavigationMenu,
  Navigation: legacyNavigationMenu,
  Player: MenuType.Bilibili,
  AutoPlay: MenuType.Bilibili,
  Playback: MenuType.Bilibili,
  BilibiliFeaturesEnhancement: MenuType.Bilibili,
  Advanced: MenuType.General,
}

if (!sessionStorage.getItem(bewlyPagesStorageKey) && legacyNavigationPage && ['home', 'moments', 'search'].includes(legacyNavigationPage))
  sessionStorage.setItem(bewlyPagesStorageKey, legacyNavigationPage)

if (!sessionStorage.getItem(bewlyComponentsStorageKey) && legacyNavigationPage && legacyNavigationComponentPages.has(legacyNavigationPage))
  sessionStorage.setItem(bewlyComponentsStorageKey, legacyNavigationPage)

const initialMenuItem = storedMenuItem
  ? legacyMenuAliases[storedMenuItem] ?? storedMenuItem as MenuType
  : null
const activatedMenuItem = ref<MenuType>(
  initialMenuItem && Object.values(MenuType).includes(initialMenuItem)
    ? initialMenuItem
    : MenuType.General,
)
watch(
  () => props.navigationRequest?.id,
  () => {
    if (props.navigationRequest?.target.category === 'bewly-pages')
      activatedMenuItem.value = MenuType.BewlyPages
  },
  { immediate: true },
)
const settingsWindow = ref<HTMLDivElement>()
const isPrimaryNavigationExpanded = ref(false)
const settingsSearchRef = ref<HTMLElement>()
const searchInputRef = ref<HTMLInputElement>()
const searchPopoverStyle = ref<CSSProperties>({})
const isSearchFocused = ref(false)
const { mainAppRef } = useBewlyApp()

function handleSearchBlur() {
  isSearchFocused.value = false
}

function handleSearchFocus() {
  isSearchFocused.value = true
}

function updateSearchPopoverBounds() {
  const searchElement = settingsSearchRef.value
  const contentElement = searchElement?.closest<HTMLElement>('.settings-content')
  if (!searchElement || !contentElement)
    return

  const searchRect = searchElement.getBoundingClientRect()
  const contentRect = contentElement.getBoundingClientRect()
  const edgeInset = 8
  const popoverGap = 10
  const narrowLayout = window.innerWidth <= 760
  const bottomEdge = Math.min(window.innerHeight - edgeInset, contentRect.bottom - edgeInset)

  // Fixed positioning so the popover can be teleported out of the settings
  // window (which has its own backdrop-filter that would swallow ours).
  searchPopoverStyle.value = {
    position: 'fixed',
    top: `${searchRect.bottom + popoverGap}px`,
    right: narrowLayout ? 'auto' : `${window.innerWidth - searchRect.right}px`,
    left: narrowLayout ? `${contentRect.left + edgeInset}px` : 'auto',
    width: narrowLayout ? `${Math.max(0, contentRect.width - edgeInset * 2)}px` : `${searchRect.width}px`,
    maxHeight: `${Math.max(0, bottomEdge - searchRect.bottom - popoverGap)}px`,
  }
}

function focusSettingsSearch(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('.settings-search-results'))
    return

  searchInputRef.value?.focus({ preventScroll: true })
  nextTick(updateSearchPopoverBounds)
}

useEventListener(window, 'resize', () => {
  nextTick(updateSearchPopoverBounds)
})

const scrollViewportRef = ref<HTMLElement>()

// 滚动时关闭搜索弹窗（保留搜索词）
useEventListener(() => scrollViewportRef.value, 'scroll', () => {
  if (isSearchFocused.value) {
    isSearchFocused.value = false
    searchInputRef.value?.blur()
  }
}, { capture: true })

provide('scrollSettingsContentToTop', () => {
  scrollViewportRef.value?.scrollTo({ top: 0 })
})

watch(
  () => activatedMenuItem.value,
  (menuItem) => {
    breadcrumbDetail.value = undefined
    sessionStorage.setItem(settingsMenuStorageKey, menuItem)
    scrollViewportRef.value?.scrollTo({ top: 0 })
  },
)

const settingsMenuItems: MenuItem[] = [
  {
    value: MenuType.General,
    icon: 'i-mingcute:settings-3-line',
    iconActivated: 'i-mingcute:settings-3-fill',
    titleKey: 'settings.menu_general',
  },
  {
    value: MenuType.BewlyPages,
    icon: 'i-mingcute:web-line',
    iconActivated: 'i-mingcute:web-fill',
    titleKey: 'settings.menu_bewly_pages',
  },
  {
    value: MenuType.BewlyComponents,
    icon: 'i-mingcute:tool-line',
    iconActivated: 'i-mingcute:tool-fill',
    titleKey: 'settings.menu_bewly_components',
  },
  {
    value: MenuType.Bilibili,
    icon: 'i-mingcute:sparkles-2-line',
    iconActivated: 'i-mingcute:sparkles-2-fill',
    titleKey: 'settings.menu_bilibili',
    sectionStart: true,
  },
  {
    value: MenuType.Appearance,
    titleKey: 'settings.menu_appearance',
    icon: 'i-mingcute:paint-brush-line',
    iconActivated: 'i-mingcute:paint-brush-fill',
  },
  {
    value: MenuType.About,
    icon: 'i-mingcute:information-line',
    iconActivated: 'i-mingcute:information-fill',
    titleKey: 'settings.menu_about',
    sectionStart: true,
  },
]
const activeSettingsComponentProps = computed(() => (
  activatedMenuItem.value === MenuType.BewlyPages
    ? { navigationTarget: props.navigationRequest }
    : {}
))

const title = computed(() => {
  const currentMenuItem = settingsMenuItems.find(item => item.value === activatedMenuItem.value)
  return currentMenuItem ? t(currentMenuItem.titleKey) : t('settings.title')
})

function getSearchEntryTitle(entry: SettingsSearchEntry) {
  return entry.titleKey ? t(entry.titleKey) : entry.title ?? ''
}

function getSearchEntryLocation(entry: SettingsSearchEntry) {
  const primaryTitle = getMenuTitle(entry.menu)
  return entry.secondaryTitleKey
    ? `${primaryTitle} / ${t(entry.secondaryTitleKey)}`
    : primaryTitle
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
    ? [`${entry.titleKey}_desc`, `${entry.titleKey}_opt`, `${entry.titleKey}_option`]
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

const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query)
    return []

  const queryParts = query.split(/\s+/).filter(Boolean)
  return settingsSearchEntries
    .filter((entry) => {
      const searchableText = getSearchEntryText(entry)
      return queryParts.every(part => searchableText.includes(part))
    })
    .slice(0, 12)
})

const activeSearchResultIndex = ref(-1)
const searchResultsRef = ref<HTMLElement>()

watch(searchQuery, (query) => {
  activeSearchResultIndex.value = -1
  if (query)
    nextTick(updateSearchPopoverBounds)
})

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
    searchResultsRef.value?.children[activeSearchResultIndex.value]?.scrollIntoView({ block: 'nearest' })
  })
}

function activateSearchResult(event: KeyboardEvent) {
  if (event.isComposing)
    return

  const entry = searchResults.value[activeSearchResultIndex.value] ?? searchResults.value[0]
  if (entry) {
    event.preventDefault()
    navigateToSearchResult(entry)
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

function highlightSearchTarget(target: HTMLElement) {
  clearSearchTargetHighlight()
  const visualTarget = target.matches('.b-settings-item-group')
    ? target.querySelector<HTMLElement>(':scope > .group-heading') ?? target
    : target

  highlightedSearchTarget = visualTarget
  visualTarget.dataset.settingsSearchHighlight = t('settings.search.located')
  visualTarget.classList.add('settings-search-target')
  searchTargetHighlightTimer = window.setTimeout(clearSearchTargetHighlight, 2400)
}

function expandSearchTarget(target: HTMLElement) {
  const collapsedControls: HTMLElement[] = []

  if (target.matches('[aria-expanded="false"]'))
    collapsedControls.push(target)

  let ancestor: HTMLElement | null = target
  while (ancestor && ancestor !== settingsWindow.value) {
    const control = ancestor.matches('.b-settings-item-group')
      ? ancestor.querySelector<HTMLElement>(':scope > .group-heading[aria-expanded="false"]')
      : ancestor.matches('section')
        ? ancestor.querySelector<HTMLElement>(':scope > .settings-section-heading[aria-expanded="false"]')
        : undefined

    if (control)
      collapsedControls.push(control)

    ancestor = ancestor.parentElement
  }

  Array.from(new Set(collapsedControls)).reverse().forEach(control => control.click())
}

function scrollToSearchTarget(expectedTitle: string | undefined, navigationId: number, attempts = 0) {
  if (!expectedTitle || navigationId !== searchNavigationId || attempts > 30)
    return

  const target = Array.from(settingsWindow.value?.querySelectorAll<HTMLElement>('[data-settings-title]') ?? [])
    .find(element =>
      element.dataset.settingsTitle === expectedTitle
      && !element.closest('.page-fade-leave-active'),
    )

  if (target) {
    expandSearchTarget(target)
    nextTick(() => {
      window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        highlightSearchTarget(target)
      })
    })
    return
  }

  settingNavigationTimer = window.setTimeout(
    () => scrollToSearchTarget(expectedTitle, navigationId, attempts + 1),
    100,
  )
}

function navigateToSearchResult(entry: SettingsSearchEntry) {
  if (settingNavigationTimer !== undefined) {
    clearTimeout(settingNavigationTimer)
    settingNavigationTimer = undefined
  }
  const navigationId = ++searchNavigationId
  entry.storageValues?.forEach(({ key, value }) => sessionStorage.setItem(key, value))

  activatedMenuItem.value = entry.menu
  if (entry.storageValues?.length)
    settingsContentKey.value++
  searchQuery.value = ''
  const targetTitle = entry.targetTitleKey
    ? t(entry.targetTitleKey)
    : entry.targetTitle ?? getSearchEntryTitle(entry)
  nextTick(() => scrollToSearchTarget(targetTitle, navigationId))
}

function scrollToSettingId(settingId: string, navigationId: number, attempts = 0) {
  if (navigationId !== searchNavigationId || attempts > 30)
    return
  const target = settingsWindow.value?.querySelector<HTMLElement>(`[data-setting-id="${CSS.escape(settingId)}"]`)
  if (!target) {
    settingNavigationTimer = window.setTimeout(
      () => scrollToSettingId(settingId, navigationId, attempts + 1),
      100,
    )
    return
  }
  expandSearchTarget(target)
  nextTick(() => window.requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    highlightSearchTarget(target)
  }))
}

function navigateToSettingDescriptor(descriptor: SettingDescriptor) {
  const menu = descriptor.category as MenuType
  if (!(menu in settingsMenu))
    return
  if (menu === MenuType.BewlyPages)
    sessionStorage.setItem(bewlyPagesStorageKey, descriptor.page)
  else if (menu === MenuType.BewlyComponents)
    sessionStorage.setItem(bewlyComponentsStorageKey, descriptor.page)

  if (settingNavigationTimer !== undefined) {
    clearTimeout(settingNavigationTimer)
    settingNavigationTimer = undefined
  }
  const navigationId = ++searchNavigationId
  activatedMenuItem.value = menu
  settingsContentKey.value++
  nextTick(() => scrollToSettingId(descriptor.id, navigationId))
}

const unsubscribeSettingNavigation = subscribeSettingNavigation(navigateToSettingDescriptor)

onBeforeUnmount(() => {
  deactivateSettingsModal()
  unsubscribeSettingNavigation()
  if (settingsContentFrame !== undefined)
    cancelAnimationFrame(settingsContentFrame)
  if (settingNavigationTimer !== undefined)
    clearTimeout(settingNavigationTimer)
  searchNavigationId++
  clearSearchTargetHighlight()
})

function handleClose() {
  emit('close')
}

function changeMenuItem(menuItem: MenuType) {
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
  >
    <div
      class="settings-backdrop fixed w-full h-full top-0 left-0"
      @click="handleClose"
    />
    <div
      id="settings-window"
      ref="settingsWindow"
      pos="fixed top-1/2 left-1/2" w="90%" h="90%"
      max-w-1000px max-h-900px transform="~ translate-x--1/2 translate-y--1/2 gpu"
      flex="~ justify-between items-center"
    >
      <aside
        class="settings-primary-navigation group"
        :data-expanded="isPrimaryNavigationExpanded"
        shrink-0 p="x-4"
        pos="absolute xl:left--84px left--44px" z-2
        @mouseenter="isPrimaryNavigationExpanded = true"
        @mouseleave="isPrimaryNavigationExpanded = false"
      >
        <ul
          class="settings-primary-navigation__list"
          style="
            box-shadow: var(--bew-shadow-4);
          "
          relative
          overflow-hidden antialiased
        >
          <!-- frosted glass background -->
          <!-- https://github.com/BewlyBewly/BewlyBewly/issues/1162 -->
          <div
            class="settings-primary-navigation__surface"
            pointer-events-none rounded-inherit
          />

          <li
            v-for="menuItem in settingsMenuItems"
            :key="menuItem.value"
            :class="{ 'menu-section-start': menuItem.sectionStart }"
          >
            <button
              type="button"
              class="settings-primary-navigation__item"
              cursor-pointer
              :class="{ 'menu-item-activated': menuItem.value === activatedMenuItem }"
              :aria-current="menuItem.value === activatedMenuItem ? 'page' : undefined"
              @click="changeMenuItem(menuItem.value)"
            >
              <div
                v-show="menuItem.value !== activatedMenuItem"
                text="xl center" w-40px h-20px flex="~ shrink-0" justify-center
                :class="menuItem.icon"
              />
              <div
                v-show="menuItem.value === activatedMenuItem"
                text="xl center" w-40px h-20px flex="~ shrink-0" justify-center
                :class="menuItem.iconActivated"
              />
              <div flex="~ items-center gap-2" shrink-0>
                <span>{{ $t(menuItem.titleKey) }}</span>
                <span
                  v-if="menuItem.badge"
                  text="xs"
                  bg="orange-500/20"
                  px-2 py-0.5
                  rounded-full
                  text-orange-500
                  fw-500
                >
                  {{ menuItem.badge }}
                </span>
              </div>
            </button>
          </li>
        </ul>
      </aside>

      <div
        class="settings-content bew-shape-smooth-rect"
        :style="{
          '--un-shadow': 'var(--bew-shadow-4), var(--bew-shadow-edge-glow-2)',
        }"
        relative flex-1 min-w-0 box-border
        h-full
        shadow rounded="$bew-modal-radius"
      >
        <div
          class="settings-content__surface"
          aria-hidden="true"
        />
        <header
          class="settings-header"
          flex justify-between items-center w-full h-92px
          pos="absolute top-0 left-0" p="x-11" box-border gap-4
          z-1
          style="
            text-shadow: 0 0 10px var(--bew-elevated-solid), 0 0 15px var(--bew-elevated-solid)
          "
        >
          <PanelTopBlur :enabled="!settings.disableFrostedGlass" />
          <nav class="settings-breadcrumb" :aria-label="$t('settings.breadcrumb')">
            <span>{{ $t('settings.title') }}</span>
            <i i-mingcute:right-line />
            <strong>{{ title }}</strong>
            <template v-if="breadcrumbDetail">
              <i i-mingcute:right-line />
              <strong>{{ breadcrumbDetail }}</strong>
            </template>
          </nav>
          <div
            ref="settingsSearchRef"
            class="settings-search"
            :class="{ 'has-query': Boolean(searchQuery) }"
            :style="{
              backgroundColor: settings.disableFrostedGlass ? 'var(--bew-content-solid)' : 'var(--bew-content)',
            }"
            @click="focusSettingsSearch"
          >
            <i i-mingcute:search-2-line />
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
          <CloseButton
            class="settings-header__close"
            :label="$t('common.close')"
            size="medium"
            @click="handleClose"
          />
        </header>
        <div
          ref="scrollViewportRef"
          class="settings-content__scroll"
          :style="{
            maskImage: settings.disableFrostedGlass ? 'none' : 'linear-gradient(to bottom, transparent 0%, black 92px 30%)',
            WebkitMaskImage: settings.disableFrostedGlass ? 'none' : 'linear-gradient(to bottom, transparent 0%, black 92px 30%)',
            scrollbarGutter: 'stable',
            overflowAnchor: 'none',
            overscrollBehavior: 'contain',
          }"
          h-inherit of-y-auto of-x-hidden
          style="padding-top: 92px;"
        >
          <main w-full min-h="[calc(100%-92px)]" p="x-12 b-10">
            <!-- <div h-80px mt--8 /> -->

            <Transition name="page-fade">
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
@use "../../styles/breakpoints";

.menu-item-activated {
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
}

.settings-primary-navigation__list {
  --settings-primary-nav-inset: var(--bew-space-2);
  --settings-primary-nav-item-size: 40px;
  --settings-primary-nav-expanded-item-width: 190px;
  --settings-primary-nav-collapsed-width: calc(
    var(--settings-primary-nav-item-size) + var(--settings-primary-nav-inset) + var(--settings-primary-nav-inset)
  );
  --settings-primary-nav-collapsed-radius: calc(var(--settings-primary-nav-collapsed-width) / 2);

  display: flex;
  isolation: isolate;
  box-sizing: border-box;
  width: var(--settings-primary-nav-collapsed-width);
  padding: var(--settings-primary-nav-inset);
  flex-direction: column;
  align-items: stretch;
  gap: var(--bew-space-2);
  border-radius: var(--settings-primary-nav-collapsed-radius);
  corner-shape: round;
  transition:
    width var(--bew-duration-moderate) var(--bew-ease-standard),
    border-radius var(--bew-duration-moderate) var(--bew-ease-standard),
    background-color var(--bew-duration-moderate) var(--bew-ease-standard),
    transform var(--bew-duration-moderate) var(--bew-ease-standard);

  > li {
    width: 100%;
    flex: 0 0 auto;
  }
}

.settings-primary-navigation__surface,
.settings-content__surface {
  background: var(--bew-elevated-alt);
  backdrop-filter: var(--bew-filter-glass-1);
  -webkit-backdrop-filter: var(--bew-filter-glass-1);
}

.settings-primary-navigation__surface {
  position: absolute;
  z-index: 0;
  inset: 0;
  box-sizing: border-box;
  border: 1px solid var(--bew-surface-border-color);
  border-radius: inherit;
  corner-shape: inherit;
  box-shadow: none;
  transition: box-shadow var(--bew-duration-moderate) var(--bew-ease-standard);
}

.settings-primary-navigation__item {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  height: var(--settings-primary-nav-item-size);
  align-items: center;
  overflow-x: hidden;
  border-radius: calc(var(--settings-primary-nav-item-size) / 2);
  corner-shape: round;
  transition:
    border-radius var(--bew-duration-moderate) var(--bew-ease-standard),
    color var(--bew-duration-moderate) var(--bew-ease-standard),
    background-color var(--bew-duration-moderate) var(--bew-ease-standard);

  &:hover:not(.menu-item-activated) {
    background: var(--bew-fill-2);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-focus-ring);
    outline-offset: -2px;
  }
}

.settings-primary-navigation[data-expanded="true"] {
  .settings-primary-navigation__list {
    width: calc(
      var(--settings-primary-nav-expanded-item-width) + var(--settings-primary-nav-inset) +
        var(--settings-primary-nav-inset)
    );
    border-radius: var(--bew-modal-radius);
    corner-shape: var(--bew-corner-shape);
    transform: scale(1.05);
  }

  .settings-primary-navigation__item {
    border-radius: var(--bew-panel-radius);
    corner-shape: var(--bew-corner-shape);
  }

  .settings-primary-navigation__surface {
    box-shadow: var(--bew-shadow-edge-glow-2);
  }
}

.settings-content {
  isolation: isolate;

  &::after {
    position: absolute;
    z-index: 3;
    inset: 0;
    box-sizing: border-box;
    border: 1px solid var(--bew-surface-border-color);
    border-radius: inherit;
    corner-shape: inherit;
    content: "";
    pointer-events: none;
  }
}

.settings-content__surface {
  position: absolute;
  z-index: 0;
  inset: 0;
  box-sizing: border-box;
  border-radius: inherit;
  corner-shape: inherit;
  pointer-events: none;
}

.settings-header {
  z-index: 2;
  border-top-left-radius: inherit;
  border-top-right-radius: inherit;
  corner-shape: inherit;
}

.settings-breadcrumb,
.settings-search,
.settings-header__close {
  position: relative;
  z-index: 1;
}

.settings-content__scroll {
  position: relative;
  z-index: 1;
  border-radius: inherit;
  corner-shape: inherit;
}

.settings-breadcrumb {
  display: flex;
  overflow: hidden;
  gap: var(--bew-space-2);
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);

  i {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
  }

  strong {
    min-width: 0;
    flex: 0 1 auto;
    overflow: hidden;
    color: var(--bew-text-1);
    font-size: var(--bew-font-size-heading);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-heading);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong:last-child {
    flex: 1 1 auto;
  }
}

.settings-search {
  position: relative;
  display: flex;
  box-sizing: border-box;
  align-items: center;
  flex: 0 1 auto;
  width: min(320px, 38%);
  min-width: 42px;
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  color: var(--bew-text-1);
  background: var(--bew-content);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: calc(var(--bew-control-height) / 2);
  corner-shape: var(--bew-corner-shape-round);
  box-shadow: var(--bew-shadow-edge-glow-1);
  transition:
    width var(--bew-duration-moderate) var(--bew-ease-standard),
    border-radius var(--bew-duration-moderate) var(--bew-ease-standard),
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    box-shadow var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);

  &:hover {
    border-color: var(--bew-theme-focus-ring);
  }

  &:focus-within {
    border-color: var(--bew-theme-focus-ring);
    border-radius: var(--bew-panel-radius);
    corner-shape: var(--bew-corner-shape);
    box-shadow:
      var(--bew-shadow-edge-glow-1),
      0 0 0 2px var(--bew-theme-focus-ring);
  }

  > i {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    color: var(--bew-text-2);
    pointer-events: none;
  }

  input {
    width: 100%;
    min-width: 0;
    margin-left: var(--bew-space-2);
    color: var(--bew-text-1);
    background: transparent;
    border: 0;
    outline: 0;
    font-size: var(--bew-font-size-body);
    font-weight: var(--bew-font-weight-regular);
    line-height: var(--bew-line-height-body);

    &:focus-visible {
      outline: 0;
    }
  }
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
    overflow: hidden;
    color: var(--bew-text-1);
    font-size: var(--bew-font-size-body);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-body);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span,
  p {
    color: var(--bew-text-2);
    font-size: var(--bew-font-size-control);
    line-height: var(--bew-line-height-control);
  }

  span {
    flex: 0 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    padding: 12px;
    text-align: center;
  }
}

.settings-search-results {
  transform-origin: top right;
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
  border-radius: var(--bew-panel-radius);
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
  background: var(--bew-theme-color);
  border-radius: var(--bew-panel-radius);
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
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
  box-shadow: var(--bew-shadow-2);
  content: attr(data-settings-search-highlight);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
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

@media (max-width: breakpoints.$compact-max) {
  #settings-window {
    /* 侧栏进入布局后先维持 1000px 内容宽度，空间不足时再连续收缩。 */
    width: min(calc(1000px + 72px), calc(100% - var(--bew-space-6)));
    max-width: none;
    margin-left: calc(-1 * var(--bew-space-1));
  }

  .settings-primary-navigation {
    /* xl 以下外侧空间不足：让折叠导航占据布局宽度，展开时仍可覆盖 content。 */
    position: relative;
    left: auto !important;
    width: 72px;
    box-sizing: border-box;
    padding-inline: var(--bew-space-2);
  }
}

@media (max-width: 760px) {
  .settings-header {
    gap: var(--bew-space-2);
    padding-inline: var(--bew-space-4);
  }

  .settings-primary-navigation {
    /* 触屏窄屏不依赖 hover，保持常驻图标列。 */
    li {
      width: 100%;
    }

    button {
      justify-content: center;
    }

    button > div:last-child {
      display: none;
    }

    button > div:first-child,
    button > div:nth-child(2) {
      width: 40px;
      flex: 0 0 40px;
    }

    &[data-expanded="true"] {
      .settings-primary-navigation__list {
        width: var(--settings-primary-nav-collapsed-width);
        border-radius: var(--settings-primary-nav-collapsed-radius);
        corner-shape: round;
        transform: none;
      }

      .settings-primary-navigation__item {
        border-radius: calc(var(--settings-primary-nav-item-size) / 2);
        corner-shape: round;
      }
    }
  }

  .settings-search {
    width: 42px;
    flex: 0 0 42px;
    cursor: pointer;

    input {
      width: 0;
      margin-left: 0;
      opacity: 0;
      pointer-events: none;
      transition:
        width var(--bew-duration-moderate) var(--bew-ease-standard),
        margin-left var(--bew-duration-moderate) var(--bew-ease-standard),
        opacity var(--bew-duration-normal) var(--bew-ease-standard);
    }

    &:focus-within,
    &.has-query {
      position: absolute;
      right: calc(var(--bew-space-4) + 32px + var(--bew-space-2));
      left: var(--bew-space-4);
      z-index: 3;
      width: auto;

      input {
        width: 100%;
        margin-left: var(--bew-space-2);
        opacity: 1;
        pointer-events: auto;
      }
    }
  }
}

.menu-section-start {
  position: relative;
  padding-top: calc(var(--bew-space-2) + 1px);

  &::before {
    position: absolute;
    top: 0;
    right: 8px;
    left: 8px;
    height: 1px;
    background: var(--bew-border-color);
    content: "";
  }
}

.settings-launch-enter-active #settings-window {
  animation: settings-launch-in 380ms cubic-bezier(0.16, 1, 0.3, 1) both;
  transform-origin: var(--bew-settings-origin-x) var(--bew-settings-origin-y);
  will-change: opacity, transform;
}

.settings-launch-leave-active #settings-window {
  animation: settings-launch-out 200ms cubic-bezier(0.4, 0, 1, 1) both;
  transform-origin: var(--bew-settings-origin-x) var(--bew-settings-origin-y);
  will-change: opacity, transform;
}

.settings-launch-enter-active .settings-backdrop {
  transition: opacity 240ms var(--bew-ease-standard);
}

.settings-launch-leave-active .settings-backdrop {
  transition: opacity 180ms var(--bew-ease-standard);
}

.settings-launch-enter-from .settings-backdrop,
.settings-launch-leave-to .settings-backdrop {
  opacity: 0;
}

@keyframes settings-launch-in {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) translate3d(var(--bew-settings-enter-x), var(--bew-settings-enter-y), 0)
      scale(0.94);
  }

  72% {
    opacity: 1;
    transform: translate(-50%, -50%) translate3d(0, 0, 0) scale(1.006);
  }

  100% {
    opacity: 1;
    transform: translate(-50%, -50%) translate3d(0, 0, 0) scale(1);
  }
}

@keyframes settings-launch-out {
  from {
    opacity: 1;
    transform: translate(-50%, -50%) translate3d(0, 0, 0) scale(1);
  }

  to {
    opacity: 0;
    transform: translate(-50%, -50%) translate3d(var(--bew-settings-leave-x), var(--bew-settings-leave-y), 0)
      scale(0.98);
  }
}
</style>
