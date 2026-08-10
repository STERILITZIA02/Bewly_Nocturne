import type { Ref } from 'vue'
import { onScopeDispose, readonly, ref, watch } from 'vue'

import { settings } from '~/logic/storage'

export type LayoutEditSection = 'dock' | 'topBar' | 'sidebar'

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

export interface EditableTarget {
  featureId: string
  settingId: string
  section: LayoutEditSection
  element: HTMLElement
}

export interface LayoutPreviewTransaction<T = unknown> {
  settingId: string
  before: T
  readonly after: T
  updatePreview: (value: T) => void
  commitPreview: () => void
  cancelPreview: () => void
}

const descriptorMap = new Map<string, SettingDescriptor>()
const editableTargets = new Map<LayoutEditSection, Set<EditableTarget>>()
const activeSection = ref<LayoutEditSection | null>(null)
const isLayoutEditingState = ref(false)
const navigationListeners = new Set<(descriptor: SettingDescriptor) => void>()

export const isLayoutEditing = readonly(isLayoutEditingState)

export function registerSettingDescriptors(descriptors: SettingDescriptor[]) {
  descriptors.forEach(descriptor => descriptorMap.set(descriptor.id, descriptor))
}

export function getSettingDescriptor(id: string) {
  return descriptorMap.get(id)
}

export function openSettingById(id: string): boolean {
  const descriptor = descriptorMap.get(id)
  if (!descriptor)
    return false
  navigationListeners.forEach(listener => listener(descriptor))
  return true
}

export function subscribeSettingNavigation(listener: (descriptor: SettingDescriptor) => void) {
  navigationListeners.add(listener)
  return () => navigationListeners.delete(listener)
}

export function registerEditableTarget(target: EditableTarget) {
  const targets = editableTargets.get(target.section) ?? new Set<EditableTarget>()
  targets.add(target)
  editableTargets.set(target.section, targets)
  return () => {
    targets.delete(target)
    if (targets.size === 0)
      editableTargets.delete(target.section)
  }
}

const defaultEditableSettingIds: Record<LayoutEditSection, string> = {
  dock: 'navigation.dock.position',
  topBar: 'navigation.topBar.mode',
  sidebar: 'navigation.sidebar.position',
}

export function useLayoutEditableRoot(section: LayoutEditSection, element: Ref<HTMLElement | null | undefined>) {
  let unregister: (() => void) | undefined
  watch(element, (value) => {
    unregister?.()
    unregister = value
      ? registerEditableTarget({
          featureId: section,
          settingId: defaultEditableSettingIds[section],
          section,
          element: value,
        })
      : undefined
  }, { immediate: true, flush: 'post' })
  onScopeDispose(() => unregister?.())
}

export function getEditableTargets(section: LayoutEditSection): ReadonlySet<EditableTarget> {
  return editableTargets.get(section) ?? new Set()
}

export function beginPreview<T = unknown>(settingId: string): LayoutPreviewTransaction<T> | undefined {
  const descriptor = descriptorMap.get(settingId) as SettingDescriptor<T> | undefined
  if (!descriptor)
    return undefined

  const before = descriptor.get()
  let after = before
  let active = true
  return {
    settingId,
    before,
    get after() {
      return after
    },
    updatePreview(value) {
      if (active)
        after = value
    },
    commitPreview() {
      if (!active)
        return
      active = false
      if (!Object.is(after, before))
        descriptor.set(after)
    },
    cancelPreview() {
      active = false
    },
  }
}

export function enterLayoutEditMode(section: LayoutEditSection) {
  activeSection.value = section
  isLayoutEditingState.value = true
}

export function exitLayoutEditMode() {
  isLayoutEditingState.value = false
  activeSection.value = null
}

export function useLayoutEditState() {
  return {
    activeSection: readonly(activeSection),
    isLayoutEditing,
    enterLayoutEditMode,
    exitLayoutEditMode,
  }
}

registerSettingDescriptors([
  { id: 'navigation.pageMode', category: 'BewlyComponents', page: 'dock', group: 'page-mode', titleKey: 'settings.page_mode', get: () => settings.value.pageMode, set: value => settings.value.pageMode = value as typeof settings.value.pageMode },
  { id: 'navigation.dock.collapseMode', category: 'BewlyComponents', page: 'dock', group: 'dock', titleKey: 'settings.dock_collapse_mode', get: () => settings.value.dockCollapseMode, set: value => settings.value.dockCollapseMode = value as typeof settings.value.dockCollapseMode },
  { id: 'navigation.dock.position', category: 'BewlyComponents', page: 'dock', group: 'dock', titleKey: 'settings.dock_position', get: () => settings.value.dockPosition, set: value => settings.value.dockPosition = value as typeof settings.value.dockPosition },
  { id: 'navigation.sidebar.position', category: 'BewlyComponents', page: 'dock', group: 'sidebar', titleKey: 'settings.sidebar_position', get: () => settings.value.sidebarPosition, set: value => settings.value.sidebarPosition = value as typeof settings.value.sidebarPosition },
  { id: 'navigation.sidebar.autoHide', category: 'BewlyComponents', page: 'dock', group: 'sidebar', titleKey: 'settings.auto_hide_sidebar', get: () => settings.value.autoHideSidebar, set: value => settings.value.autoHideSidebar = Boolean(value) },
  { id: 'navigation.topBar.mode', category: 'BewlyComponents', page: 'dock', group: 'top-bar', titleKey: 'settings.topbar_mode', get: () => settings.value.useOriginalBilibiliTopBar, set: value => settings.value.useOriginalBilibiliTopBar = Boolean(value) },
  { id: 'navigation.topBar.autoHide', category: 'BewlyComponents', page: 'topbar', group: 'top-bar', titleKey: 'settings.auto_hide_top_bar', get: () => settings.value.autoHideTopBar, set: value => settings.value.autoHideTopBar = Boolean(value) },
  { id: 'search.focus.disable', category: 'BewlyPages', page: 'search', group: 'focus', titleKey: 'settings.disable_search_focus_effect', get: () => settings.value.disableSearchFocusEffect, set: value => settings.value.disableSearchFocusEffect = Boolean(value) },
])
