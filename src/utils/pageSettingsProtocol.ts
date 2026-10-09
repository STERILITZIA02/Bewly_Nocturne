import { COMMENT_REPLY_BATCH_MAX, COMMENT_REPLY_CONTAINER_HEIGHT } from '~/constants/commentReading'
import type { CommentReplyPaginationMode, CommentReplyTreeMode } from '~/logic/storage'

import { LOCAL_LOUDNESS_RANGE } from './localLoudnessProtocol'

const PAGE_SETTINGS_LANGUAGES = ['en', 'cmn-CN', 'cmn-TW', 'jyut'] as const
const COMMENT_REPLY_TREE_MODES = ['lineCollapseMain', 'lineKeepMain', 'indentOnly'] as const
const COMMENT_REPLY_PAGINATION_MODES = ['loadMore', 'pagination'] as const

export type PageSettingsLanguage = typeof PAGE_SETTINGS_LANGUAGES[number]

export interface PageSettingsPayload {
  adjustCommentImageHeight: boolean
  cleanShareLinkIncludeTitle: boolean
  cleanShareLinkRemoveTrackingParams: boolean
  commentReplyPaginationMode: CommentReplyPaginationMode
  commentReplyTreeMode: CommentReplyTreeMode
  commentReplyBatchPages: number
  enableCommentReplyTreeContainer: boolean
  commentReplyTreeContainerHeight: number
  localLoudnessEnabled: boolean
  localLoudnessTarget: number
  localLoudnessStrength: number
  enableCleanShareLink: boolean
  enableCommentReplyTreeDisplay: boolean
  language: PageSettingsLanguage
  preventMobileRedirect: boolean
  showCommentHostTag: boolean
  showIPLocation: boolean
  showSex: boolean
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]')
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.includes(value as T)
}

export function createPageSettingsPayload(value: unknown): PageSettingsPayload | null {
  if (!isPlainObject(value))
    return null

  if (typeof value.adjustCommentImageHeight !== 'boolean'
    || typeof value.cleanShareLinkIncludeTitle !== 'boolean'
    || typeof value.cleanShareLinkRemoveTrackingParams !== 'boolean'
    || typeof value.enableCleanShareLink !== 'boolean'
    || typeof value.enableCommentReplyTreeDisplay !== 'boolean'
    || typeof value.enableCommentReplyTreeContainer !== 'boolean'
    || typeof value.localLoudnessEnabled !== 'boolean'
    || typeof value.preventMobileRedirect !== 'boolean'
    || typeof value.showCommentHostTag !== 'boolean'
    || typeof value.showIPLocation !== 'boolean'
    || typeof value.showSex !== 'boolean') {
    return null
  }
  if (!isOneOf(value.commentReplyPaginationMode, COMMENT_REPLY_PAGINATION_MODES))
    return null
  if (!isOneOf(value.commentReplyTreeMode, COMMENT_REPLY_TREE_MODES))
    return null
  if (!isOneOf(value.language, PAGE_SETTINGS_LANGUAGES))
    return null
  for (const [field, range] of [['localLoudnessTarget', LOCAL_LOUDNESS_RANGE.target], ['localLoudnessStrength', LOCAL_LOUDNESS_RANGE.strength]] as const) {
    if (!Number.isSafeInteger(value[field]) || Number(value[field]) < range.min || Number(value[field]) > range.max)
      return null
  }
  if (!Number.isSafeInteger(value.commentReplyBatchPages) || Number(value.commentReplyBatchPages) < 1 || Number(value.commentReplyBatchPages) > COMMENT_REPLY_BATCH_MAX
    || !Number.isSafeInteger(value.commentReplyTreeContainerHeight) || Number(value.commentReplyTreeContainerHeight) < COMMENT_REPLY_CONTAINER_HEIGHT.min || Number(value.commentReplyTreeContainerHeight) > COMMENT_REPLY_CONTAINER_HEIGHT.max) {
    return null
  }

  return {
    adjustCommentImageHeight: value.adjustCommentImageHeight,
    cleanShareLinkIncludeTitle: value.cleanShareLinkIncludeTitle,
    cleanShareLinkRemoveTrackingParams: value.cleanShareLinkRemoveTrackingParams,
    commentReplyPaginationMode: value.commentReplyPaginationMode,
    commentReplyTreeMode: value.commentReplyTreeMode,
    commentReplyBatchPages: Number(value.commentReplyBatchPages),
    enableCommentReplyTreeContainer: value.enableCommentReplyTreeContainer,
    commentReplyTreeContainerHeight: Number(value.commentReplyTreeContainerHeight),
    localLoudnessEnabled: value.localLoudnessEnabled,
    localLoudnessTarget: Number(value.localLoudnessTarget),
    localLoudnessStrength: Number(value.localLoudnessStrength),
    enableCleanShareLink: value.enableCleanShareLink,
    enableCommentReplyTreeDisplay: value.enableCommentReplyTreeDisplay,
    language: value.language,
    preventMobileRedirect: value.preventMobileRedirect,
    showCommentHostTag: value.showCommentHostTag,
    showIPLocation: value.showIPLocation,
    showSex: value.showSex,
  }
}
