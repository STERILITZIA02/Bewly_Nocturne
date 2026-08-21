import type { Directive, Ref } from 'vue'
import { computed, onScopeDispose, readonly, ref, shallowRef, watch } from 'vue'

import { AppPage } from '~/enums/appEnums'
import { gridLayout, settings } from '~/logic/storage'

import { createLayoutPreviewController } from './layoutEditPreview'

export type LayoutEditSection = 'dock' | 'topBar' | 'sidebar' | 'page'
export type LayoutEditCategory = 'navigation' | 'page-layout'
export type LayoutEditScope = 'current-page' | 'all-pages'

export interface SettingDescriptor<T = unknown> {
  id: string
  category: string
  page: string
  group: string
  titleKey: string
  descriptionKey?: string
  get: () => T
  set: (value: T) => void
}

export interface LayoutEditSelectOption {
  labelKey: string
  value: unknown
}

export interface LayoutEditSelectControl {
  type: 'select'
  options: readonly LayoutEditSelectOption[]
}

export interface LayoutEditableDescriptor {
  id: string
  section: LayoutEditSection
  category: LayoutEditCategory
  settingId: string
  titleKey: string
  scope?: LayoutEditScope
  previewControl?: LayoutEditSelectControl
}

export interface EditableTarget {
  descriptor: LayoutEditableDescriptor
  element: HTMLElement
  id: string
  section: LayoutEditSection
  settingId: string
}

const settingDescriptorMap = new Map<string, SettingDescriptor>()
const editableDescriptorMap = new Map<string, LayoutEditableDescriptor>()
const editableElements = new Map<string, Set<HTMLElement>>()
const editableElementGenerations = new Map<string, number>()
const navigationListeners = new Set<(descriptor: SettingDescriptor) => void>()

const activeSectionState = ref<LayoutEditSection | null>(null)
const activeTargetIdState = ref<string | null>(null)
const isLayoutEditingState = ref(false)
const activePreviewSettingIdState = ref<string | null>(null)
const activePreviewValueState = shallowRef<unknown>()
const editableRegistryVersionState = ref(0)
let pendingSettingNavigation: SettingDescriptor | undefined

const previewController = createLayoutPreviewController((settingId) => {
  const descriptor = settingDescriptorMap.get(settingId)
  return descriptor
    ? {
        get: descriptor.get,
        set: descriptor.set,
      }
    : undefined
})

export const activeLayoutEditSection = readonly(activeSectionState)
export const activeLayoutEditTargetId = readonly(activeTargetIdState)
export const activeLayoutEditPreviewSettingId = readonly(activePreviewSettingIdState)
export const activeLayoutEditPreviewValue = readonly(activePreviewValueState)
export const layoutEditableRegistryVersion = readonly(editableRegistryVersionState)
export const isLayoutEditing = readonly(isLayoutEditingState)

function syncPreviewState() {
  const snapshot = previewController.getSnapshot()
  activePreviewSettingIdState.value = snapshot?.settingId ?? null
  activePreviewValueState.value = snapshot?.after
}

export function registerSettingDescriptors(descriptors: SettingDescriptor[]) {
  descriptors.forEach(descriptor => settingDescriptorMap.set(descriptor.id, descriptor))
}

export function registerLayoutEditableDescriptors(descriptors: LayoutEditableDescriptor[]) {
  descriptors.forEach(descriptor => editableDescriptorMap.set(descriptor.id, descriptor))
}

export function getSettingDescriptor(id: string) {
  return settingDescriptorMap.get(id)
}

export function getLayoutEditableDescriptor(id: string) {
  return editableDescriptorMap.get(id)
}

export function getLayoutEditableDescriptors(): readonly LayoutEditableDescriptor[] {
  return Array.from(editableDescriptorMap.values())
}

export function openSettingById(id: string): boolean {
  const descriptor = settingDescriptorMap.get(id)
  if (!descriptor)
    return false

  if (navigationListeners.size === 0)
    pendingSettingNavigation = descriptor
  else
    navigationListeners.forEach(listener => listener(descriptor))
  return true
}

