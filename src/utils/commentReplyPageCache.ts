import { waitWithSignal } from './abort'

export interface CommentReplyPageIdentity {
  account: string
  /** Document/extension context boundary; regular and private contexts never share it. */
  context: string
  oid: string
  type: number
  root: string
  sort: number
  pageSize: number
}

export interface CommentReplyPage<T> {
  items: T[]
  page: number
  pageSize: number
  count: number
  totalPages: number
}

export const COMMENT_REPLY_CACHE_LIMITS = { threads: 16, pages: 12, items: 240 } as const

interface Read<T> {
  controller: AbortController
  promise: Promise<CommentReplyPage<T>>
  readers: number
  settled: boolean
  updates: Map<string, (item: T) => T>
}

interface Thread<T> {
  identity: CommentReplyPageIdentity
  revision: number
  pages: Map<number, CommentReplyPage<T>>
  reads: Map<number, Read<T>>
}

export function commentReplyPageKey(identity: CommentReplyPageIdentity) {
  return JSON.stringify([identity.context, identity.account, identity.oid, identity.type, identity.root, identity.sort, identity.pageSize])
}

export function commentReplyWriteKey(identity: CommentReplyPageIdentity) {
  return JSON.stringify([identity.context, identity.account, identity.oid, identity.type, identity.root])
}

function copy<T>(page: CommentReplyPage<T>): CommentReplyPage<T> {
  // Only copy at a page boundary. Native renderers may mutate their reply data;
  // those mutations must not silently change another reader's cached page.
  return JSON.parse(JSON.stringify(page)) as CommentReplyPage<T>
}

/** A bounded cache for explicitly requested pages. It never starts prefetching. */
export function createCommentReplyPageCache<T>(limits: { threads: number, pages: number, items: number } = COMMENT_REPLY_CACHE_LIMITS) {
  const threads = new Map<string, Thread<T>>()
  let generation = 0
  let revision = 0

  function touch(key: string, thread: Thread<T>) {
    threads.delete(key)
    threads.set(key, thread)
  }

  function getThread(identity: CommentReplyPageIdentity) {
    const key = commentReplyPageKey(identity)
    let thread = threads.get(key)
    if (!thread) {
      if (threads.size >= limits.threads) {
        const oldest = [...threads].find(([, entry]) => entry.reads.size === 0)
        if (!oldest)
          throw new Error('Comment reply cache is busy')
        threads.delete(oldest[0])
      }
      thread = { identity: { ...identity }, revision: 0, pages: new Map(), reads: new Map() }
    }
    touch(key, thread)
    return { key, thread }
  }

  function storePage(thread: Thread<T>, page: CommentReplyPage<T>) {
    if (!Number.isSafeInteger(page.page) || page.page < 1 || page.items.length > limits.items)
      return
    thread.pages.delete(page.page)
    thread.pages.set(page.page, copy(page))
    thread.revision = ++revision
    let size = [...thread.pages.values()].reduce((sum, value) => sum + value.items.length, 0)
    while (thread.pages.size > limits.pages || size > limits.items) {
      const oldest = thread.pages.entries().next().value
      if (!oldest)
        break
      size -= oldest[1].items.length
      thread.pages.delete(oldest[0])
    }
  }

  function get(identity: CommentReplyPageIdentity, page: number) {
    const key = commentReplyPageKey(identity)
    const thread = threads.get(key)
    const value = thread?.pages.get(page)
    if (!thread || !value)
      return
    touch(key, thread)
    thread.pages.delete(page)
    thread.pages.set(page, value)
    return copy(value)
  }

  async function read(
    identity: CommentReplyPageIdentity,
    page: number,
    load: (signal: AbortSignal) => Promise<CommentReplyPage<T>>,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted()
    const cached = get(identity, page)
    if (cached)
      return cached
    const { key, thread } = getThread(identity)
    let pending = thread.reads.get(page)
    if (!pending) {
      const controller = new AbortController()
      const version = generation
      const request: Read<T> = { controller, readers: 0, settled: false, updates: new Map(), promise: undefined! }
      // Establish the owner before invoking a bridge/fetch which may settle
      // synchronously. Only the last departing reader can abort this owner.
      request.promise = Promise.resolve().then(() => {
        controller.signal.throwIfAborted()
        return load(controller.signal)
      }).then((value) => {
        controller.signal.throwIfAborted()
        for (const update of request.updates.values())
          value = { ...value, items: value.items.map(update) }
        if (generation === version && threads.get(key) === thread)
          storePage(thread, value)
        return value
      }).finally(() => {
        request.settled = true
        if (thread.reads.get(page) === request)
          thread.reads.delete(page)
      })
      pending = request
      thread.reads.set(page, request)
    }
    pending.readers++
    try {
      return copy(await waitWithSignal(pending.promise, signal))
    }
    finally {
      pending.readers--
      if (!pending.readers && !pending.settled) {
        pending.controller.abort()
        if (thread.reads.get(page) === pending)
          thread.reads.delete(page)
      }
    }
  }

  function update(identity: CommentReplyPageIdentity, key: string, mutate: (item: T) => T) {
    const owner = commentReplyWriteKey(identity)
    for (const thread of threads.values()) {
      if (commentReplyWriteKey(thread.identity) !== owner)
        continue
      thread.revision = ++revision
      thread.reads.forEach((read) => {
        read.updates.delete(key)
        read.updates.set(key, mutate)
        if (read.updates.size > limits.items)
          read.updates.delete(read.updates.keys().next().value!)
      })
      thread.pages.forEach((page) => {
        page.items = page.items.map(mutate)
      })
    }
  }

  function clear() {
    generation++
    threads.forEach(thread => thread.reads.forEach(read => read.controller.abort()))
    threads.clear()
  }

  return {
    clear,
    get,
    read,
    update,
    knownItems: (identity: CommentReplyPageIdentity): readonly T[] => [...(threads.get(commentReplyPageKey(identity))?.pages.values() ?? [])].flatMap(page => page.items),
    revision: (identity: CommentReplyPageIdentity) => threads.get(commentReplyPageKey(identity))?.revision ?? 0,
    get size() { return threads.size },
    get pageCount() { return [...threads.values()].reduce((sum, thread) => sum + thread.pages.size, 0) },
    get itemCount() { return [...threads.values()].reduce((sum, thread) => sum + [...thread.pages.values()].reduce((sum, page) => sum + page.items.length, 0), 0) },
  }
}
