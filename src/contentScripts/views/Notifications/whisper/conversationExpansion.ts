export interface ConversationScrollMetrics {
  clientHeight: number
  scrollHeight: number
  scrollTop: number
}

export interface ConversationViewportBounds {
  bottom: number
  top: number
  viewportHeight: number
}

export interface ConversationExpansionGeometry {
  extraHeight: number
  topLift: number
}

export interface ConversationLatestIntent {
  physicalAtLatest: boolean
  requestedLatest: boolean
  userHasReadUpward: boolean
}

// Keep request release aligned with --bew-duration-normal used by the entry.
export const CONVERSATION_EXPANSION_DURATION = 200
export const CONVERSATION_VIEWPORT_OVERSCAN = 8

function roundToGrid(value: number): number {
  return Math.round(value / 4) * 4
}

/** Reading/ACK intent only; scrolling never changes the conversation's shape. */
export function isConversationAtLatest(intent: ConversationLatestIntent): boolean {
  return intent.physicalAtLatest
    && (!intent.userHasReadUpward || intent.requestedLatest)
}

export function calculateConversationExpandedGeometry(
  bounds: ConversationViewportBounds,
  mobile: boolean,
): ConversationExpansionGeometry {
  if (mobile)
    return { extraHeight: 0, topLift: 0 }

  const viewportHeight = Math.max(0, Number.isFinite(bounds.viewportHeight) ? bounds.viewportHeight : 0)
  const top = Math.max(0, Number.isFinite(bounds.top) ? bounds.top : 0)
  const bottom = Math.max(top, Number.isFinite(bounds.bottom) ? bounds.bottom : top)
  const topExpansion = roundToGrid(top + CONVERSATION_VIEWPORT_OVERSCAN)
  const bottomExpansion = roundToGrid(
    Math.max(0, viewportHeight - bottom) + CONVERSATION_VIEWPORT_OVERSCAN,
  )
  return {
    extraHeight: topExpansion + bottomExpansion,
    topLift: topExpansion > 0 ? -topExpansion : 0,
  }
}

export function getConversationExpansionGeometry(
  expanded: boolean,
  mobile: boolean,
  geometry: ConversationExpansionGeometry,
): ConversationExpansionGeometry {
  if (mobile || !expanded)
    return { extraHeight: 0, topLift: 0 }
  return geometry
}