export function subscribeSettingNavigation(listener: (descriptor: SettingDescriptor) => void) {
  navigationListeners.add(listener)
  if (pendingSettingNavigation) {
    const descriptor = pendingSettingNavigation
    pendingSettingNavigation = undefined
    queueMicrotask(() => {
      if (navigationListeners.has(listener))
        listener(descriptor)
    })
  }
  return () => navigationListeners.delete(listener)
}

function scheduleMissingTargetExit(id: string) {
  const generation = (editableElementGenerations.get(id) ?? 0) + 1
  editableElementGenerations.set(id, generation)
  queueMicrotask(() => {
    if (editableElementGenerations.get(id) !== generation || editableElements.get(id)?.size)
      return
    if (activeTargetIdState.value === id)
      exitLayoutEditMode()
  })
}

export function registerLayoutEditableElement(id: string, element: HTMLElement) {
  if (!editableDescriptorMap.has(id))
    return () => {}

  const generation = (editableElementGenerations.get(id) ?? 0) + 1
  editableElementGenerations.set(id, generation)
  const elements = editableElements.get(id) ?? new Set<HTMLElement>()
  elements.add(element)
  editableElements.set(id, elements)
  element.dataset.layoutEditableId = id
  editableRegistryVersionState.value++

  return () => {
    elements.delete(element)
    if (element.dataset.layoutEditableId === id)
      delete element.dataset.layoutEditableId
    if (elements.size === 0) {
      editableElements.delete(id)
      scheduleMissingTargetExit(id)
    }
    editableRegistryVersionState.value++
  }
}

export function registerEditableTarget(target: Omit<EditableTarget, 'descriptor'>) {
  return registerLayoutEditableElement(target.id, target.element)
}

const rootEditableIds: Record<Exclude<LayoutEditSection, 'page'>, string> = {
  dock: 'dock',
  topBar: 'topbar',
  sidebar: 'sidebar',
}

export function useLayoutEditableRoot(
  section: Exclude<LayoutEditSection, 'page'>,
  element: Ref<HTMLElement | null | undefined>,
) {
  let unregister: (() => void) | undefined
  watch(element, (value) => {
    unregister?.()
    unregister = value
      ? registerLayoutEditableElement(rootEditableIds[section], value)
      : undefined
  }, { immediate: true, flush: 'post' })
  onScopeDispose(() => unregister?.())
}

export function getRegisteredLayoutEditableElement(id: string): HTMLElement | undefined {
  const elements = editableElements.get(id)
  if (!elements)
    return undefined
  return Array.from(elements).find(element => element.isConnected)
}

export function getEditableTargets(section: LayoutEditSection): ReadonlySet<EditableTarget> {
  const targets = new Set<EditableTarget>()
  editableElements.forEach((elements, id) => {
    const descriptor = editableDescriptorMap.get(id)
    if (!descriptor || descriptor.section !== section)
      return
    elements.forEach((element) => {
      if (element.isConnected) {
        targets.add({
          descriptor,
          element,
          id,
          section,
          settingId: descriptor.settingId,
        })
      }
    })
  })
  return targets
}

interface LayoutEditableDirectiveState {
  id: string
  unregister: () => void
}

const layoutEditableDirectiveState = new WeakMap<HTMLElement, LayoutEditableDirectiveState>()

function bindLayoutEditableDirective(element: HTMLElement, id: unknown) {
  const nextId = typeof id === 'string' ? id : ''
  const current = layoutEditableDirectiveState.get(element)
  if (current?.id === nextId)
    return
  current?.unregister()
  layoutEditableDirectiveState.delete(element)
  if (!nextId)
    return
  layoutEditableDirectiveState.set(element, {
    id: nextId,
    unregister: registerLayoutEditableElement(nextId, element),
  })
}

export const vLayoutEditable: Directive<HTMLElement, string> = {
  mounted: (element, binding) => bindLayoutEditableDirective(element, binding.value),
  updated: (element, binding) => bindLayoutEditableDirective(element, binding.value),
  unmounted: (element) => {
    layoutEditableDirectiveState.get(element)?.unregister()
    layoutEditableDirectiveState.delete(element)
  },
}

export function beginLayoutEditSettingPreview(settingId: string): boolean {
  const started = previewController.begin(settingId)
  syncPreviewState()
  return started
}

