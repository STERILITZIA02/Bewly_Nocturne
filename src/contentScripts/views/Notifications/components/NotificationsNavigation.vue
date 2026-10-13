<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import LibrarySidebarHeading from '~/components/LibrarySidebarHeading.vue'
import { useTopBarStore } from '~/stores/topBarStore'

import type { NotificationSectionDefinition, NotificationView } from '../notificationSections'
import { isNotificationView, NOTIFICATION_SECTIONS } from '../notificationSections'

defineProps<{ modelValue: NotificationView }>()
const emit = defineEmits<{ (event: 'update:modelValue', view: NotificationView): void }>()
const { t } = useI18n()
const topBarStore = useTopBarStore()

function unreadCount(section: NotificationSectionDefinition): number {
  switch (section.unreadSource) {
    case 'dm':
      return (topBarStore.unReadDm.follow_unread || 0) + (topBarStore.unReadDm.unfollow_unread || 0)
    case 'reply':
      return topBarStore.unReadMessage.reply || 0
    case 'at':
      return topBarStore.unReadMessage.at || 0
    case 'like':
      return Math.max(topBarStore.unReadMessage.like || 0, (topBarStore.unReadMessage as { recv_like?: number }).recv_like || 0)
    case 'system':
      return topBarStore.unReadMessage.sys_msg || 0
    default:
      return 0
  }
}

const items = computed(() => NOTIFICATION_SECTIONS.map((section) => {
  const label = t(section.labelKey)
  const badge = unreadCount(section)
  return {
    value: section.id,
    label,
    badge,
    ariaLabel: `${t('notifications.section_aria', { section: label })}${badge > 0 ? `, ${t('notifications.unread_count', { count: badge })}` : ''}`,
  }
}))

function select(value: string) {
  if (isNotificationView(value))
    emit('update:modelValue', value)
}
</script>

<template>
  <nav class="notifications-navigation" :aria-label="t('notifications.navigation_aria')">
    <LibrarySidebarHeading
      :model-value="modelValue"
      :options="items"
      :title="t('notifications.navigation_aria')"
      content-id="notifications-outlet"
      hide-title
      @update:model-value="select"
    />
  </nav>
</template>

<style scoped lang="scss">
.notifications-navigation {
  width: 100%;
  min-width: 0;
  height: var(--bew-sidebar-heading-height);
  box-sizing: border-box;
}
.notifications-navigation :deep(.library-sidebar-heading) {
  // Library rails supply inline padding; the message rail has none.
  margin-inline: 0;
}
</style>
