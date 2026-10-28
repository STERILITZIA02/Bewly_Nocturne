import { settings } from '~/logic'

/**
 * 获取指定组件的配置
 * @param componentKey 组件键值
 * @returns 组件配置
 */
export function getComponentConfig(componentKey: string) {
  return settings.value.topBarComponentsConfig?.find(item => item.key === componentKey)
}

/**
 * 判断组件是否可见
 * @param componentKey 组件键值
 * @returns 是否可见
 */
export function isComponentVisible(componentKey: string): boolean {
  const config = getComponentConfig(componentKey)
  return config?.visible ?? true
}

/**
 * 获取指定组件的角标类型
 * @param componentKey 组件键值
 * @returns 角标类型
 */
export function getBadgeType(componentKey: string): 'dot' | 'none' {
  const config = getComponentConfig(componentKey)
  return config?.badgeType || 'dot'
}

/**
 * 判断是否应该显示角标
 * @param componentKey 组件键值
 * @returns 是否显示角标
 */
export function shouldShowBadge(componentKey: string): boolean {
  const badgeType = getBadgeType(componentKey)
  const isVisible = isComponentVisible(componentKey)
  return isVisible && badgeType !== 'none'
}
