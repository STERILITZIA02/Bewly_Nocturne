<script setup lang="ts">
import ProgressiveBlur from '~/components/ProgressiveBlur.vue'

defineProps<{
  enabled: boolean
}>()
</script>

<template>
  <div
    class="bew-panel-top-blur"
    :class="{ 'bew-panel-top-blur--disabled': !enabled }"
    aria-hidden="true"
  >
    <!-- Light 3px gradient blur under the panel header; no single masked layer. -->
    <ProgressiveBlur v-if="enabled" class="bew-panel-top-blur__layers" edge="top" radius="3px" />
  </div>
</template>

<style scoped lang="scss">
.bew-panel-top-blur {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  z-index: 0;
  height: 100%;
  border-radius: inherit;
  corner-shape: inherit;
  pointer-events: none;
}

.bew-panel-top-blur__layers {
  inset: 0;
  border-radius: inherit;
  corner-shape: inherit;
}
</style>
