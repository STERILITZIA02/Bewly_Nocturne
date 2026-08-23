import type { CommentReplyPaginationMode, CommentReplyTreeMode } from '~/logic/storage'

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

  return {
    adjustCommentImageHeight: value.adjustCommentImageHeight,
    cleanShareLinkIncludeTitle: value.cleanShareLinkIncludeTitle,
    cleanShareLinkRemoveTrackingParams: value.cleanShareLinkRemoveTrackingParams,
    commentReplyPaginationMode: value.commentReplyPaginationMode,
    commentReplyTreeMode: value.commentReplyTreeMode,
    enableCleanShareLink: value.enableCleanShareLink,
    enableCommentReplyTreeDisplay: value.enableCommentReplyTreeDisplay,
    language: value.language,
    preventMobileRedirect: value.preventMobileRedirect,
    showCommentHostTag: value.showCommentHostTag,
    showIPLocation: value.showIPLocation,
    showSex: value.showSex,
  }
}
