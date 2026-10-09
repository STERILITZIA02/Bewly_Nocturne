import type { CommentReplyPage, CommentReplyPageIdentity } from './commentReplyPageCache'

export interface CommentReplyReadRequest {
  requestId: string
  identity: CommentReplyPageIdentity
  page: number
}

export function readCommentReplyRequest(value: unknown): CommentReplyReadRequest | undefined {
  if (!value || typeof value !== 'object')
    return
  const { requestId, identity, page } = value as Partial<CommentReplyReadRequest>
  if (typeof requestId !== 'string' || !requestId || requestId.length > 128
    || !identity || typeof identity !== 'object'
    || typeof identity.context !== 'string' || !identity.context || identity.context.length > 128
    || typeof identity.account !== 'string' || !/^(?:guest|[1-9]\d{0,19})$/.test(identity.account)
    || typeof identity.oid !== 'string' || !/^[1-9]\d{0,19}$/.test(identity.oid)
    || typeof identity.root !== 'string' || !/^[1-9]\d{0,19}$/.test(identity.root)
    || !Number.isSafeInteger(identity.type) || identity.type < 1 || identity.type > 99
    || !Number.isSafeInteger(identity.sort) || identity.sort < 0 || identity.sort > 3
    || !Number.isSafeInteger(identity.pageSize) || identity.pageSize < 1 || identity.pageSize > 100
    || !Number.isSafeInteger(page) || page! < 1) {
    return
  }
  return { requestId, identity: { context: identity.context, account: identity.account, oid: identity.oid, type: identity.type, root: identity.root, sort: identity.sort, pageSize: identity.pageSize }, page: page! }
}

export function normalizeNativeCommentReplyPage(response: unknown, request: CommentReplyReadRequest): CommentReplyPage<Record<string, any>> {
  const value = response as { code?: number, message?: string, data?: { replies?: Array<Record<string, any>> | null, page?: { num?: number, size?: number, count?: number } } } | null
  const data = value?.data
  if (value?.code !== 0 || !data || (data.replies !== null && !Array.isArray(data.replies))
    || (data.replies && (data.replies.length > request.identity.pageSize || data.replies.some(reply => !reply || typeof reply !== 'object'
      || (reply.root_str && reply.root_str !== request.identity.root)
      || (reply.oid_str && reply.oid_str !== request.identity.oid))))
    || (data.page?.num !== undefined && data.page.num !== request.page)
    || (data.page?.size !== undefined && data.page.size !== request.identity.pageSize)
    || !Number.isSafeInteger(data.page?.count) || data.page!.count! < 0) {
    throw new Error(value?.message || 'Invalid comment reply page')
  }
  const count = data.page!.count!
  return { items: data.replies ?? [], page: request.page, pageSize: request.identity.pageSize, count, totalPages: Math.max(1, Math.ceil(count / request.identity.pageSize)) }
}
