<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUpdated, ref } from 'vue'

import { getMotionDuration } from '~/utils/motionTiming'

// Keep slot/DOM order intact. Each next item occupies the shortest column;
// existing items therefore keep their positions when a page is appended.
const root = ref<HTMLElement | null>(null)
let observer: ResizeObserver | undefined
let frame: number | undefined
const observed = new Set<HTMLElement>()
interface Cell { height: number, column: number, top: number, fullWidth: boolean }
const cells = new Map<HTMLElement, Cell>()
const dirty = new Set<HTMLElement>()
const animations = new Map<HTMLElement, Animation>()
let lastWidth = 0
let lastColumns = 0
let lastGap = 0
let lastChildren: HTMLElement[] = []

function layout(force = true) {
  const grid = root.value
  if (!grid || !grid.clientWidth)
    return
  const style = getComputedStyle(grid)
  // An old grid-column: 2 can create an implicit column after narrowing.
  // Read the intended column count from the responsive stylesheet instead.
  const columns = Math.max(1, Number.parseInt(style.getPropertyValue('--bew-masonry-columns')) || 1)
  const gap = Number.parseFloat(style.columnGap) || 0
  const resized = grid.clientWidth !== lastWidth || columns !== lastColumns || gap !== lastGap
  const origin = grid.getBoundingClientRect()
  const visible = (top: number, height: number) => origin.top + top + height > 0 && origin.top + top < window.innerHeight
  const before = new Map<HTMLElement, DOMRect>()
  const animateChanges = cells.size > 0 && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === false
  if (animateChanges) {
    for (const [child, cell] of cells) {
      if (child.isConnected && visible(cell.top, cell.height))
        before.set(child, child.getBoundingClientRect())
    }
  }
  for (const animation of animations.values())
    animation.cancel()
  animations.clear()
  const heights = Array.from({ length: columns }, () => 0)
  const children = Array.from(grid.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
  // Existing equal-width columns need no normalization or height read.
  for (const child of children) {
    const cell = cells.get(child)
    if (force || resized || !cell || cell.fullWidth !== child.hasAttribute('data-masonry-full-width')) {
      child.style.gridColumn = child.hasAttribute('data-masonry-full-width') ? '1 / -1' : String(Math.min(columns, cell?.column ?? 1))
      dirty.add(child)
    }
  }
  const measured = children.map(child => ({ child, height: dirty.has(child) ? Math.ceil(child.getBoundingClientRect().height) : cells.get(child)!.height, fullWidth: child.hasAttribute('data-masonry-full-width') }))
  dirty.clear()
  const changed: HTMLElement[] = []
  for (const { child, height, fullWidth } of measured) {
    const column = heights.indexOf(Math.min(...heights))
    const top = fullWidth ? Math.max(...heights) : heights[column]
    const previous = cells.get(child)
    if (!previous || previous.column !== column + 1 || previous.fullWidth !== fullWidth)
      child.style.gridColumn = fullWidth ? '1 / -1' : String(column + 1)
    if (!previous || previous.top !== top || previous.height !== height)
      child.style.gridRow = `${top + 1} / span ${Math.max(1, height)}`
    if (before.has(child) && visible(top, height))
      changed.push(child)
    cells.set(child, { height, column: column + 1, top, fullWidth })
    if (fullWidth)
      heights.fill(top + height + gap)
    else
      heights[column] = top + height + gap
  }
  lastWidth = grid.clientWidth
  lastColumns = columns
  lastGap = gap
  lastChildren = children
  // Read all destinations before writing animations; never replay old card entry.
  const destinations = changed.map(child => ({ child, rect: child.getBoundingClientRect() }))
  for (const { child, rect } of destinations) {
    const old = before.get(child)!
    const x = old.left - rect.left
    const y = old.top - rect.top
    if (!child.animate || (Math.abs(x) < 0.5 && Math.abs(y) < 0.5))
      continue
    const animation = child.animate([{ translate: `${x}px ${y}px` }, { translate: '0 0' }], {
      duration: getMotionDuration(style, '--bew-duration-normal'),
      easing: style.getPropertyValue('--bew-ease-standard').trim() || 'ease-out',
    })
    animations.set(child, animation)
    void animation.finished.catch(() => {}).then(() => {
      if (animations.get(child) === animation)
        animations.delete(child)
    })
  }
}

function scheduleLayout() {
  if (frame !== undefined)
    return
  frame = requestAnimationFrame(() => {
    frame = undefined
    layout(false)
  })
}

function syncChildren() {
  if (!root.value || !observer)
    return
  const children = new Set(Array.from(root.value.children).filter((node): node is HTMLElement => node instanceof HTMLElement))
  for (const child of observed) {
    if (!children.has(child)) {
      observer.unobserve(child)
      observed.delete(child)
      cells.delete(child)
      dirty.delete(child)
      animations.get(child)?.cancel()
      animations.delete(child)
    }
  }
  for (const child of children) {
    if (!observed.has(child)) {
      observer.observe(child)
      observed.add(child)
      dirty.add(child)
    }
  }
  const ordered = [...children]
  const style = getComputedStyle(root.value)
  const columns = Math.max(1, Number.parseInt(style.getPropertyValue('--bew-masonry-columns')) || 1)
  const gap = Number.parseFloat(style.columnGap) || 0
  if (columns !== lastColumns || gap !== lastGap || dirty.size || ordered.length !== lastChildren.length || ordered.some((child, index) => child !== lastChildren[index] || cells.get(child)?.fullWidth !== child.hasAttribute('data-masonry-full-width')))
    scheduleLayout()
}

onMounted(() => {
  if (!root.value || typeof ResizeObserver === 'undefined')
    return
  observer = new ResizeObserver((entries) => {
    let changed = false
    for (const entry of entries) {
      if (entry.target === root.value) {
        changed ||= root.value.clientWidth !== lastWidth
      }
      else if (entry.target instanceof HTMLElement) {
        const block = entry.borderBoxSize?.[0]?.blockSize
        if (block === undefined || Math.ceil(block) !== cells.get(entry.target)?.height) {
          dirty.add(entry.target)
          changed = true
        }
      }
    }
    if (changed)
      scheduleLayout()
  })
  observer.observe(root.value)
  root.value.classList.add('bew-masonry-grid--measured')
  syncChildren()
})
onUpdated(syncChildren)
onBeforeUnmount(() => {
  observer?.disconnect()
  observed.clear()
  cells.clear()
  for (const animation of animations.values())
    animation.cancel()
  animations.clear()
  if (frame !== undefined)
    cancelAnimationFrame(frame)
})
defineExpose({ layout })
</script>

<template>
  <div ref="root" class="bew-masonry-grid">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.bew-masonry-grid--measured {
  grid-auto-rows: 1px;
  row-gap: 0;
  align-items: start;
}
</style>
