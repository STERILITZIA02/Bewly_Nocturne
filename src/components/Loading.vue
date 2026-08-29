<script setup lang="ts">
import PageLoadingIndicator from '~/components/PageLoadingIndicator.vue'
</script>

<template>
  <div class="loading-container">
    <PageLoadingIndicator :label="$t('common.loading')" />
  </div>
</template>

<style scoped lang="scss">
.loading-container {
  display: flex;
  width: 100%;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  padding: var(--bew-space-8) 0;
  box-sizing: border-box;
}
</style>
