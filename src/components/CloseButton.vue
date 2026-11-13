<script setup lang="ts">
import IconButton from '~/components/IconButton.vue'

// `plain`: a bare × in a window or card corner. `floating`: over embedded
// content (a page or a video), which a bare × could vanish into. `overlay`:
// the image viewer's dark media room. No border in any state (user-specified).
const props = withDefaults(defineProps<{
  label: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'plain' | 'floating' | 'overlay'
}>(), {
  size: 'md',
  variant: 'plain',
})
</script>

<template>
  <IconButton
    :variant="props.variant"
    :size="props.size"
    :shape="props.variant === 'overlay' ? 'circle' : 'smooth-rect'"
    :label="props.label"
  >
    <span class="i-tabler:x" aria-hidden="true" />
  </IconButton>
</template>