export function updateLayoutEditSettingPreview(value: unknown): boolean {
  const updated = previewController.update(value)
  syncPreviewState()
  return updated
}

export function commitLayoutEditSettingPreview(): boolean {
  const committed = previewController.commit()
  syncPreviewState()
  return committed
}

export function cancelLayoutEditSettingPreview(): boolean {
  const cancelled = previewController.cancel()
  syncPreviewState()
  return cancelled
}

export function useLayoutEditSettingValue<T>(settingId: string, persistedValue: () => T) {
  return computed<T>(() => {
    if (activePreviewSettingIdState.value === settingId)
      return activePreviewValueState.value as T
    return persistedValue()
  })
}

export function setActiveLayoutEditTarget(id: string | null): boolean {
  if (id === activeTargetIdState.value)
    return true
  cancelLayoutEditSettingPreview()
  if (id === null) {
    activeTargetIdState.value = null
    return true
  }

  const descriptor = editableDescriptorMap.get(id)
  if (!descriptor || !getRegisteredLayoutEditableElement(id))
    return false
  activeTargetIdState.value = id
  activeSectionState.value = descriptor.section
  return true
}

export function enterLayoutEditMode(section: LayoutEditSection, targetId?: string) {
  isLayoutEditingState.value = true
  activeSectionState.value = section
  if (targetId)
    setActiveLayoutEditTarget(targetId)
}

export function completeLayoutEditMode() {
  commitLayoutEditSettingPreview()
  isLayoutEditingState.value = false
  activeSectionState.value = null
  activeTargetIdState.value = null
}

export function exitLayoutEditMode() {
  cancelLayoutEditSettingPreview()
  isLayoutEditingState.value = false
  activeSectionState.value = null
  activeTargetIdState.value = null
}

export function useLayoutEditState() {
  return {
    activeSection: activeLayoutEditSection,
    activeTargetId: activeLayoutEditTargetId,
    activePreviewSettingId: activeLayoutEditPreviewSettingId,
    activePreviewValue: activeLayoutEditPreviewValue,
    isLayoutEditing,
    enterLayoutEditMode,
    completeLayoutEditMode,
    exitLayoutEditMode,
    setActiveLayoutEditTarget,
  }
}

const dockItemDescriptors = [
  ['dock-item-home', AppPage.Home, 'dock.home'],
  ['dock-item-search', AppPage.Search, 'dock.search'],
  ['dock-item-anime', AppPage.Anime, 'dock.anime'],
  ['dock-item-favorites', AppPage.Favorites, 'dock.favorites'],
  ['dock-item-history', AppPage.History, 'dock.history'],
  ['dock-item-watch-later', AppPage.WatchLater, 'dock.watch_later'],
  ['dock-item-moments', AppPage.Moments, 'dock.moments'],
  ['dock-item-notifications', AppPage.Notifications, 'dock.notifications'],
] as const

const dockItemEditableIdByPage = new Map<AppPage, string>(
  dockItemDescriptors.map(([id, page]) => [page, id]),
)

const topBarItemDescriptors = [
  ['topbar-item-moments', 'moments', 'topbar.moments'],
  ['topbar-item-favorites', 'favorites', 'topbar.favorites'],
  ['topbar-item-history', 'history', 'topbar.history'],
  ['topbar-item-watch-later', 'watchLater', 'topbar.watch_later'],
  ['topbar-item-creator-center', 'creatorCenter', 'topbar.creative_center'],
  ['topbar-item-upload', 'upload', 'topbar.upload'],
  ['topbar-item-notifications', 'notifications', 'topbar.notifications'],
] as const

const topBarItemEditableIdByKey = new Map<string, string>(
  topBarItemDescriptors.map(([id, key]) => [key, id]),
)

export function getDockItemLayoutEditableId(page: AppPage): string {
  return dockItemEditableIdByPage.get(page)!
}

export function getTopBarItemLayoutEditableId(key: string): string {
  return topBarItemEditableIdByKey.get(key)!
}

