<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useTopBarStore } from '~/stores/topBarStore'

import type { NotificationSectionDefinition, NotificationView } from '../notificationSections'
import { NOTIFICATION_SECTIONS } from '../notificationSections'

defineProps<{
  modelValue: NotificationView
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', view: NotificationView): void
  (event: 'openSettings'): void
}>()

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
</script>

<template>
  <nav class="notifications-navigation" :aria-label="t('notifications.navigation_aria')">
    <button
      v-for="section in NOTIFICATION_SECTIONS"
      :key="section.id"
      type="button"
      class="notifications-navigation__item bew-shape-smooth-rect"
      :class="{ 'notifications-navigation__item--active': modelValue === section.id }"
      :aria-current="modelValue === section.id ? 'page' : undefined"
      :aria-label="t('notifications.section_aria', { section: t(section.labelKey) })"
      :title="t(section.descriptionKey)"
      @click="emit('update:modelValue', section.id)"
    >
      <i class="notifications-navigation__icon" :class="section.icon" />
      <span class="notifications-navigation__label">{{ t(section.labelKey) }}</span>
      <span
        v-if="unreadCount(section) > 0"
        class="notifications-navigation__badge"
        :aria-label="t('notifications.unread_count', { count: unreadCount(section) })"
      >
        {{ unreadCount(section) > 99 ? '99+' : unreadCount(section) }}
      </span>
    </button>

    <button
      type="button"
      class="notifications-navigation__item notifications-navigation__settings bew-shape-smooth-rect"
      :aria-label="t('notifications.actions.open_message_settings')"
      :title="t('notifications.actions.open_message_settings')"
      @click="emit('openSettings')"
    >
      <i class="notifications-navigation__icon" i-solar:settings-bold-duotone aria-hidden="true" />
      <span class="notifications-navigation__label">
        {{ t('notifications.actions.open_message_settings') }}
      </span>
    </button>
  </nav>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.notifications-navigation {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
  min-width: 0;
  padding-right: var(--bew-space-4);
  border-right: 1px solid var(--bew-border-color);
}

.notifications-navigation__item {
  position: relative;
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
  width: 100%;
  min-height: var(--bew-control-height-lg);
  padding: var(--bew-space-2) var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  text-align: left;
  appearance: none;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.notifications-navigation__item:hover {
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
}

.notifications-navigation__item--active {
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
}

.notifications-navigation__settings {
  margin-top: auto;
}

.notifications-navigation__icon {
  flex: 0 0 auto;
  font-size: var(--bew-icon-size-md);
}

.notifications-navigation__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notifications-navigation__badge {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  min-width: var(--bew-space-4);
  height: var(--bew-space-4);
  margin-left: auto;
  padding: 0 var(--bew-space-1);
  color: var(--bew-on-theme-color);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-caption);
  background: var(--bew-theme-color);
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
}

@media (min-width: breakpoints.$grid-md) and (max-width: breakpoints.$compact-max) {
  .notifications-navigation {
    align-items: center;
    padding-right: var(--bew-space-2);
  }

  .notifications-navigation__item {
    justify-content: center;
    width: calc(var(--bew-space-8) * 2);
    padding-inline: var(--bew-space-2);
  }

  .notifications-navigation__label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .notifications-navigation__badge {
    position: absolute;
    top: var(--bew-space-1);
    right: var(--bew-space-1);
    min-width: var(--bew-space-3);
    height: var(--bew-space-3);
    padding: 0;
    font-size: 0;
  }
}

@media (max-width: breakpoints.$mobile-max) {
  .notifications-navigation {
    flex-direction: row;
    gap: var(--bew-space-1);
    padding: 0 0 var(--bew-space-2);
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--bew-border-color);
    overscroll-behavior-inline: contain;
  }

  .notifications-navigation__item {
    flex: 0 0 auto;
    width: auto;
  }

  .notifications-navigation__settings {
    margin-top: 0;
    margin-left: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .notifications-navigation__item {
    transition: none;
  }
}
</style>
