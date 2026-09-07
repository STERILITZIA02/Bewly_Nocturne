<script setup lang="ts">
import LazyPicture from './LazyPicture.vue'

withDefaults(defineProps<{
  src: string
  loading?: 'lazy' | 'eager'
  alt?: string
  aspectRatio?: string
}>(), {
  aspectRatio: '16 / 9',
})
</script>

<template>
  <LazyPicture :src="src" :loading="loading || 'lazy'" :alt="alt" :aspect-ratio="aspectRatio" />
</template>
