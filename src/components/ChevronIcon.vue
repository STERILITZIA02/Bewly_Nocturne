<script setup lang="ts">
withDefaults(defineProps<{ direction?: 'up' | 'down' | 'left' | 'right' }>(), { direction: 'down' })

const paths = {
  up: 'm6 14 6-6 6 6',
  down: 'm6 10 6 6 6-6',
  left: 'm15.5 4.5-8 7.5 8 7.5',
  right: 'm8.5 4.5 8 7.5-8 7.5',
}
</script>

<template>
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
  >
    <path :d="paths[direction]" />
  </svg>
</template>
