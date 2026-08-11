<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import type { NotificationView } from '../notificationSections'
import { NOTIFICATION_SECTION_BY_ID } from '../notificationSections'

const props = defineProps<{
  view: NotificationView
}>()

const emit = defineEmits<{
  (event: 'refresh'): void
}>()

const { t } = useI18n()
const section = computed(() => NOTIFICATION_SECTION_BY_ID[props.view])
const originalUrl = computed(() => buildOriginalNotificationUrl(props.view))
</script>

<template>
  <header class="notifications-page-header">
    <div class="notifications-page-header__copy">
      <h1 class="bew-page-heading">
        {{ t(section.labelKey) }}
      </h1>
      <p>{{ t(section.descriptionKey) }}</p>
    </div>
    <div class="notifications-page-header__actions">
      <Button
        type="tertiary"
        :aria-label="t('notifications.actions.refresh_aria')"
        :title="t('notifications.actions.refresh_tooltip')"
        @click="emit('refresh')"
      >
        <template #left>
          <i i-mingcute:refresh-2-line />
        </template>
        {{ t('notifications.actions.refresh') }}
      </Button>
      <ALink
        class="notifications-page-header__original-link bew-shape-smooth-rect"
        :href="originalUrl"
        type="content"
        :aria-label="t('notifications.actions.open_original_aria', { section: t(section.labelKey) })"
        :title="t('notifications.actions.open_original_tooltip')"
        rel="noopener noreferrer"
      >
        <i i-mingcute:external-link-line />
        <span>{{ t('notifications.actions.open_original') }}</span>
      </ALink>
    </div>
  </header>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.notifications-page-header {
  display: flex;
  gap: var(--bew-space-4);
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--bew-space-4);
  border-bottom: 1px solid var(--bew-border-color);
}

.notifications-page-header__copy {
  min-width: 0;
}

.notifications-page-header__copy h1,
.notifications-page-header__copy p {
  margin: 0;
}

.notifications-page-header__copy p {
  margin-top: var(--bew-space-1);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
}

.notifications-page-header__actions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--bew-space-2);
  align-items: center;
}

.notifications-page-header__original-link {
  display: inline-flex;
  gap: var(--bew-space-2);
  align-items: center;
  box-sizing: border-box;
  height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  text-decoration: none;
  background: var(--bew-content-solid);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard),
    border-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.notifications-page-header__original-link:hover {
  background: var(--bew-fill-1);
}

@media (max-width: breakpoints.$mobile-max) {
  .notifications-page-header {
    align-items: flex-start;
  }

  .notifications-page-header__actions span {
    display: none;
  }
}
</style>
