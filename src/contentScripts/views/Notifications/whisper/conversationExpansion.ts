export type ConversationExpansionState = 'compact' | 'expanding' | 'history-open'

export interface ConversationExpansionModel {
  state: ConversationExpansionState
  topExpansionProgress: number
}

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

export interface ConversationExpansionProgress {
  bottom: number
  top: number
}

export interface ConversationLatestIntent {
  physicalAtLatest: boolean
  requestedLatest: boolean
  userHasReadUpward: boolean
}

export type ConversationExpansionAction
  = | { type: 'reset' }
    | { type: 'scroll', atLatest: boolean, noMore: boolean, progress: number }
    | { type: 'load-start', noMore: boolean }
    | { type: 'load-end', noMore: boolean }
    | { type: 'settle' }

export const CONVERSATION_EXPANSION_DURATION = 200
export const CONVERSATION_VIEWPORT_OVERSCAN = 8

export const COMPACT_CONVERSATION_EXPANSION: ConversationExpansionModel = {
  state: 'compact',
  topExpansionProgress: 0,
}

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

function roundToGrid(value: number): number {
  return Math.round(value / 4) * 4
}

export function calculateConversationTopProgress(
  metrics: ConversationScrollMetrics,
  options: { atLatest: boolean },
): number {
  if (options.atLatest || metrics.scrollHeight <= metrics.clientHeight)
    return 0
  return 1
}

export function reduceConversationExpansion(
  current: ConversationExpansionModel,
  action: ConversationExpansionAction,
): ConversationExpansionModel {
  if (action.type === 'reset')
    return { ...COMPACT_CONVERSATION_EXPANSION }

  if (action.type === 'settle') {
    return current.state === 'expanding' && current.topExpansionProgress === 0
      ? { ...COMPACT_CONVERSATION_EXPANSION }
      : current
  }

  if (action.type === 'load-start') {
    return action.noMore
      ? current
      : { state: 'expanding', topExpansionProgress: 1 }
  }

  if (action.type === 'load-end') {
    return {
      state: 'history-open',
      topExpansionProgress: 1,
    }
  }

  if (action.atLatest) {
    return current.state === 'compact'
      ? current
      : { state: 'expanding', topExpansionProgress: 0 }
  }

  if (current.state === 'history-open') {
    return {
      state: 'history-open',
      topExpansionProgress: 1,
    }
  }

  const progress = clampProgress(action.progress)
  if (action.noMore) {
    return progress > 0
      ? { state: 'history-open', topExpansionProgress: 1 }
      : { ...COMPACT_CONVERSATION_EXPANSION }
  }
  return progress > 0
    ? { state: 'expanding', topExpansionProgress: progress }
    : { ...COMPACT_CONVERSATION_EXPANSION }
}

export function shouldCollapseConversationAtLatest(intent: ConversationLatestIntent): boolean {
  return intent.physicalAtLatest
    && (!intent.userHasReadUpward || intent.requestedLatest)
}

export function getConversationLayoutProgress(model: ConversationExpansionModel): number {
  if (model.state === 'history-open')
    return 1
  if (model.state === 'expanding')
    return clampProgress(model.topExpansionProgress)
  return 0
}

export function getConversationCornerProgress(
  model: ConversationExpansionModel,
): ConversationExpansionProgress {
  const progress = getConversationLayoutProgress(model)
  return {
    bottom: 1 - progress,
    top: 1 - progress,
  }
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
  progress: ConversationExpansionProgress,
  mobile: boolean,
  expanded: ConversationExpansionGeometry,
): ConversationExpansionGeometry {
  if (mobile)
    return { extraHeight: 0, topLift: 0 }

  const topProgress = clampProgress(progress.top)
  const bottomProgress = clampProgress(progress.bottom)
  const expandedTop = Math.max(0, -expanded.topLift)
  const expandedBottom = Math.max(0, expanded.extraHeight - expandedTop)
  const topExpansion = roundToGrid(expandedTop * topProgress)
  const bottomExpansion = roundToGrid(expandedBottom * bottomProgress)
  return {
    extraHeight: topExpansion + bottomExpansion,
    topLift: topExpansion > 0 ? -topExpansion : 0,
  }
}
