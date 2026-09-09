import type { ContextMenuOption } from '~/components/ContextMenu.vue'
import { AppPage } from '~/enums/appEnums'
import type { DockItem } from '~/stores/mainStore'
import type { useSettingsStore } from '~/stores/settingsStore'
import { getBadgeType, getComponentConfig, isComponentVisible } from '~/utils/topBarBadge'

import type { LayoutEditableDescriptor } from './layoutEdit'
import { getLayoutEditableDescriptor, getLayoutEditableDescriptors, getSettingDescriptor } from './layoutEdit'
import { settings } from './storage'

export type ElementSettingsAction = ContextMenuOption & { run: () => void }

export function findElementSettingsTarget(path: EventTarget[], root: HTMLElement | null) {
  if (!root || !path.includes(root))
    return
  const elements = path.filter((node): node is HTMLElement => node instanceof HTMLElement)
  if (elements.some(node => node.isContentEditable || node.matches('input, textarea, select, video, audio, iframe, .video-card-container, .moment-card, [role="menu"], [data-bewly-dialog-active]')))
    return
  for (const element of elements) {
    const descriptor = getLayoutEditableDescriptor(element.dataset.layoutEditableId ?? '')
    if (descriptor)
      return { element, descriptor }
  }
}

const relatedSettings: Record<string, string[]> = {
  dock: ['navigation.dock.collapseMode', 'navigation.dock.themeSwitcher', 'navigation.dock.actionButtons', 'navigation.dock.undoRefresh'],
  sidebar: ['navigation.sidebar.autoHide'],
  topbar: ['navigation.topBar.autoHide'],
}

function descriptorActions(target: LayoutEditableDescriptor, t: (key: string) => string): ElementSettingsAction[] {
  const actions: ElementSettingsAction[] = []
  for (const id of new Set([target.settingId, ...relatedSettings[target.id] ?? []])) {
    const descriptor = getSettingDescriptor(id)
    if (descriptor && typeof descriptor.get() === 'boolean') {
      actions.push({ value: id, label: t(descriptor.titleKey), icon: 'i-mingcute:settings-3-line', kind: 'toggle', closeOnSelect: false, checked: Boolean(descriptor.get()), run: () => descriptor.set(!descriptor.get()) })
    }
  }
  const primary = getSettingDescriptor(target.settingId)
  if (primary && target.previewControl) {
    for (const option of target.previewControl.options)
      actions.push({ value: `choice:${String(option.value)}`, label: t(option.labelKey), icon: 'i-mingcute:layout-line', kind: 'radio', closeOnSelect: false, checked: primary.get() === option.value, run: () => primary.set(option.value) })
  }
  return actions
}

function dockActions(target: LayoutEditableDescriptor, items: DockItem[], store: ReturnType<typeof useSettingsStore>, t: (key: string) => string): ElementSettingsAction[] {
  if (target.id !== 'dock' && !target.dockPage)
    return []
  return items.filter(item => (!target.dockPage || item.page === target.dockPage)
    && !(item.page === AppPage.Search && settings.value.useSearchPageModeOnHomePage)).flatMap((item): ElementSettingsAction[] => {
    const config = store.getDockItemConfigByPage(item.page)
    if (!config)
      return []
    const actions: ElementSettingsAction[] = [{ value: `dock:${item.page}:visible`, label: t(target.dockPage ? 'settings.visibility' : item.i18nKey), icon: item.icon, kind: 'toggle', closeOnSelect: false, checked: config.visible, run: () => store.toggleDockItemVisibility(item.page) }]
    if (target.dockPage) {
      actions.push({ value: 'dock:new-tab', label: t('settings.dock_item_open_in_new_tab'), icon: 'i-mingcute:external-link-line', kind: 'toggle', closeOnSelect: false, checked: config.openInNewTab, run: () => {
        config.openInNewTab = !config.openInNewTab
      } })
      if (item.hasBewlyPage) {
        actions.push({ value: 'dock:original', label: t('settings.dock_item_use_original_bili_web_page'), icon: 'i-mingcute:layout-line', kind: 'toggle', closeOnSelect: false, checked: store.getDockItemIsUseOriginalBiliPage(item.page), disabled: settings.value.pageMode !== 'custom', run: () => store.setDockItemCustomUseOriginalBiliPage(item.page, !store.getDockItemCustomUseOriginalBiliPage(item.page)) })
      }
    }
    return actions
  })
}

function topBarActions(target: LayoutEditableDescriptor, t: (key: string) => string): ElementSettingsAction[] {
  const targets = target.topBarKey ? [target] : ['topbar', 'topbar-more'].includes(target.id) ? getLayoutEditableDescriptors().filter(item => item.topBarKey) : []
  return targets.flatMap((item): ElementSettingsAction[] => {
    const key = item.topBarKey!
    function ensureConfig() {
      if (!getComponentConfig(key))
        settings.value.topBarComponentsConfig = [...settings.value.topBarComponentsConfig, { key, visible: true, badgeType: getBadgeType(key) }]
      return getComponentConfig(key)!
    }
    const actions: ElementSettingsAction[] = [{ value: `topbar:${key}:visible`, label: t(target.topBarKey ? 'settings.visibility' : item.titleKey), icon: 'i-mingcute:eye-line', kind: 'toggle', closeOnSelect: false, checked: isComponentVisible(key), run: () => {
      ensureConfig().visible = !isComponentVisible(key)
    } }]
    if (!target.topBarKey || !['moments', 'watchLater', 'notifications'].includes(key))
      return actions
    const current = key === 'notifications' && getBadgeType(key) === 'number' && settings.value.showLikeNotificationReminder ? 'number_with_likes' : getBadgeType(key)
    for (const badge of key === 'notifications' ? ['number', 'number_with_likes', 'dot', 'none'] as const : ['number', 'dot', 'none'] as const) {
      actions.push({ value: `badge:${badge}`, label: `${t('settings.badge_type')} · ${t(`settings.top_bar_icon_badges_opt.${badge}`)}`, icon: 'i-mingcute:notification-line', kind: 'radio', closeOnSelect: false, checked: current === badge, run: () => {
        ensureConfig().badgeType = badge === 'number_with_likes' ? 'number' : badge
        if (key === 'notifications')
          settings.value.showLikeNotificationReminder = badge === 'number_with_likes'
      } })
    }
    return actions
  })
}

export function getElementSettingsActions(target: LayoutEditableDescriptor, items: DockItem[], store: ReturnType<typeof useSettingsStore>, t: (key: string) => string): ElementSettingsAction[] {
  return [...descriptorActions(target, t), ...dockActions(target, items, store, t), ...topBarActions(target, t)]
}
