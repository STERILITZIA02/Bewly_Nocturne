import type { CommentReplyInteractionState } from './commentReplyPagination'

const PATCHED = Symbol('bewly-reply-interaction-owner')

/** Preserve native writes; only carry their confirmed result across a page change. */
export function patchCommentReplyInteraction(
  constructor: unknown,
  capture: (renderer: HTMLElement & Record<string, any>) => ((state: CommentReplyInteractionState) => void) | undefined,
) {
  if (typeof constructor !== 'function' || !constructor.prototype || constructor.prototype[PATCHED] || !Object.isExtensible(constructor.prototype))
    return
  const prototype = constructor.prototype
  for (const name of ['handleLike', 'handleHate']) {
    const original = prototype[name]
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name)
    if (typeof original !== 'function')
      continue
    if (descriptor && !descriptor.configurable && !descriptor.writable)
      continue
    const wrapped = function (this: HTMLElement & Record<string, any>, ...args: any[]) {
      const commit = capture(this)
      const rpid = String(this.data?.rpid_str ?? this.data?.rpid ?? '')
      const before = `${this.isLike}:${this.isDislike}:${this.likeCount}`
      const result = Reflect.apply(original, this, args)
      return Promise.resolve(result).then((value) => {
        // The published renderer changes these fields only after code=0. A
        // recycled action element or unchanged failed write supplies no result.
        if (commit && rpid && rpid === String(this.data?.rpid_str ?? this.data?.rpid ?? '')
          && before !== `${this.isLike}:${this.isDislike}:${this.likeCount}`
          && typeof this.isLike === 'boolean' && typeof this.isDislike === 'boolean' && Number.isFinite(this.likeCount)) {
          commit({ action: this.isLike ? 1 : this.isDislike ? 2 : 0, like: this.likeCount })
        }
        return value
      })
    }
    Object.defineProperty(prototype, name, { configurable: descriptor?.configurable ?? true, enumerable: descriptor?.enumerable ?? false, writable: true, value: wrapped })
  }
  Object.defineProperty(prototype, PATCHED, { value: true })
}
