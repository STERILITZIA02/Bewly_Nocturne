<script setup lang="ts">
withDefaults(defineProps<{ direction?: 'up' | 'down' }>(), { direction: 'down' })
</script>

<template>
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
  >
    <path :d="direction === 'up' ? 'm6 14 6-6 6 6' : 'm6 10 6 6 6-6'" />
  </svg>
</template>
