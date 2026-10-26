import { computed, onScopeDispose, shallowReactive, watch } from 'vue'

export type CardRemovalPhase = 'confirm' | 'removing' | 'removed' | 'restoring' | 'verify'
export interface CardRemovalTransaction {
  current: () => boolean
  write: (added: boolean, current: () => boolean) => Promise<'success' | 'failed' | 'unknown' | 'cancelled'>
  read: () => Promise<boolean | undefined>
  accepted: (added: boolean) => void | Promise<void>
  dispose?: () => void
  restorable?: boolean
}
export interface CardRemoval {
  phase: CardRemovalPhase
  failed: boolean
  claimFocus: () => boolean
  restorable: boolean
  run: () => Promise<void>
  cancel: () => void
}

/** View slots survive recycling; only the supplied membership owner writes data. */
export function useCardRemoval<T>(options: { items: () => readonly T[], key: (item: T) => string, scope: () => string }) {
  const slots = shallowReactive(new Map<string, { item: T, before?: string, after?: string, state: CardRemoval, dispose?: () => void }>())
  let version = 0
  let disposed = false
  const retire = () => {
    version++
    slots.forEach(slot => slot.dispose?.())
    slots.clear()
  }
  watch(options.scope, retire, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    retire()
  })
  const displayItems = computed(() => {
    const items = options.items()
    if (!slots.size)
      return items as T[]
    const present = new Set(items.map(options.key))
    const absent = new Map([...slots].filter(([key]) => !present.has(key)))
    const before = new Map<string, T[]>()
    const after = new Map<string, T[]>()
    const orphan: T[] = []
    for (const [key, slot] of slots) {
      if (present.has(key))
        continue
      const exists = (key: string) => present.has(key) || absent.has(key)
      const anchor = slot.after && exists(slot.after) ? slot.after : slot.before && exists(slot.before) ? slot.before : undefined
      const map = anchor === slot.after ? before : after
      if (anchor)
        map.set(anchor, [...(map.get(anchor) ?? []), slot.item])
      else orphan.push(slot.item)
    }
    const result: T[] = []
    const emitted = new Set<string>()
    const append = (item: T) => {
      const key = options.key(item)
      if (emitted.has(key))
        return
      emitted.add(key)
      before.get(key)?.forEach(append)
      result.push(item)
      after.get(key)?.forEach(append)
    }
    items.forEach(append)
    orphan.forEach(append)
    absent.forEach(slot => append(slot.item))
    return result
  })
  function begin(item: T, transaction: CardRemovalTransaction) {
    const key = options.key(item)
    if (slots.has(key) || !transaction.current())
      return
    // Old settled placeholders are bounded; in-flight writes retain their owner.
    for (const [oldKey, slot] of slots) {
      if (slots.size < 16)
        break
      if (slot.state.phase === 'removed') {
        slot.dispose?.()
        slots.delete(oldKey)
      }
    }
    const source = displayItems.value
    const index = source.findIndex(value => options.key(value) === key)
    const generation = version
    let added = false
    let busy = false
    let focusRequested = true
    let state: CardRemoval
    const current = () => !disposed && version === generation && transaction.current() && slots.get(key)?.state === state
    state = shallowReactive<CardRemoval>({
      phase: 'confirm',
      failed: false,
      restorable: transaction.restorable !== false,
      claimFocus() {
        const requested = focusRequested
        focusRequested = false
        return requested
      },
      cancel() {
        if (!busy && current()) {
          transaction.dispose?.()
          slots.delete(key)
        }
      },
      async run() {
        if (busy || !current())
          return
        busy = true
        state.failed = false
        try {
          if (state.phase === 'verify') {
            const member = await transaction.read()
            if (!current())
              return
            if (member === undefined) {
              state.failed = true
              return
            }
            if (member === added) {
              await transaction.accepted(added)
              if (current()) {
                if (added) {
                  transaction.dispose?.()
                  slots.delete(key)
                }
                else {
                  state.phase = 'removed'
                }
              }
            }
            else {
              // Reconciliation is read-only. Another explicit action is needed
              // before repeating a write whose first result was uncertain.
              state.phase = member ? 'confirm' : 'removed'
            }
            return
          }
          added = state.phase === 'removed'
          if (added && !state.restorable)
            return
          state.phase = added ? 'restoring' : 'removing'
          const result = await transaction.write(added, current)
          if (result === 'success') {
            await transaction.accepted(added)
            if (current()) {
              if (added) {
                transaction.dispose?.()
                slots.delete(key)
              }
              else {
                state.phase = 'removed'
              }
            }
          }
          else if (current()) {
            state.phase = result === 'unknown' ? 'verify' : added ? 'removed' : 'confirm'
            state.failed = result === 'failed'
          }
        }
        catch {
          if (current()) {
            state.phase = 'verify'
            state.failed = true
          }
        }
        finally { busy = false }
      },
    })
    slots.set(key, { item, before: index > 0 ? options.key(source[index - 1]) : undefined, after: source[index + 1] ? options.key(source[index + 1]) : undefined, state, dispose: transaction.dispose })
  }
  return { displayItems, begin, get: (item: T) => slots.get(options.key(item))?.state }
}
