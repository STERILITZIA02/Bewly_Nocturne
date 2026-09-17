import type { MissingCommentParent } from '~/utils/commentMissingParents'
import { resolveMissingCommentParents } from '~/utils/commentMissingParents'
import type { CommentTreeLayoutNode } from '~/utils/commentTree'
import { buildCommentTree } from '~/utils/commentTree'

import type { MomentCommentItem } from './commentUtils'
import { flattenMomentCommentReplies, mergeMomentComments } from './commentUtils'

export interface MomentCommentViewNode {
  comment?: MomentCommentItem
  missing?: MissingCommentParent
  layout: CommentTreeLayoutNode
}

export function buildMomentCommentThread(root: MomentCommentItem, replies: MomentCommentItem[], known: MomentCommentItem[] = []): MomentCommentViewNode[] {
  const rootId = root.rpid || root.id
  const items = mergeMomentComments([], [root, ...flattenMomentCommentReplies(replies)])
  const byId = new Map(items.map(item => [item.id, item]))
  const inputs = items.map((item, originalOrder) => ({
    rpid: item.id,
    rootRpid: rootId,
    parentRpid: item.id === root.id ? null : item.parentRpid || rootId,
    ctime: item.createdAt || null,
    originalOrder,
  }))
  const cached = new Map(flattenMomentCommentReplies(known).map(item => [item.id, {
    authorName: item.author.name || null,
    messageText: item.message || null,
    ctime: item.createdAt || null,
    rootRpid: item.rootRpid || rootId,
    parentRpid: item.parentRpid || null,
  }]))
  const missing = resolveMissingCommentParents(inputs, cached)
  const missingById = new Map(missing.map(item => [item.rpid, item]))
  const layout = buildCommentTree([
    ...inputs.map(item => ({ id: item.rpid, rootId, parentId: item.parentRpid || '', createdAt: item.ctime || 0, originalOrder: item.originalOrder })),
    ...missing.map(item => ({ id: item.rpid, rootId, parentId: item.parentRpid || rootId, createdAt: item.sortTime || 0, originalOrder: item.originalOrder })),
  ], 6)
  return layout.map(node => ({ layout: node, comment: byId.get(node.id), missing: missingById.get(node.id) }))
}
