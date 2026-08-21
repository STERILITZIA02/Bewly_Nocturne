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

function notificationBadgeWidth(count: number): string {
  if (count > 99)
    return '28px'
  if (count > 9)
    return '22px'
  return '18px'
}
</script>

<template>
  <div
    class="notifications-pop bew-popover bew-popover-surface"
    data-key="notifications"
  >
    <div class="bew-popover__scroll bew-popover__compact-list notifications-pop__list">
      <ALink
        v-for="item in list"
        :key="item.url"
        :href="item.url"
        type="topBar"
        class="bew-popover-row notifications-pop__row"
        :custom-click-event="settings.openNotificationsPageAsDrawer"
        @click="handleClick(item)"
      >
        <div class="notifications-pop__label">
          <i :class="item.icon" />
          <span>{{ item.name }}</span>
        </div>
        <Transition name="notification-badge">
          <span
            v-if="item.unreadCount > 0"
            class="notification-pop__badge"
            :style="{ width: notificationBadgeWidth(item.unreadCount) }"
          >
            {{ item.unreadCount > 99 ? '99+' : item.unreadCount }}
          </span>
        </Transition>
      </ALink>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.notifications-pop {
  width: 190px;
  max-height: min(360px, var(--bew-popover-max-height));
}

.notifications-pop__list {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
}

.notifications-pop__row {
  justify-content: space-between;
  gap: var(--bew-space-2);
}

.notifications-pop__label {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--bew-space-2);
  white-space: nowrap;
}

.notifications-pop__label i {
  flex: 0 0 auto;
  color: var(--bew-text-2);
}

.notification-pop__badge {
  display: grid;
  flex: 0 0 auto;
  height: 18px;
  max-width: 28px;
  place-items: center;
  overflow: hidden;
  color: var(--bew-on-theme-color);
  background: var(--bew-theme-color);
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
  font-size: var(--bew-font-size-caption);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
  transition:
    width var(--bew-duration-fast) var(--bew-ease-standard),
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    transform var(--bew-duration-fast) var(--bew-ease-emphasized);
}

.notification-badge-enter-from,
.notification-badge-leave-to {
  width: 0 !important;
  opacity: 0;
  transform: scale(0.8);
}
</style>
