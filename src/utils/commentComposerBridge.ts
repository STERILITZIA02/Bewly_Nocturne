/**
 * Shared by MAIN and the isolated world for the playback page comment
 * composer. A comment panel carrying this attribute owns its own composer:
 * native comment boxes inside it stay hidden and native "reply" clicks are
 * handed over instead of opening one.
 */
export const EXTERNAL_COMMENT_COMPOSER_ATTRIBUTE = 'data-bewly-external-composer'

const COMMENT_ID_PATTERN = /^\d+$/

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function toId(value: unknown) {
  const id = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  return COMMENT_ID_PATTERN.test(id) ? id : ''
}

/**
 * Plain copy of a native reply holding only what targets a reply (relation
 * ids, author, text). Native data carries nested replies and controls that
 * neither world needs to pass across the bridge.
 */
export function toCommentComposerReply(value: unknown) {
  const raw = asRecord(value)
  const member = asRecord(raw.member)
  const content = asRecord(raw.content)
  const rpid = toId(raw.rpid_str ?? raw.rpid)
  const oid = toId(raw.oid_str ?? raw.oid)
  const type = Number(raw.type)
  if (!rpid || !oid || !Number.isInteger(type) || type <= 0)
    return null
  const pictures = (Array.isArray(content.pictures) ? content.pictures : [])
    .map(picture => asRecord(picture).img_src)
    .filter((src): src is string => typeof src === 'string' && Boolean(src))
    .map(img_src => ({ img_src }))
  return {
    rpid_str: rpid,
    root_str: toId(raw.root_str ?? raw.root) || '0',
    parent_str: toId(raw.parent_str ?? raw.parent) || '0',
    oid_str: oid,
    type,
    mid_str: toId(raw.mid_str ?? raw.mid ?? member.mid),
    ctime: Number(raw.ctime) || 0,
    member: {
      mid: toId(member.mid ?? raw.mid),
      uname: typeof member.uname === 'string' ? member.uname : '',
    },
    content: {
      message: typeof content.message === 'string' ? content.message : '',
      pictures,
    },
  }
}

/** `type,oid` exactly as the native list compares its items (`data-params`). */
export function parseCommentListParams(value: string | null | undefined) {
  const [type, oid] = (value ?? '').split(',')
  const parsedType = Number(type)
  return Number.isInteger(parsedType) && parsedType > 0 && COMMENT_ID_PATTERN.test(oid ?? '')
    ? { type: parsedType, oid: oid! }
    : null
}
