<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { NotificationView } from '../notificationSections'
import { NOTIFICATION_SECTION_BY_ID } from '../notificationSections'

const props = defineProps<{
  view: NotificationView
}>()

const { t } = useI18n()
const section = computed(() => NOTIFICATION_SECTION_BY_ID[props.view])
</script>

<template>
  <header class="notifications-page-header">
    <h1 class="bew-page-heading">
      {{ t(section.labelKey) }}
    </h1>
  </header>
</template>

<style scoped lang="scss">
.notifications-page-header {
  display: flex;
  align-items: center;
  padding-bottom: var(--bew-space-4);
  border-bottom: 1px solid var(--bew-border-color);
}

.notifications-page-header h1 {
  margin: 0;
}
</style>
