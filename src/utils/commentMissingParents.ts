export interface CommentReplyCachedMeta {
  authorName: string | null
  ctime: number | null
  messageText: string | null
  parentRpid: string | null
  rootRpid: string | null
}

interface ReplyParentInput {
  rpid: string | null
  parentRpid: string | null
  rootRpid: string | null
  ctime: number | null
  originalOrder: number
}

export interface MissingCommentParent extends CommentReplyCachedMeta {
  rpid: string
  originalOrder: number
  /** Sort beside the earliest known descendant; this is not a fabricated timestamp. */
  sortTime: number | null
}

/**
 * Complete only known parent edges. The normal comment-tree builder breaks
 * cycles and applies the shared visual-depth policy to this completed graph.
 */
export function resolveMissingCommentParents(
  replies: readonly ReplyParentInput[],
  cached: ReadonlyMap<string, CommentReplyCachedMeta>,
): MissingCommentParent[] {
  const visible = new Set(replies.flatMap(reply => reply.rpid ? [reply.rpid] : []))
  const missing = new Map<string, MissingCommentParent>()
  for (const reply of replies) {
    let parentId = reply.parentRpid
    let rootId = reply.rootRpid
    const visited = new Set(reply.rpid ? [reply.rpid] : [])
    while (parentId && parentId !== '0' && parentId !== rootId && !visible.has(parentId) && !visited.has(parentId)) {
      visited.add(parentId)
      const existing = missing.get(parentId)
      if (existing) {
        const order = Math.min(existing.originalOrder, reply.originalOrder)
        const time = reply.ctime === null ? existing.sortTime : Math.min(existing.sortTime ?? reply.ctime, reply.ctime)
        if (order === existing.originalOrder && time === existing.sortTime)
          break
        existing.originalOrder = order
        existing.sortTime = time
        parentId = existing.parentRpid
        rootId = existing.rootRpid
        continue
      }
      const candidate = cached.get(parentId)
      const meta = rootId && candidate?.rootRpid && candidate.rootRpid !== rootId ? undefined : candidate
      const parent: MissingCommentParent = {
        rpid: parentId,
        parentRpid: meta?.parentRpid ?? null,
        rootRpid: meta?.rootRpid ?? rootId,
        authorName: meta?.authorName ?? null,
        messageText: meta?.messageText ?? null,
        ctime: meta?.ctime ?? null,
        sortTime: meta?.ctime ?? reply.ctime,
        originalOrder: reply.originalOrder,
      }
      missing.set(parentId, parent)
      parentId = parent.parentRpid
      rootId = parent.rootRpid
    }
  }
  return [...missing.values()]
}
