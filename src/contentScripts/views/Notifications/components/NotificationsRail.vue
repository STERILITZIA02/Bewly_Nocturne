<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Tooltip from '~/components/Tooltip.vue'
import type { NotificationSection } from '~/utils/notificationRoute'

import { NOTIFICATION_SECTIONS } from '../notificationSections'

const props = defineProps<{
  section: NotificationSection
  unread: Partial<Record<NotificationSection, number>>
}>()

const emit = defineEmits<{
  select: [section: NotificationSection]
}>()

const { t } = useI18n()
</script>

<template>
  <nav class="notifications-rail" :aria-label="t('notifications.aria.primary_navigation')">
    <div class="notifications-rail__brand">
      <i i-tabler-mail-filled aria-hidden="true" />
      <span>{{ t('notifications.title') }}</span>
    </div>
    <div class="notifications-rail__items">
      <Tooltip
        v-for="item in NOTIFICATION_SECTIONS.filter(item => item.id !== 'settings')"
        :key="item.id"
        class="notifications-rail__tooltip"
        :content="t(item.labelKey)"
        placement="right"
      >
        <button
          type="button"
          class="notifications-rail__item"
          :class="{ 'is-active': props.section === item.id }"
          :aria-current="props.section === item.id ? 'page' : undefined"
          @click="emit('select', item.id)"
        >
          <i :class="item.icon" aria-hidden="true" />
          <span class="notifications-rail__label">{{ t(item.labelKey) }}</span>
          <span v-if="unread[item.id]" class="notifications-rail__badge">
            {{ Number(unread[item.id]) > 99 ? '99+' : unread[item.id] }}
          </span>
        </button>
      </Tooltip>
    </div>
    <Tooltip
      class="notifications-rail__tooltip notifications-rail__settings"
      :content="t('notifications.sections.settings')"
      placement="right"
    >
      <button
        type="button"
        class="notifications-rail__item"
        :class="{ 'is-active': props.section === 'settings' }"
        :aria-current="props.section === 'settings' ? 'page' : undefined"
        @click="emit('select', 'settings')"
      >
        <i i-tabler-settings aria-hidden="true" />
        <span class="notifications-rail__label">{{ t('notifications.sections.settings') }}</span>
      </button>
    </Tooltip>
  </nav>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.notifications-rail {
  display: flex;
  width: var(--bew-notifications-nav-width);
  min-width: 0;
  flex: 0 0 auto;
  flex-direction: column;
  gap: var(--bew-space-4);
  padding: var(--bew-space-4);
  background: var(--bew-notifications-nav-background);
  border-right: 1px solid var(--bew-border-color);
}

.notifications-rail__brand {
  display: flex;
  min-height: var(--bew-control-height-lg);
  align-items: center;
  gap: var(--bew-space-3);
  padding-inline: var(--bew-space-2);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-heading);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-heading);

  i {
    width: var(--bew-icon-size-lg);
    height: var(--bew-icon-size-lg);
    color: var(--bew-theme-color);
  }
}

.notifications-rail__items {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: var(--bew-space-1);
}

.notifications-rail__tooltip {
  width: 100%;

  :deep(.b-tooltip) {
    display: none;
  }
}

.notifications-rail__item {
  position: relative;
  display: grid;
  width: 100%;
  min-height: var(--bew-control-height-lg);
  grid-template-columns: var(--bew-icon-size-md) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bew-space-3);
  padding-inline: var(--bew-space-3);
  color: var(--bew-text-2);
  font: inherit;
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-body);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);

  &::before {
    position: absolute;
    top: 50%;
    left: 0;
    width: 3px;
    height: 18px;
    background: var(--bew-theme-color);
    border-radius: var(--bew-radius-full);
    content: "";
    opacity: 0;
    transform: translate(-4px, -50%);
    transition:
      opacity var(--bew-duration-fast) var(--bew-ease-standard),
      transform var(--bew-duration-fast) var(--bew-ease-standard);
  }

  &:hover {
    color: var(--bew-text-1);
    background: var(--bew-fill-1);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-focus-ring);
    outline-offset: 2px;
  }

  &.is-active {
    color: var(--bew-text-1);
    background: var(--bew-theme-color-10);

    &::before {
      opacity: 1;
      transform: translate(0, -50%);
    }

    > i {
      color: var(--bew-theme-color);
    }
  }

  > i {
    width: var(--bew-icon-size-md);
    height: var(--bew-icon-size-md);
  }
}

.notifications-rail__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notifications-rail__badge {
  min-width: 20px;
  height: 20px;
  padding-inline: var(--bew-space-1);
  color: var(--bew-on-theme-color);
  font-size: var(--bew-font-size-caption);
  line-height: 20px;
  text-align: center;
  background: var(--bew-theme-color);
  border-radius: var(--bew-radius-full);
  corner-shape: round;
}

.notifications-rail__settings {
  margin-top: auto;
}

@media (width < breakpoints.$grid-xl) {
  .notifications-rail {
    width: var(--bew-notifications-nav-compact-width);
    align-items: center;
    padding-inline: var(--bew-space-2);
  }

  .notifications-rail__brand {
    justify-content: center;
    padding: 0;

    span {
      display: none;
    }
  }

  .notifications-rail__item {
    width: var(--bew-control-height-lg);
    grid-template-columns: 1fr;
    justify-items: center;
    padding: 0;
  }

  .notifications-rail__tooltip {
    width: var(--bew-control-height-lg);

    :deep(.b-tooltip) {
      display: block;
    }
  }

  .notifications-rail__label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .notifications-rail__badge {
    position: absolute;
    top: 1px;
    right: -5px;
    min-width: 17px;
    height: 17px;
    font-size: 10px;
    line-height: 17px;
  }
}

@media (width < breakpoints.$grid-md) {
  .notifications-rail {
    width: 100%;
    height: auto;
    flex-direction: row;
    gap: var(--bew-space-1);
    padding: var(--bew-space-2);
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--bew-border-color);
  }

  .notifications-rail__brand {
    display: none;
  }

  .notifications-rail__items {
    flex-direction: row;
  }

  .notifications-rail__settings {
    margin-top: 0;
    margin-left: auto;
  }
}
</style>
