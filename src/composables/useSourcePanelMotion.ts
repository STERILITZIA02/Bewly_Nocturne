import { useGlassPanelMotion } from './useGlassPanelMotion'
import type { PanelOrigin } from './usePanelOrigin'
import { panelOriginTransform, usePanelOrigin } from './usePanelOrigin'

/** Each opening owns its source snapshot, even when the originating menu unmounts. */
export function useSourcePanelMotion(selector: string, fadeSelector: string, source?: () => PanelOrigin | undefined) {
  const resolveOrigin = usePanelOrigin()
  let origin: PanelOrigin | undefined
  const motion = useGlassPanelMotion(selector, panel => panelOriginTransform(panel, origin), fadeSelector)
  return {
    ...motion,
    onBeforeEnter: () => { origin = source ? source() : resolveOrigin() },
  }
}
