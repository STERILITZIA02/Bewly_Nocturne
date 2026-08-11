<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { AppPage } from '~/enums/appEnums'
import { settings } from '~/logic'
import { useSettingsStore } from '~/stores/settingsStore'
import type { NotificationNavigationTarget, NotificationSection } from '~/utils/notificationRoute'
import { resolveNotificationHref } from '~/utils/notificationRoute'

interface UnreadMessageState {
  reply?: number
  at?: number
  like?: number
  recv_like?: number
  sys_msg?: number
}

interface UnreadDmState {
  follow_unread?: number
  unfollow_unread?: number
  support_group_unread?: number
}

interface NotificationPopItem extends NotificationNavigationTarget {
  name: string
  unreadCount: number
  icon: string
}

const props = defineProps<{
  unReadMessage?: UnreadMessageState
  unReadDm?: UnreadDmState
}>()

const emit = defineEmits<{
  (e: 'itemClick', item: NotificationNavigationTarget): void
}>()

const { t } = useI18n()
const settingsStore = useSettingsStore()
const useOriginalPage = computed(() => settingsStore.getDockItemIsUseOriginalBiliPage(AppPage.Notifications))

function getNotificationHref(section: NotificationSection) {
  return resolveNotificationHref(section, {
    openAsDrawer: settings.value.openNotificationsPageAsDrawer,
    useOriginalPage: useOriginalPage.value,
  })
}

const list = computed<NotificationPopItem[]>(() => [
  {
    section: 'reply',
    name: t('topbar.noti_dropdown.replys'),
    url: getNotificationHref('reply'),
    unreadCount: props.unReadMessage?.reply ?? 0,
    icon: 'i-solar:reply-2-bold-duotone',
  },
  {
    section: 'at',
    name: t('topbar.noti_dropdown.mentions'),
    url: getNotificationHref('at'),
    unreadCount: props.unReadMessage?.at ?? 0,
    icon: 'i-solar:mention-circle-bold-duotone',
  },
  {
    section: 'love',
    name: t('topbar.noti_dropdown.likes'),
    url: getNotificationHref('love'),
    unreadCount: Math.max(props.unReadMessage?.like ?? 0, props.unReadMessage?.recv_like ?? 0),
    icon: 'i-solar:like-bold-duotone',
  },
  {
    section: 'system',
    name: t('topbar.noti_dropdown.messages'),
    url: getNotificationHref('system'),
    unreadCount: props.unReadMessage?.sys_msg ?? 0,
    icon: 'i-solar:chat-line-bold-duotone',
  },
  {
    section: 'whisper',
    name: t('topbar.noti_dropdown.chats'),
    url: getNotificationHref('whisper'),
    unreadCount: (props.unReadDm?.follow_unread ?? 0)
      + (props.unReadDm?.unfollow_unread ?? 0)
      + (props.unReadDm?.support_group_unread ?? 0),
    icon: 'i-solar:chat-round-bold-duotone',
  },
])

function handleClick(item: NotificationPopItem) {
  emit('itemClick', { section: item.section, url: item.url })
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
      :key="item.section"
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
