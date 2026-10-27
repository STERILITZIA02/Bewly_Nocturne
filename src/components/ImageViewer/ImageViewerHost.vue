<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

import { useImageViewerHost } from '~/composables/useImageViewer'

// Loaded on first use: most pages never open an image.
const ImageViewer = defineAsyncComponent(() => import('./ImageViewer.vue'))
const { request, open, index, close, release } = useImageViewerHost()
</script>

<template>
  <ImageViewer
    v-if="request"
    :key="request.id"
    v-model:index="index"
    :request="request"
    :open="open"
    @close="close"
    @closed="release"
  />
</template>
