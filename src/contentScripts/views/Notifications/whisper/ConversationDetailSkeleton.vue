<script setup lang="ts">
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
  <section class="conversation-detail-skeleton" aria-busy="true" :role="announce ? 'status' : undefined" :aria-label="announce ? label : undefined">
    <!-- Keep the unread conversation transparent until its real history arrives. -->
    <span class="sr-only">{{ label }}</span>
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
  background: transparent;
}
</style>
