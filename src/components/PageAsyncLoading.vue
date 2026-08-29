<script setup lang="ts">
import PageLoadingIndicator from '~/components/PageLoadingIndicator.vue'
</script>

<template>
  <div class="bew-page-async-loading">
    <PageLoadingIndicator :announce="false" />
  </div>
</template>

<style scoped lang="scss">
.bew-page-async-loading {
  display: flex;
  width: 100%;
  min-height: 240px;
  align-items: center;
  justify-content: center;
}
</style>
