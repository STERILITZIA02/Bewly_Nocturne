import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'

interface BatchOptions {
  visibleIds: () => number[]
  captureOwner: () => { isCurrent: () => boolean }
  remove: (aid: number) => Promise<boolean>
}

/** Selection belongs to this page; all writes retain the existing account owner. */
export function useWatchLaterBatch(options: BatchOptions) {
  const managing = ref(false)
  const selected = shallowRef(new Set<number>())
  const busy = ref(false)
  const failed = ref(false)
  let generation = 0
  const allSelected = computed(() => options.visibleIds().length > 0 && options.visibleIds().every(id => selected.value.has(id)))

  watch(options.visibleIds, (ids) => {
    const available = new Set(ids)
    selected.value = new Set([...selected.value].filter(id => available.has(id)))
  })

  function clearSelection() {
    selected.value = new Set()
    failed.value = false
  }
  function reset() {
    generation++
    busy.value = managing.value = false
    clearSelection()
  }
  function toggleManaging() {
    if (busy.value)
      return
    managing.value = !managing.value
    clearSelection()
  }
  function toggle(aid: number) {
    if (!managing.value || busy.value || !options.visibleIds().includes(aid))
      return
    const next = new Set(selected.value)
    if (next.has(aid))
      next.delete(aid)
    else
      next.add(aid)
    selected.value = next
    failed.value = false
  }
  function toggleAll() {
    if (!managing.value || busy.value)
      return
    selected.value = new Set(allSelected.value ? [] : options.visibleIds())
    failed.value = false
  }
  async function removeSelected() {
    if (!managing.value || busy.value || !selected.value.size)
      return
    const ids = options.visibleIds().filter(id => selected.value.has(id))
    const owner = options.captureOwner()
    const operation = ++generation
    const isCurrent = () => operation === generation && owner.isCurrent()
    busy.value = true
    failed.value = false
    try {
      for (const aid of ids) {
        if (!isCurrent())
          return
        const removed = await options.remove(aid)
        if (!isCurrent())
          return
        if (!removed) {
          failed.value = true
          return
        }
        const remaining = new Set(selected.value)
        remaining.delete(aid)
        selected.value = remaining
      }
    }
    catch {
      if (isCurrent())
        failed.value = true
    }
    finally {
      if (operation === generation)
        busy.value = false
    }
  }
  onBeforeUnmount(reset)
  return { managing, selected, busy, failed, allSelected, toggleManaging, toggle, toggleAll, clearSelection, reset, removeSelected }
}
