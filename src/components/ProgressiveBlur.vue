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
  /** Fade paint layers, not their wrapper, so they can still sample content outside that wrapper. */
  visible?: boolean
  /** Closest ancestor containing all sampled paint. Used only by development diagnostics. */
  sampleWithin?: string
}>(), { visible: true })

const layers = computed(() => createProgressiveBlurLayers(props.edge, props.radius))

// Check each mount, including re-enabling glass. Walk through Shadow DOM hosts.
const rootRef = ref<HTMLElement | null>(null)
if (import.meta.env.DEV) {
  watch([rootRef, () => props.sampleWithin], ([root, selector]) => {
    if (!root)
      return
    const sample = selector ? root.parentElement?.closest(selector) : undefined
    const describe = (element: Element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${Array.from(element.classList, name => `.${name}`).join('')}`
    if (selector && !sample)
      console.warn(`[Bewly] ProgressiveBlur (${describe(root)}) sample boundary ${selector} is missing; checking all ancestors.`, root)
    let node: Element | null = root
    let containsSample = false
    while (node) {
      containsSample ||= node === sample
      const issue = getProgressiveBlurAncestorIssue(getComputedStyle(node), containsSample)
      if (issue) {
        console.warn(`[Bewly] ProgressiveBlur (${describe(root)}) blocked by ${issue} on ${describe(node)}; keep glass and rounded overflow clips on sibling layers.`, node)
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
