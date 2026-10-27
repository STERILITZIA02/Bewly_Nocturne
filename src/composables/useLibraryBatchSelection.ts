import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

interface BatchOptions<Key extends string | number> {
  keys: () => Key[]
  captureOwner: () => { isCurrent: () => boolean }
  remove: (key: Key) => Promise<boolean>
  commit?: (keys: readonly Key[]) => void
}

/** Only the currently loaded result set can be selected; paging never selects new rows. */
export function useLibraryBatchSelection<Key extends string | number>(options: BatchOptions<Key>) {
  const managing = ref(false)
  const selected = shallowRef(new Set<Key>())
  const busy = ref(false)
  const failed = ref(false)
  const available = computed(() => new Set(options.keys()))
  const keys = computed(() => [...available.value])
  const allSelected = computed(() => keys.value.length > 0 && keys.value.every(key => selected.value.has(key)))
  let generation = 0
  function reconcileSelection() {
    if (busy.value)
      return
    const next = new Set([...selected.value].filter(key => available.value.has(key)))
    if (next.size !== selected.value.size)
      selected.value = next
  }
  watch([keys, busy], reconcileSelection, { flush: 'post' })

  function clearSelection() {
    selected.value = new Set()
    failed.value = false
  }
  function reset() {
    generation++
    managing.value = busy.value = false
    clearSelection()
  }
  function toggleManaging() {
    if (busy.value)
      return
    managing.value = !managing.value
    clearSelection()
  }
  function toggle(key: Key) {
    if (!managing.value || busy.value || !available.value.has(key))
      return
    const next = new Set(selected.value)
    if (next.has(key))
      next.delete(key)
    else
      next.add(key)
    selected.value = next
    failed.value = false
  }
  function toggleAll() {
    if (managing.value && !busy.value) {
      selected.value = new Set(allSelected.value ? [] : keys.value)
      failed.value = false
    }
  }
  async function removeSelected() {
    if (!managing.value || busy.value || !selected.value.size)
      return
    const targets = keys.value.filter(key => selected.value.has(key))
    const owner = options.captureOwner()
    const version = ++generation
    const current = () => version === generation && owner.isCurrent()
    busy.value = true
    failed.value = false
    const removedKeys: Key[] = []
    try {
      for (const key of targets) {
        if (!current())
          return
        const removed = await options.remove(key)
        if (!current())
          return
        if (!removed) {
          failed.value = true
          return
        }
        removedKeys.push(key)
      }
    }
    catch {
      if (current())
        failed.value = true
    }
    finally {
      if (current()) {
        options.commit?.(removedKeys)
        const remaining = new Set(selected.value)
        removedKeys.forEach(key => remaining.delete(key))
        selected.value = remaining
      }
      if (version === generation)
        busy.value = false
    }
  }
  onBeforeUnmount(reset)
  return { managing, selected, busy, failed, allSelected, clearSelection, reset, toggleManaging, toggle, toggleAll, removeSelected }
}
