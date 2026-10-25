<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div class="moment-read-marker" role="note">
    {{ label }}
  </div>
</template>

<style scoped>
.moment-read-marker {
  padding: var(--bew-space-1) var(--bew-space-2);
  color: var(--bew-text-2);
  background: var(--bew-fill-1);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
</style>
