<script setup lang="ts" generic="T">
import type { MasonryWindowSnapshot } from '~/utils/momentColumnIndex'
import { createMomentColumnIndex } from '~/utils/momentColumnIndex'
import { getScrollIntent } from '~/utils/scrollIntent'
import { invalidateViewportGeometry, readViewportGeometry, subscribeViewportFrame } from '~/utils/viewportGeometry'

const props = defineProps<{ items: T[], itemKey: (item: T) => string, viewport: HTMLElement | null, active: boolean, snapshot?: MasonryWindowSnapshot }>()
const emit = defineEmits<{ snapshot: [state: MasonryWindowSnapshot] }>()
const root = ref<HTMLElement>()
const visible = shallowRef<Array<{ key: string, index: number, column: number, top: number, height: number }>>([])
const totalHeight = ref(0)
const columnWidth = ref(0)
const heights = new Map<string, number>()
const positions = new Map<string, number>()
const elements = new Map<string, HTMLElement>()
let columns: string[][] = []
let columnCount = 1
let gap = 12
let width = 0
let layoutVersion = 0
let source: T[] | undefined
let count = 0
let focusKey = ''
let observer: ResizeObserver | undefined
let restored = false
const heightOf = (key: string) => heights.get(key) ?? 300
const index = createMomentColumnIndex((key: string) => key, heightOf, () => gap)

function syncItems(rebuild = false) {
  const replaced = rebuild || source !== props.items || count > props.items.length
  if (replaced) {
    columns = Array.from({ length: columnCount }, () => [] as string[])
    positions.clear()
    count = 0
    source = props.items
    layoutVersion++
  }
  index.sync(columns, layoutVersion)
  const totals = columns.map(column => index.stackHeight(column) ?? 0)
  for (; count < props.items.length; count++) {
    const key = props.itemKey(props.items[count])
    const column = totals.indexOf(Math.min(...totals))
    positions.set(key, count)
    columns[column].push(key)
    totals[column] += heightOf(key) + gap
  }
  index.sync(columns, layoutVersion)
  if (replaced) {
    for (const key of heights.keys()) {
      if (!positions.has(key))
        heights.delete(key)
    }
  }
  totalHeight.value = Math.max(0, ...columns.map(column => index.stackHeight(column) ?? 0))
}

function updateWindow() {
  const viewport = props.viewport
  const grid = root.value
  if (!viewport || !grid || !props.active || document.hidden)
    return
  const geometry = readViewportGeometry(viewport)
  const offset = geometry.top - grid.getBoundingClientRect().top
  const windows = index.window(offset - geometry.clientHeight, offset + 2 * geometry.clientHeight, new Set(focusKey ? [focusKey] : []))
  const next = windows.flatMap((window, column) => window.items.map(key => ({
    key,
    index: positions.get(key)!,
    column,
    top: index.offsetOf(key)!,
    height: heightOf(key),
  }))).sort((left, right) => left.index - right.index)
  if (next.length !== visible.value.length || next.some((cell, position) => {
    const previous = visible.value[position]
    return cell.key !== previous.key || cell.index !== previous.index || cell.column !== previous.column || cell.top !== previous.top || cell.height !== previous.height
  })) {
    visible.value = next
  }
}

function layout() {
  if (!root.value)
    return
  const nextWidth = root.value.clientWidth
  const style = getComputedStyle(root.value)
  const nextColumns = Number.parseInt(style.getPropertyValue('--bew-masonry-columns')) || 1
  const nextGap = Number.parseFloat(style.columnGap) || 0
  if (!restored) {
    restored = true
    const snapshot = props.snapshot
    if (snapshot && snapshot.width === nextWidth && snapshot.gap === nextGap && snapshot.columns.length === nextColumns
      && snapshot.keys.length === props.items.length && snapshot.keys.every((key, position) => key === props.itemKey(props.items[position]))) {
      width = nextWidth
      gap = nextGap
      columnCount = nextColumns
      columnWidth.value = (width - gap * (columnCount - 1)) / columnCount
      source = props.items
      count = props.items.length
      columns = snapshot.columns.map(column => column.slice())
      snapshot.keys.forEach((key, position) => positions.set(key, position))
      snapshot.heights.forEach(([key, height]) => heights.set(key, height))
    }
  }
  const resized = nextWidth !== width || nextColumns !== columnCount || nextGap !== gap
  if (resized) {
    width = nextWidth
    columnCount = nextColumns
    gap = nextGap
    columnWidth.value = (width - gap * (columnCount - 1)) / columnCount
    heights.clear()
  }
  syncItems(resized)
  updateWindow()
}

