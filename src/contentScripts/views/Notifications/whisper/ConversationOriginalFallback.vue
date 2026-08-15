<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { LAYOUT_BREAKPOINTS } from '~/constants/layout'
import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import type { DisplayPrivateSession } from './privateSession'

const props = defineProps<{
  session: DisplayPrivateSession
}>()

const emit = defineEmits<{
  (event: 'back'): void
}>()

const { t } = useI18n()
const headingRef = ref<HTMLElement | null>(null)
const originalUrl = buildOriginalNotificationUrl('whisper')
const sessionKindLabel = computed(() => t(`notifications.whisper.session_kinds.${props.session.kind}`))

function focusHeading() {
  headingRef.value?.focus({ preventScroll: true })
}

function handleEscape() {
  if (window.matchMedia(`(max-width: ${LAYOUT_BREAKPOINTS.mobileMax}px)`).matches)
    emit('back')
}

defineExpose({ focusHeading })
</script>

<template>
  <section
    class="conversation-original-fallback"
    :aria-label="t('notifications.whisper.fallback_aria', { name: session.name })"
    @keydown.esc="handleEscape"
  >
    <header class="conversation-original-fallback__header">
      <IconButton
        class="conversation-original-fallback__back"
        shape="circle"
        :label="t('notifications.whisper.back_to_conversations')"
        @click="emit('back')"
      >
        <i i-mingcute:arrow-left-line aria-hidden="true" />
      </IconButton>
      <div>
        <strong ref="headingRef" tabindex="-1">
          {{ session.name || t('notifications.whisper.unknown_user') }}
        </strong>
        <span>{{ sessionKindLabel }}</span>
      </div>
    </header>

    <div class="conversation-original-fallback__body">
      <Empty :description="t('notifications.whisper.fallback_description')">
        <ALink :href="originalUrl" type="content" class="conversation-original-fallback__link">
          {{ t('notifications.whisper.open_original_list') }}
        </ALink>
      </Empty>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.conversation-original-fallback {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: transparent;
}

.conversation-original-fallback__header {
  display: flex;
  gap: var(--bew-space-3);
  align-items: center;
  min-width: 0;
  padding: var(--bew-space-3) var(--bew-space-4);
  background: var(--bew-elevated);
  border-bottom: 1px solid var(--bew-border-color);
  backdrop-filter: var(--bew-filter-glass-1);
  -webkit-backdrop-filter: var(--bew-filter-glass-1);
}

.conversation-original-fallback__header > div {
  display: grid;
  min-width: 0;
}

.conversation-original-fallback__header strong {
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-original-fallback__header span {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.conversation-original-fallback__back {
  display: none;
  flex: 0 0 auto;
}

.conversation-original-fallback__body {
  display: flex;
  min-width: 0;
  min-height: 0;
  align-items: center;
  justify-content: center;
  background: transparent;
}

.conversation-original-fallback__link {
  color: var(--bew-theme-color);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  text-decoration: none;
}

@media (max-width: breakpoints.$mobile-max) {
  .conversation-original-fallback__back {
    display: inline-flex;
  }
}
</style>
