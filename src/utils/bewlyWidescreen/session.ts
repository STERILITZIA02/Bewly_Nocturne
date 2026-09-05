import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'

export const session: { current: BewlyWidescreenState | null, entering: boolean } = { current: null, entering: false }

export function isWidescreenSidebarExpanded(currentState: BewlyWidescreenState) {
  return currentState.sidebarLayout === 'expanded'
    || currentState.root.dataset.sidebarHoverExpanded === 'true'
    || currentState.root.dataset.centered === 'true'
}
