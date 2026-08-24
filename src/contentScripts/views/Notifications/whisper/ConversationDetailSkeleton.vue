<script setup lang="ts">
import ConversationTimelineSkeleton from './ConversationTimelineSkeleton.vue'

withDefaults(defineProps<{
  announce?: boolean
  compact?: boolean
  label: string
}>(), {
  announce: false,
  compact: false,
})
</script>

<template>
  <section class="conversation-detail-skeleton bew-shape-smooth-rect" aria-busy="true">
    <ConversationTimelineSkeleton
      :announce="announce"
      :compact="compact"
      :count="6"
      :label="label"
    />
  </section>
</template>

<style scoped lang="scss">
.conversation-detail-skeleton {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: var(--bew-space-3) var(--bew-space-4) var(--bew-space-4);
  overflow: hidden;
  background: var(--bew-elevated-alt);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);
  box-shadow: var(--bew-shadow-2), var(--bew-shadow-edge-glow-1);
  backdrop-filter: var(--bew-filter-glass-1);
  -webkit-backdrop-filter: var(--bew-filter-glass-1);
}
</style>