registerSettingDescriptors([
  { id: 'navigation.pageMode', category: 'BewlyComponents', page: 'dock', group: 'page-mode', titleKey: 'settings.page_mode', get: () => settings.value.pageMode, set: value => settings.value.pageMode = value as typeof settings.value.pageMode },
  { id: 'navigation.dock.collapseMode', category: 'BewlyComponents', page: 'dock', group: 'dock', titleKey: 'settings.dock_collapse_mode', get: () => settings.value.dockCollapseMode, set: value => settings.value.dockCollapseMode = value as typeof settings.value.dockCollapseMode },
  { id: 'navigation.dock.position', category: 'BewlyComponents', page: 'dock', group: 'dock', titleKey: 'settings.dock_position', get: () => settings.value.dockPosition, set: value => settings.value.dockPosition = value as typeof settings.value.dockPosition },
  { id: 'navigation.dock.items', category: 'BewlyComponents', page: 'dock', group: 'dock', titleKey: 'settings.dock_content_adjustment', get: () => settings.value.dockItemsConfig, set: value => settings.value.dockItemsConfig = value as typeof settings.value.dockItemsConfig },
  { id: 'navigation.dock.themeSwitcher', category: 'BewlyComponents', page: 'dock', group: 'dock', titleKey: 'settings.disable_light_dark_mode_switcher', get: () => settings.value.disableLightDarkModeSwitcherOnDock, set: value => settings.value.disableLightDarkModeSwitcherOnDock = Boolean(value) },
  { id: 'navigation.dock.actionButtons', category: 'BewlyComponents', page: 'dock', group: 'dock', titleKey: 'settings.back_to_top_and_refresh_buttons_are_separated', get: () => settings.value.backToTopAndRefreshButtonsAreSeparated, set: value => settings.value.backToTopAndRefreshButtonsAreSeparated = Boolean(value) },
  { id: 'navigation.dock.undoRefresh', category: 'BewlyComponents', page: 'dock', group: 'dock', titleKey: 'settings.enable_undo_refresh_button', get: () => settings.value.enableUndoRefreshButton, set: value => settings.value.enableUndoRefreshButton = Boolean(value) },
  { id: 'navigation.dock.showLayoutEditButton', category: 'BewlyComponents', page: 'dock', group: 'dock', titleKey: 'settings.show_layout_edit_button', get: () => settings.value.showLayoutEditButton, set: value => settings.value.showLayoutEditButton = Boolean(value) },
  { id: 'navigation.sidebar.position', category: 'BewlyComponents', page: 'dock', group: 'sidebar', titleKey: 'settings.sidebar_position', get: () => settings.value.sidebarPosition, set: value => settings.value.sidebarPosition = value as typeof settings.value.sidebarPosition },
  { id: 'navigation.sidebar.autoHide', category: 'BewlyComponents', page: 'dock', group: 'sidebar', titleKey: 'settings.auto_hide_sidebar', get: () => settings.value.autoHideSidebar, set: value => settings.value.autoHideSidebar = Boolean(value) },
  { id: 'navigation.topBar.mode', category: 'BewlyComponents', page: 'dock', group: 'top-bar', titleKey: 'settings.topbar_mode', get: () => settings.value.useOriginalBilibiliTopBar, set: value => settings.value.useOriginalBilibiliTopBar = Boolean(value) },
  { id: 'navigation.topBar.autoHide', category: 'BewlyComponents', page: 'topbar', group: 'top-bar', titleKey: 'settings.auto_hide_top_bar', get: () => settings.value.autoHideTopBar, set: value => settings.value.autoHideTopBar = Boolean(value) },
  { id: 'navigation.topBar.logo', category: 'BewlyComponents', page: 'topbar', group: 'logo', titleKey: 'settings.top_bar_logo_style', get: () => settings.value.topBarLogoStyle, set: value => settings.value.topBarLogoStyle = value as typeof settings.value.topBarLogoStyle },
  { id: 'navigation.topBar.pinnedChannels', category: 'BewlyComponents', page: 'topbar', group: 'channels', titleKey: 'settings.topbar_pinned_channels_title', get: () => settings.value.topBarPinnedChannels, set: value => settings.value.topBarPinnedChannels = value as typeof settings.value.topBarPinnedChannels },
  { id: 'navigation.topBar.components', category: 'BewlyComponents', page: 'topbar', group: 'actions', titleKey: 'settings.topbar_actions', get: () => settings.value.topBarComponentsConfig, set: value => settings.value.topBarComponentsConfig = value as typeof settings.value.topBarComponentsConfig },
  { id: 'appearance.theme', category: 'Appearance', page: 'appearance', group: 'theme', titleKey: 'settings.theme', get: () => settings.value.theme, set: value => settings.value.theme = value as typeof settings.value.theme },
  { id: 'page.home.gridLayout', category: 'BewlyPages', page: 'home', group: 'layout', titleKey: 'settings.home_grid_layout', get: () => gridLayout.value.home, set: value => gridLayout.value.home = value as typeof gridLayout.value.home },
  { id: 'page.home.tabs', category: 'BewlyPages', page: 'home', group: 'layout', titleKey: 'settings.home_tabs_adjustment', get: () => settings.value.homePageTabVisibilityList, set: value => settings.value.homePageTabVisibilityList = value as typeof settings.value.homePageTabVisibilityList },
  { id: 'page.moments.gridColumns', category: 'BewlyPages', page: 'moments', group: 'layout', titleKey: 'settings.moments_grid_columns', get: () => settings.value.momentsGridColumns, set: value => settings.value.momentsGridColumns = value as typeof settings.value.momentsGridColumns },
  {
    id: 'page.moments.sidebar',
    category: 'BewlyPages',
    page: 'moments',
    group: 'layout',
    titleKey: 'settings.moments_visible_components',
    get: () => ({
      userCard: settings.value.momentsSidebarShowUserCard,
      publish: settings.value.momentsSidebarShowPublish,
      live: settings.value.momentsSidebarShowLive,
      upList: settings.value.momentsShowUpList,
    }),
    set: (value) => {
      const next = value as { userCard: boolean, publish: boolean, live: boolean, upList: boolean }
      settings.value.momentsSidebarShowUserCard = Boolean(next.userCard)
      settings.value.momentsSidebarShowPublish = Boolean(next.publish)
      settings.value.momentsSidebarShowLive = Boolean(next.live)
      settings.value.momentsShowUpList = Boolean(next.upList)
    },
  },
  { id: 'page.watchLater.layout', category: 'BewlyPages', page: 'watch-later', group: 'layout', titleKey: 'settings.watch_later_layout_mode', get: () => settings.value.watchLaterLayoutMode, set: value => settings.value.watchLaterLayoutMode = value as typeof settings.value.watchLaterLayoutMode },
  { id: 'search.focus.disable', category: 'BewlyPages', page: 'search', group: 'focus', titleKey: 'settings.disable_search_focus_effect', get: () => settings.value.disableSearchFocusEffect, set: value => settings.value.disableSearchFocusEffect = Boolean(value) },
  { id: 'messages.autoMarkRead', category: 'BewlyPages', page: 'messages', group: 'reading', titleKey: 'settings.messages_auto_mark_read', get: () => settings.value.autoMarkPrivateMessagesRead, set: value => settings.value.autoMarkPrivateMessagesRead = Boolean(value) },
  { id: 'messages.followNew', category: 'BewlyPages', page: 'messages', group: 'reading', titleKey: 'settings.messages_follow_new', get: () => settings.value.followNewPrivateMessages, set: value => settings.value.followNewPrivateMessages = Boolean(value) },
  { id: 'messages.autoLoadImages', category: 'BewlyPages', page: 'messages', group: 'reading', titleKey: 'settings.messages_auto_load_images', get: () => settings.value.autoLoadPrivateMessageImages, set: value => settings.value.autoLoadPrivateMessageImages = Boolean(value) },
  { id: 'messages.showOfficialAssistants', category: 'BewlyPages', page: 'messages', group: 'sessions', titleKey: 'settings.messages_show_official_assistants', get: () => settings.value.showOfficialPrivateAssistants, set: value => settings.value.showOfficialPrivateAssistants = Boolean(value) },
  { id: 'messages.density', category: 'BewlyPages', page: 'messages', group: 'sessions', titleKey: 'settings.messages_density', get: () => settings.value.privateMessageDensity, set: value => settings.value.privateMessageDensity = value as typeof settings.value.privateMessageDensity },
  { id: 'messages.maxCachedConversations', category: 'BewlyPages', page: 'messages', group: 'memory', titleKey: 'settings.messages_max_cached_conversations', get: () => settings.value.maxCachedPrivateConversations, set: value => settings.value.maxCachedPrivateConversations = value as typeof settings.value.maxCachedPrivateConversations },
  { id: 'messages.maxMessagesPerConversation', category: 'BewlyPages', page: 'messages', group: 'memory', titleKey: 'settings.messages_max_messages_per_conversation', get: () => settings.value.maxPrivateMessagesPerConversation, set: value => settings.value.maxPrivateMessagesPerConversation = value as typeof settings.value.maxPrivateMessagesPerConversation },
  { id: 'messages.mobileOpenMode', category: 'BewlyPages', page: 'messages', group: 'mobile', titleKey: 'settings.messages_mobile_open_mode', get: () => settings.value.privateMessageMobileOpenMode, set: value => settings.value.privateMessageMobileOpenMode = value as typeof settings.value.privateMessageMobileOpenMode },
])

