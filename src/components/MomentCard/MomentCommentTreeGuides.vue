<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { CommentTreeLayoutNode } from '~/utils/commentTree'
import type { CommentTreeAnchor } from '~/utils/commentTreeGeometry'
import { buildCommentBranchPath } from '~/utils/commentTreeGeometry'

const props = defineProps<{ nodes: CommentTreeLayoutNode[] }>()
const svgRef = ref<SVGSVGElement>()
const paths = ref<string[]>([])
let observer: ResizeObserver | undefined
let frame: number | undefined

function updateGuides() {
  frame = undefined
  const thread = svgRef.value?.parentElement
  if (!thread?.isConnected)
    return
  const svg = svgRef.value!
  const rect = svg.getBoundingClientRect()
  if (!rect.width || !rect.height)
    return
  const scaleX = svg.clientWidth / rect.width
  const scaleY = svg.clientHeight / rect.height
  const anchors = new Map<string, CommentTreeAnchor>()
  thread.querySelectorAll<HTMLElement>('[data-comment-id]').forEach((item) => {
    const avatar = item.querySelector('.moment-comments__avatar')?.getBoundingClientRect()
    if (!avatar?.width || !avatar.height)
      return
    anchors.set(item.dataset.commentId!, {
      left: (avatar.left - rect.left) * scaleX,
      centerX: (avatar.left + avatar.width / 2 - rect.left) * scaleX,
      centerY: (avatar.top + avatar.height / 2 - rect.top) * scaleY,
      bottom: (avatar.bottom - rect.top) * scaleY,
    })
  })
  const radius = Number.parseFloat(getComputedStyle(thread).getPropertyValue('--bew-radius-lg'))
  const children = new Map<string, CommentTreeAnchor[]>()
  props.nodes.forEach((node) => {
    const anchor = anchors.get(node.id)
    if (!node.parentId || !anchor)
      return
    const siblings = children.get(node.parentId) ?? []
    siblings.push(anchor)
    children.set(node.parentId, siblings)
  })
  paths.value = [...children].flatMap(([id, childAnchors]) => {
    const parent = anchors.get(id)
    const path = parent && buildCommentBranchPath(parent, childAnchors, radius)
    return path ? [path] : []
  })
}

function scheduleUpdate() {
  if (frame === undefined)
    frame = requestAnimationFrame(updateGuides)
}

function observeLayout() {
  observer?.disconnect()
  const thread = svgRef.value?.parentElement
  if (!thread)
    return
  observer ??= new ResizeObserver(scheduleUpdate)
  observer.observe(thread)
  // A reply image can resize one row while the outer scroll area stays capped.
  thread.querySelectorAll('[data-comment-id]').forEach(item => observer!.observe(item))
  scheduleUpdate()
}

watch(() => props.nodes, observeLayout, { flush: 'post' })
onMounted(observeLayout)
onBeforeUnmount(() => {
  observer?.disconnect()
  if (frame !== undefined)
    cancelAnimationFrame(frame)
})
</script>

<template>
  <svg ref="svgRef" class="moment-comment-tree-guides" aria-hidden="true">
    <path v-for="(path, index) in paths" :key="index" :d="path" />
  </svg>
</template>

<style scoped lang="scss">
.moment-comment-tree-guides {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;

  path {
    fill: none;
    stroke: var(--bew-comment-tree-line-color);
    stroke-width: var(--bew-space-0-5);
    stroke-linecap: butt;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
}
</style>
