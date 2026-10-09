export const COMMENT_REPLY_BATCH_DEFAULT = 5
export const COMMENT_REPLY_BATCH_MAX = 5
export const COMMENT_REPLY_CONTAINER_HEIGHT = { min: 240, max: 960, default: 480 } as const

export function normalizeCommentReplyBatch(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.min(COMMENT_REPLY_BATCH_MAX, Math.round(value))) : COMMENT_REPLY_BATCH_DEFAULT
}

export function normalizeCommentReplyContainerHeight(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(COMMENT_REPLY_CONTAINER_HEIGHT.min, Math.min(COMMENT_REPLY_CONTAINER_HEIGHT.max, Math.round(value)))
    : COMMENT_REPLY_CONTAINER_HEIGHT.default
}
