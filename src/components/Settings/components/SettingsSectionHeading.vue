<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <header class="settings-section-heading" :data-settings-title="title">
    <h2>{{ title }}</h2>
  </header>
</template>

<style lang="scss" scoped>
// The open page's title (user-specified, after Claude Code): plain type at
// the top of the page column, the page's groups below it.
.settings-section-heading {
  margin-bottom: var(--bew-space-6);
}

h2 {
  margin: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-heading);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-heading);
}
</style>
