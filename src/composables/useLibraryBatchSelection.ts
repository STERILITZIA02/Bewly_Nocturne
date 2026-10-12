import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

interface BatchOptions {
  keys: () => string[]
  captureOwner: () => { isCurrent: () => boolean }
  remove: (key: string) => Promise<boolean>
}

/** Only the currently loaded result set can be selected; paging never selects new rows. */
export function useLibraryBatchSelection(options: BatchOptions) {
  const managing = ref(false)
  const selected = shallowRef(new Set<string>())
  const busy = ref(false)
  const failed = ref(false)
  const keys = computed(() => [...new Set(options.keys())])
  const allSelected = computed(() => keys.value.length > 0 && keys.value.every(key => selected.value.has(key)))
  let generation = 0
  watch(keys, available => selected.value = new Set([...selected.value].filter(key => available.includes(key))))

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
  function toggle(key: string) {
    if (!managing.value || busy.value || !keys.value.includes(key))
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
        const remaining = new Set(selected.value)
        remaining.delete(key)
        selected.value = remaining
      }
    }
    catch {
      if (current())
        failed.value = true
    }
    finally {
      if (version === generation)
        busy.value = false
    }
  }
  onBeforeUnmount(reset)
  return { managing, selected, busy, failed, allSelected, clearSelection, reset, toggleManaging, toggle, toggleAll, removeSelected }
}
