import { useGlassPanelMotion } from './useGlassPanelMotion'
import { panelOriginTransform } from './usePanelOrigin'

export function useSettingsMotion() {
  const motion = useGlassPanelMotion('#settings-window', (panel) => {
    const style = getComputedStyle(panel)
    const read = (name: string) => Number.parseFloat(style.getPropertyValue(`--bew-settings-source-${name}`))
    const sourceX = read('x')
    const sourceY = read('y')
    const sourceSize = read('size')
    // Shortcut/deep-link openings have no physical trigger. Keep those centered.
    return panelOriginTransform(panel, { x: sourceX, y: sourceY, size: sourceSize })
  }, '.settings-content__surface, .settings-content__scroll, .settings-header > *, .settings-primary-navigation__list > *')
  return {
    ...motion,
    onAfterEnter: (element: Element) => element.dispatchEvent(new Event('bew-settings-motion-ready')),
  }
}