function itemOffset(key: string) {
  const offset = index.offsetOf(key)
  const viewport = props.viewport
  if (offset === undefined || !viewport || !root.value)
    return undefined
  const geometry = readViewportGeometry(viewport)
  return geometry.scrollTop + root.value.getBoundingClientRect().top - geometry.top + offset
}

function setElement(key: string, value: unknown) {
  const previous = elements.get(key)
  if (previous === value)
    return
  if (previous)
    observer?.unobserve(previous)
  if (value instanceof HTMLElement) {
    elements.set(key, value)
    observer?.observe(value)
  }
  else {
    elements.delete(key)
  }
}

function updateFocus() {
  const owner = root.value?.getRootNode() as Document | ShadowRoot | undefined
  const active = owner?.activeElement?.closest<HTMLElement>('[data-masonry-key]')
  focusKey = active && root.value?.contains(active) ? active.dataset.masonryKey! : ''
  updateWindow()
}

function clearFocus() {
  void nextTick(updateFocus)
}

onMounted(() => {
  observer = new ResizeObserver((entries) => {
    const viewport = props.viewport
    if (!viewport || !props.active)
      return
    if (root.value!.clientWidth !== width) {
      layout()
      return
    }
    const geometry = readViewportGeometry(viewport)
    const gridTop = root.value!.getBoundingClientRect().top
    const anchor = visible.value.find(item => gridTop + item.top + item.height > geometry.top)
    const previousTop = anchor && index.offsetOf(anchor.key)
    const scrollTop = viewport.scrollTop
    let changed = false
    for (const entry of entries) {
      if (entry.target === root.value)
        continue
      const key = (entry.target as HTMLElement).dataset.masonryKey!
      const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height
      if (height > 0 && Math.abs(heightOf(key) - height) >= 0.5) {
        heights.set(key, height)
        index.updateHeight(key, height)
        changed = true
      }
    }
    if (!changed)
      return
    totalHeight.value = Math.max(0, ...columns.map(column => index.stackHeight(column) ?? 0))
    updateWindow()
    if (anchor && previousTop !== undefined && scrollTop > 0 && !getScrollIntent(viewport).active) {
      const adjustment = index.offsetOf(anchor.key)! - previousTop
      void nextTick(() => {
        if (root.value?.isConnected && props.active && viewport.scrollTop === scrollTop && !getScrollIntent(viewport).active)
          viewport.scrollTop += adjustment
      })
    }
  })
  observer.observe(root.value!)
  for (const element of elements.values())
    observer.observe(element)
  layout()
})

watch(() => [props.items, props.items.length], () => {
  if (root.value) {
    syncItems()
    updateWindow()
  }
}, { flush: 'post' })
watch(() => [props.viewport, props.active] as const, ([viewport, active], _previous, cleanup) => {
  if (!viewport || !active)
    return
  cleanup(subscribeViewportFrame(viewport, (_geometry, reason) => reason === 'layout' ? layout() : updateWindow()))
  invalidateViewportGeometry(viewport)
}, { immediate: true, flush: 'post' })
onBeforeUnmount(() => {
  observer?.disconnect()
  if (source === props.items && count === props.items.length)
    emit('snapshot', { width, gap, keys: [...positions.keys()], columns, heights: [...heights] })
})
defineExpose({ layout, itemOffset })
</script>

<template>
  <div ref="root" class="bew-masonry-window" :style="{ height: `${totalHeight}px` }" @focusin="updateFocus" @focusout="clearFocus">
    <div
      v-for="cell in visible" :key="cell.key" :ref="element => setElement(cell.key, element)"
      :data-masonry-key="cell.key" class="bew-masonry-window__cell"
      :style="{ width: `${columnWidth}px`, left: `${cell.column * (columnWidth + gap)}px`, transform: `translateY(${cell.top}px)` }"
    >
      <slot :item="items[cell.index]" />
    </div>
  </div>
</template>

<style scoped>
.bew-masonry-window {
  position: relative;
  overflow-anchor: none;
}
.bew-masonry-window__cell {
  position: absolute;
  top: 0;
  display: flow-root;
  min-width: 0;
  align-self: start;
}
</style>
