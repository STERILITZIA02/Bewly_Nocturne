<script setup lang="ts">
import PageAsyncLoading from '~/components/PageAsyncLoading.vue'

const FavoritesPage = defineAsyncComponent({
  loader: () => import('./FavoritesPage.vue'),
  loadingComponent: PageAsyncLoading,
  delay: 120,
})
</script>

<template>
  <FavoritesPage />
</template>
