import type { ObjectDirective } from 'vue'

interface MetaRow { children: HTMLElement[], signature: string }
const rows = new Map<HTMLElement, MetaRow>()
const dirty = new Set<HTMLElement>()
let observer: ResizeObserver | undefined
let frame: number | undefined

function flush() {
  frame = undefined
  const writes: [HTMLElement, boolean][] = []
  for (const row of dirty) {
    const width = row.clientWidth
    if (!row.isConnected || !width)
      continue
    const children = rows.get(row)?.children ?? []
    const top = children[0]?.offsetTop
    let overflow = false
    for (const child of children) {
      overflow ||= child.offsetTop !== top || child.offsetWidth > width || child.scrollWidth > child.clientWidth
      writes.push([child, overflow])
    }
  }
  dirty.clear()
  // Visibility preserves intrinsic geometry, so no reveal/read/hide feedback loop is needed.
  for (const [child, hidden] of writes) {
    if (child.style.visibility !== (hidden ? 'hidden' : ''))
      child.style.visibility = hidden ? 'hidden' : ''
  }
}
function schedule(row: HTMLElement) {
  dirty.add(row)
  if (frame === undefined)
    frame = requestAnimationFrame(flush)
}
function fontsChanged() {
  rows.forEach((_state, row) => schedule(row))
}
export const vWholeMeta: ObjectDirective<HTMLElement, string> = {
  mounted(row, binding) {
    if (!observer) {
      observer = new ResizeObserver(entries => entries.forEach(entry => schedule(entry.target as HTMLElement)))
      document.fonts?.addEventListener('loadingdone', fontsChanged)
    }
    rows.set(row, { children: Array.from(row.children) as HTMLElement[], signature: `${binding.value}:${row.textContent}` })
    observer.observe(row)
    schedule(row)
  },
  updated(row, binding) {
    const state = rows.get(row)
    const children = Array.from(row.children) as HTMLElement[]
    const signature = `${binding.value}:${row.textContent}`
    if (!state || signature !== state.signature || children.length !== state.children.length || children.some((child, index) => child !== state.children[index])) {
      rows.set(row, { children, signature })
      schedule(row)
    }
  },
  beforeUnmount(row) {
    rows.delete(row)
    dirty.delete(row)
    observer?.unobserve(row)
    if (!rows.size) {
      observer?.disconnect()
      observer = undefined
      document.fonts?.removeEventListener('loadingdone', fontsChanged)
      if (frame !== undefined)
        cancelAnimationFrame(frame)
      frame = undefined
    }
  },
}
