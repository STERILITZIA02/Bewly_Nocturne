import type { HomeSubPage } from '~/contentScripts/views/Home/types'

export interface HomeTabConfigItem {
  page: HomeSubPage
  visible: boolean
}

export function normalizeHomeTabConfig(
  value: readonly HomeTabConfigItem[],
  defaults: readonly HomeTabConfigItem[],
): HomeTabConfigItem[] {
  const validPages = new Set(defaults.map(item => item.page))
  const configuredPages = new Set(value.map(item => item.page))
  const isComplete = value.length === defaults.length
    && configuredPages.size === value.length
    && value.every(item => validPages.has(item.page) && typeof item.visible === 'boolean')
    && defaults.every(item => configuredPages.has(item.page))

  return (isComplete ? value : defaults).map(item => ({ ...item }))
}

export function isSameHomeTabConfig(
  left: readonly HomeTabConfigItem[],
  right: readonly HomeTabConfigItem[],
) {
  return left.length === right.length
    && left.every((item, index) => item.page === right[index]?.page && item.visible === right[index]?.visible)
}
