<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { NotificationSectionDefinition } from '~/contentScripts/views/Notifications/notificationSections'
import { TOP_BAR_NOTIFICATION_SECTIONS } from '~/contentScripts/views/Notifications/notificationSections'
import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { useSettingsStore } from '~/stores/settingsStore'
import { resolveNotificationNavigationUrl } from '~/utils/notificationRoute'

interface NotificationPopItem {
  name: string
  url: string
  unreadCount: number
  icon: string
}

const props = defineProps<{
  unReadMessage?: Record<string, number>
  unReadDm?: Record<string, number>
}>()

const emit = defineEmits<{
  (event: 'itemClick', item: NotificationPopItem): void
}>()

const { t } = useI18n()
const settingsStore = useSettingsStore()

function unreadCount(section: NotificationSectionDefinition): number {
  switch (section.unreadSource) {
    case 'dm':
      return (props.unReadDm?.follow_unread || 0) + (props.unReadDm?.unfollow_unread || 0)
    case 'reply':
      return props.unReadMessage?.reply || 0
    case 'at':
      return props.unReadMessage?.at || 0
    case 'like':
      return Math.max(props.unReadMessage?.like || 0, props.unReadMessage?.recv_like || 0)
    case 'system':
      return props.unReadMessage?.sys_msg || 0
    default:
      return 0
  }
}

const list = computed<NotificationPopItem[]>(() => TOP_BAR_NOTIFICATION_SECTIONS.map(section => ({
  name: t(section.labelKey),
  url: resolveNotificationNavigationUrl(section.id, {
    openAsDrawer: settings.value.openNotificationsPageAsDrawer,
    useOriginalPage: settingsStore.getDockItemIsUseOriginalBiliPage(AppPage.Notifications),
  }),
  unreadCount: unreadCount(section),
  icon: section.icon,
})))

function handleClick(item: NotificationPopItem) {
  emit('itemClick', item)
}
</script>

<template>
  <div
    style="backdrop-filter: var(--bew-filter-glass-1);"
    bg="$bew-elevated"
    p="4"
    rounded="$bew-radius"
    shadow="[var(--bew-shadow-edge-glow-1),var(--bew-shadow-3)]"
    border="1 $bew-surface-border-color"
    flex="~ col"
    class="notifications-pop bew-popover"
    data-key="notifications"
  >
    <ALink
      v-for="item in list"
      :key="item.url"
      :href="item.url"
      type="topBar"
      pos="relative"
      flex="~ items-center justify-between gap-2"
      p="x-4 y-2"
      bg="hover:$bew-fill-2"
      rounded="$bew-radius"
      transition="background-color duration-200, color duration-200, opacity duration-200"
      m="b-1 last:b-0"
      :custom-click-event="settings.openNotificationsPageAsDrawer"
      @click="handleClick(item)"
    >
      <div flex="~ items-center gap-2">
        <i :class="item.icon" text="$bew-text-2" />
        <span flex="1 shrink-0" text-nowrap>{{ item.name }}</span>
      </div>
      <!-- Use visibility to control the number of notifications to prevent width changes as soon as there is a number -->
      <div
        :style="{ visibility: item.unreadCount > 0 ? 'visible' : 'hidden' }"
        bg="$bew-theme-color"
        rounded="$bew-radius"
        text="$bew-on-theme-color xs leading-none center"
        grid="~ place-items-center"
        px-1
        min-w="16px"
        h="16px"
      >
        {{ item.unreadCount > 99 ? '99+' : item.unreadCount }}
      </div>
    </ALink>
  </div>
</template>
