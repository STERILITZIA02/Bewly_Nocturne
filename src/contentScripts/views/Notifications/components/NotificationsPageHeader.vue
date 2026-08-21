<script setup lang="ts">
import type { NotificationView } from '../notificationSections'
import NotificationsNavigation from './NotificationsNavigation.vue'

defineProps<{
  view: NotificationView
}>()

const emit = defineEmits<{
  (event: 'select', view: NotificationView): void
}>()
</script>

<template>
  <header class="notifications-page-header">
    <NotificationsNavigation
      :model-value="view"
      @update:model-value="emit('select', $event)"
    />
  </header>
</template>

<style scoped lang="scss">
.notifications-page-header {
  display: flex;
  min-width: 0;
}
</style>
