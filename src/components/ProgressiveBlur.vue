<script setup lang="ts">
import { settings } from '~/logic'
import type { ProgressiveBlurEdge } from '~/utils/progressiveBlur'
import { createProgressiveBlurLayers, getProgressiveBlurAncestorIssue } from '~/utils/progressiveBlur'

// The only gradient-blur primitive: never fade a single backdrop blur with a mask.
// Position and size come from the parent (class/style fall through to the root).
const props = withDefaults(defineProps<{
  edge: ProgressiveBlurEdge
  /** CSS length at the strongest point; defaults to the global frosted-glass radius. */
  radius?: string
  /** Fades the layers themselves (over `--bew-progressive-blur-fade`, default fast): an ancestor with opacity < 1 would stop the blur. */
  visible?: boolean
}>(), { visible: true })

const layers = computed(() => createProgressiveBlurLayers(props.edge, props.radius))

// Check each mount, including re-enabling glass. Walk through Shadow DOM hosts.
const rootRef = ref<HTMLElement | null>(null)
if (import.meta.env.DEV) {
  watch(rootRef, (root) => {
    let node: Element | null = root
    while (node) {
      const issue = getProgressiveBlurAncestorIssue(getComputedStyle(node))
      if (issue) {
        console.warn(`[Bewly] ProgressiveBlur blocked by ${issue}; keep glass and rounded overflow clips on sibling layers.`, node)
        return
      }
      node = node.parentElement ?? ((node.getRootNode() as ShadowRoot).host ?? null)
    }
  }, { flush: 'post' })
}
</script>

<template>
  <div v-if="!settings.disableFrostedGlass" ref="rootRef" class="bew-progressive-blur" aria-hidden="true">
    <div
      v-for="(layer, index) in layers" :key="index"
      class="bew-progressive-blur__layer" :class="{ 'is-hidden': !visible }" :style="layer"
    />
  </div>
</template>

<style scoped>
/* Zero-specificity default; the parent's own class sets position and size. */
:where(.bew-progressive-blur) {
  position: absolute;
}

.bew-progressive-blur {
  pointer-events: none;
}

.bew-progressive-blur__layer {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  corner-shape: inherit;
  transition: opacity var(--bew-progressive-blur-fade, var(--bew-duration-fast)) var(--bew-ease-standard);
}

.bew-progressive-blur__layer.is-hidden {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .bew-progressive-blur__layer {
    transition: none;
  }
}
</style>
