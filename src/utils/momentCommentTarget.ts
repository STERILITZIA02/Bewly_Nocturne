import type { DisplayMoment } from '~/components/MomentCard/types'

export interface MomentCommentTarget {
  oid: string
  type: number
}

export function readMomentCommentTarget(oid: unknown, type: unknown): MomentCommentTarget | null {
  if (typeof type !== 'number' && typeof type !== 'string')
    return null
  const commentType = Number(type)
  return typeof oid === 'string' && /^[1-9]\d*$/.test(oid) && Number.isSafeInteger(commentType) && commentType > 0
    ? { oid, type: commentType }
    : null
}

export async function resolveMomentCommentTarget(
  moment: Pick<DisplayMoment, 'id' | 'commentId' | 'commentType'>,
  fetchDetail: (id: string) => Promise<unknown>,
  isCurrent: () => boolean,
): Promise<MomentCommentTarget | null> {
  const direct = readMomentCommentTarget(moment.commentId, moment.commentType)
  if (direct)
    return isCurrent() ? direct : null
  const response = await fetchDetail(moment.id) as {
    code?: number
    data?: { item?: { basic?: { comment_id_str?: unknown, comment_type?: unknown } } }
  } | null
  if (!isCurrent() || response?.code !== 0)
    return null
  const basic = response.data?.item?.basic
  return readMomentCommentTarget(basic?.comment_id_str, basic?.comment_type)
}