registerLayoutEditableDescriptors([
  {
    id: 'dock',
    section: 'dock',
    category: 'navigation',
    settingId: 'navigation.dock.position',
    titleKey: 'layout_editor.target_dock',
    scope: 'all-pages',
    previewControl: {
      type: 'select',
      options: [
        { labelKey: 'common.position.left', value: 'left' },
        { labelKey: 'common.position.right', value: 'right' },
        { labelKey: 'common.position.bottom', value: 'bottom' },
      ],
    },
  },
  { id: 'dock-page-mode-switcher', section: 'dock', category: 'navigation', settingId: 'navigation.pageMode', titleKey: 'layout_editor.target_page_mode_switcher', scope: 'all-pages' },
  { id: 'dock-theme-toggle', section: 'dock', category: 'navigation', settingId: 'navigation.dock.themeSwitcher', titleKey: 'settings.disable_light_dark_mode_switcher', scope: 'all-pages' },
  { id: 'dock-collapse-toggle', section: 'dock', category: 'navigation', settingId: 'navigation.dock.collapseMode', titleKey: 'settings.dock_collapse_mode', scope: 'all-pages' },
  { id: 'dock-refresh-action', section: 'dock', category: 'navigation', settingId: 'navigation.dock.actionButtons', titleKey: 'common.operation.refresh', scope: 'all-pages' },
  { id: 'dock-back-to-top-action', section: 'dock', category: 'navigation', settingId: 'navigation.dock.actionButtons', titleKey: 'common.operation.back_to_top', scope: 'all-pages' },
  { id: 'dock-refresh-back-to-top-action', section: 'dock', category: 'navigation', settingId: 'navigation.dock.actionButtons', titleKey: 'settings.back_to_top_and_refresh_buttons_are_separated', scope: 'all-pages' },
  { id: 'dock-undo-refresh-action', section: 'dock', category: 'navigation', settingId: 'navigation.dock.undoRefresh', titleKey: 'common.operation.undo_refresh', scope: 'all-pages' },
  { id: 'dock-forward-refresh-action', section: 'dock', category: 'navigation', settingId: 'navigation.dock.undoRefresh', titleKey: 'common.operation.forward_refresh', scope: 'all-pages' },
  { id: 'sidebar-page-mode-switcher', section: 'sidebar', category: 'navigation', settingId: 'navigation.pageMode', titleKey: 'layout_editor.target_page_mode_switcher', scope: 'all-pages' },
  { id: 'sidebar-theme-toggle', section: 'sidebar', category: 'navigation', settingId: 'appearance.theme', titleKey: 'settings.theme', scope: 'all-pages' },
  { id: 'sidebar-auto-hide', section: 'sidebar', category: 'navigation', settingId: 'navigation.sidebar.autoHide', titleKey: 'settings.auto_hide_sidebar', scope: 'all-pages' },
  { id: 'topbar', section: 'topBar', category: 'navigation', settingId: 'navigation.topBar.autoHide', titleKey: 'layout_editor.target_topbar', scope: 'all-pages' },
  { id: 'topbar-logo', section: 'topBar', category: 'navigation', settingId: 'navigation.topBar.logo', titleKey: 'layout_editor.target_topbar_logo', scope: 'all-pages' },
  { id: 'topbar-search', section: 'topBar', category: 'navigation', settingId: 'search.focus.disable', titleKey: 'layout_editor.target_search_bar', scope: 'all-pages' },
  { id: 'topbar-pinned-channels', section: 'topBar', category: 'navigation', settingId: 'navigation.topBar.pinnedChannels', titleKey: 'layout_editor.target_topbar_pinned_channels', scope: 'all-pages' },
  { id: 'topbar-more', section: 'topBar', category: 'navigation', settingId: 'navigation.topBar.components', titleKey: 'layout_editor.target_topbar_actions', scope: 'all-pages' },
  {
    id: 'sidebar',
    section: 'sidebar',
    category: 'navigation',
    settingId: 'navigation.sidebar.position',
    titleKey: 'layout_editor.target_sidebar',
    scope: 'all-pages',
    previewControl: {
      type: 'select',
      options: [
        { labelKey: 'common.position.left', value: 'left' },
        { labelKey: 'common.position.right', value: 'right' },
      ],
    },
  },
  {
    id: 'home-video-grid',
    section: 'page',
    category: 'page-layout',
    settingId: 'page.home.gridLayout',
    titleKey: 'layout_editor.target_home_grid',
    scope: 'current-page',
    previewControl: {
      type: 'select',
      options: [
        { labelKey: 'layout_editor.layout_adaptive', value: 'adaptive' },
        { labelKey: 'layout_editor.layout_two_columns', value: 'twoColumns' },
        { labelKey: 'layout_editor.layout_one_column', value: 'oneColumn' },
      ],
    },
  },
  { id: 'home-tabs', section: 'page', category: 'page-layout', settingId: 'page.home.tabs', titleKey: 'layout_editor.target_home_tabs', scope: 'current-page' },
  { id: 'home-grid-switcher', section: 'page', category: 'page-layout', settingId: 'page.home.gridLayout', titleKey: 'layout_editor.target_home_grid_switcher', scope: 'current-page' },
  { id: 'home-search', section: 'page', category: 'page-layout', settingId: 'search.focus.disable', titleKey: 'layout_editor.target_search_bar', scope: 'current-page' },
  {
    id: 'moments-grid',
    section: 'page',
    category: 'page-layout',
    settingId: 'page.moments.gridColumns',
    titleKey: 'layout_editor.target_moments_grid',
    scope: 'current-page',
    previewControl: {
      type: 'select',
      options: [
        { labelKey: 'layout_editor.columns_one', value: '1' },
        { labelKey: 'layout_editor.columns_two', value: '2' },
        { labelKey: 'layout_editor.columns_three', value: '3' },
      ],
    },
  },
  { id: 'moments-sidebar', section: 'page', category: 'page-layout', settingId: 'page.moments.sidebar', titleKey: 'layout_editor.target_moments_sidebar', scope: 'current-page' },
  { id: 'moments-up-list', section: 'page', category: 'page-layout', settingId: 'page.moments.sidebar', titleKey: 'layout_editor.target_moments_up_list', scope: 'current-page' },
  {
    id: 'watch-later-layout',
    section: 'page',
    category: 'page-layout',
    settingId: 'page.watchLater.layout',
    titleKey: 'layout_editor.target_watch_later',
    scope: 'current-page',
    previewControl: {
      type: 'select',
      options: [
        { labelKey: 'watch_later.layout_list', value: 'list' },
        { labelKey: 'watch_later.layout_grid', value: 'grid' },
      ],
    },
  },
  ...dockItemDescriptors.map(([id, , titleKey]): LayoutEditableDescriptor => ({
    id,
    section: 'dock',
    category: 'navigation',
    settingId: 'navigation.dock.items',
    titleKey,
    scope: 'all-pages',
  })),
  ...topBarItemDescriptors.map(([id, , titleKey]): LayoutEditableDescriptor => ({
    id,
    section: 'topBar',
    category: 'navigation',
    settingId: 'navigation.topBar.components',
    titleKey,
    scope: 'all-pages',
  })),
])
