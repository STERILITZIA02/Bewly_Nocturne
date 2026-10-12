import { useGlassPanelMotion } from './useGlassPanelMotion'

export function useSettingsMotion() {
  const motion = useGlassPanelMotion('#settings-window', (panel) => {
    const style = getComputedStyle(panel)
    const read = (name: string) => Number.parseFloat(style.getPropertyValue(`--bew-settings-source-${name}`))
    const sourceX = read('x')
    const sourceY = read('y')
    const sourceSize = read('size')
    const rect = panel.getBoundingClientRect()
    // Shortcut/deep-link openings have no physical trigger. Keep those centered.
    if (![sourceX, sourceY, sourceSize].every(Number.isFinite) || sourceSize <= 0 || !rect.width || !rect.height)
      return 'scale(0.94)'
    const scale = Math.min(1, sourceSize / Math.max(rect.width, rect.height))
    return `translate3d(${sourceX - rect.left - rect.width / 2}px, ${sourceY - rect.top - rect.height / 2}px, 0) scale(${scale})`
  }, '.settings-content__surface, .settings-content__scroll, .settings-header > *, .settings-primary-navigation__list > *')
  return {
    ...motion,
    onAfterEnter: (element: Element) => element.dispatchEvent(new Event('bew-settings-motion-ready')),
  }
}
