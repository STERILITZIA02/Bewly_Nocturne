<script setup lang="ts">
import type { NotificationView } from '../notificationSections'
import NotificationsNavigation from './NotificationsNavigation.vue'

defineProps<{
  view: NotificationView
}>()

const emit = defineEmits<{
  (event: 'select', view: NotificationView): void
  (event: 'navigationWidthChange', width: number): void
}>()
</script>

<template>
  <header class="notifications-page-header">
    <NotificationsNavigation
      :model-value="view"
      @update:model-value="emit('select', $event)"
      @width-change="emit('navigationWidthChange', $event)"
    />
  </header>
</template>

<style scoped lang="scss">
.notifications-page-header {
  display: flex;
  width: 100%;
  min-width: 0;
}
</style>
