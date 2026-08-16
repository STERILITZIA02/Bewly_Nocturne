<script setup lang="ts">
import { getExtensionAssetUrl } from '~/utils/messaging'

const props = defineProps<{
  description?: string
}>()

const emptyImg = getExtensionAssetUrl('/assets/empty.png')
</script>

<template>
  <div flex="~ col gap-4" justify="center" items="center">
    <img v-if="emptyImg" :src="emptyImg" w="200px" h="auto">
    <span v-if="props.description" text="$bew-text-3">{{ props.description }}</span>
    <slot />
  </div>
</template>
