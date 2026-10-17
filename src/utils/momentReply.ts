import type { MomentCommentItem } from '~/components/MomentCard/commentUtils'

export const MOMENT_REPLY_IMAGE_LIMIT = 9
export const MOMENT_REPLY_IMAGE_MAX_BYTES = 20 * 1024 * 1024
export const MOMENT_REPLY_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png']

export interface ReplyPicture {
  img_src: string
  img_width: number
  img_height: number
  img_size: number
  ai_gen_pic?: number
}

export interface MomentReplyDraft {
  oid: string
  type: number
  message: string
  root?: string
  parent?: string
  mentions: Record<string, string>
  pictures: ReplyPicture[]
  syncToDynamic: boolean
}

export function momentReplyTarget(comment?: MomentCommentItem | null) {
  if (!comment)
    return { root: '', parent: '', prefix: '' }
  const root = comment.rootRpid || comment.rpid
  return { root, parent: comment.rpid, prefix: root !== comment.rpid ? `回复 @${comment.author.name} :` : '' }
}

export function isMomentReplyImage(file: Pick<File, 'type' | 'size'>) {
  return MOMENT_REPLY_IMAGE_TYPES.includes(file.type)
    && file.size > 0 && file.size < MOMENT_REPLY_IMAGE_MAX_BYTES
}

function containsSelectedMention(message: string, name: string) {
  const token = `@${name}`
  let start = message.indexOf(token)
  while (start >= 0) {
    const end = start + token.length
    if (end === message.length || /\s/.test(message[end]))
      return true
    start = message.indexOf(token, end)
  }
  return false
}

export function normalizeReplyPicture(value: unknown): ReplyPicture | null {
  if (!value || typeof value !== 'object')
    return null
  const data = value as Record<string, unknown>
  const rawUrl = String(data.img_src ?? data.image_url ?? '')
  const src = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl.replace(/^http:/, 'https:')
  let url: URL
  try {
    url = new URL(src)
  }
  catch { return null }
  if (url.protocol !== 'https:' || !/(?:^|\.)hdslb\.com$/.test(url.hostname))
    return null
  const width = Number(data.img_width ?? data.image_width)
  const height = Number(data.img_height ?? data.image_height)
  const size = Number(data.img_size)
  if (![width, height, size].every(Number.isFinite) || width < 10 || height < 10 || size < 0)
    return null
  return { img_src: src, img_width: width, img_height: height, img_size: size, ...(typeof data.ai_gen_pic === 'number' ? { ai_gen_pic: data.ai_gen_pic } : {}) }
}

/** Native commentpc protocol: string IDs, reply mention map, one atomic sync flag. */
export function buildMomentReplyForm(draft: MomentReplyDraft, csrf: string) {
  const id = /^[1-9]\d*$/
  if (!id.test(draft.oid) || !Number.isSafeInteger(draft.type) || draft.type <= 0 || !csrf || !draft.message.trim())
    throw new Error('invalid-reply')
  if (Boolean(draft.root) !== Boolean(draft.parent) || (draft.root && (!id.test(draft.root) || !id.test(draft.parent!))))
    throw new Error('invalid-reply-target')
  if (draft.pictures.length > MOMENT_REPLY_IMAGE_LIMIT || draft.pictures.some(picture => !normalizeReplyPicture(picture)))
    throw new Error('invalid-reply-pictures')
  const mentions = Object.fromEntries(Object.entries(draft.mentions).filter(([name, mid]) => name && id.test(mid) && containsSelectedMention(draft.message, name)))
  const form = new URLSearchParams({ oid: draft.oid, type: String(draft.type), message: draft.message, plat: '1', csrf, at_name_to_mid: JSON.stringify(mentions), gaia_source: 'main_web' })
  if (draft.root) {
    form.set('root', draft.root)
    form.set('parent', draft.parent!)
  }
  if (draft.pictures.length)
    form.set('pictures', JSON.stringify(draft.pictures))
  if (draft.syncToDynamic)
    form.set('sync_to_dynamic', '1')
  return form
}
