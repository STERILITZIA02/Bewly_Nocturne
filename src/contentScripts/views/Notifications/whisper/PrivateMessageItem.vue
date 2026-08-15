<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { DisplayPrivateMessage } from './privateMessage'
import PrivateMessageContent from './PrivateMessageContent.vue'
import { normalizePrivateSessionLocale } from './privateSession'

const props = defineProps<{
  message: DisplayPrivateMessage
}>()

const emit = defineEmits<{
  (event: 'preview', src: string): void
}>()

const { locale, t } = useI18n()
const dateLocale = computed(() => normalizePrivateSessionLocale(locale.value))
const displayTime = computed(() => {
  const date = new Date(props.message.timestamp * 1000)
  if (Number.isNaN(date.getTime()))
    return ''
  return new Intl.DateTimeFormat(dateLocale.value, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
})
const sourceLabel = computed(() => props.message.source
  ? t(`notifications.whisper.messages.message_sources.${props.message.source}`)
  : '')
</script>

<template>
  <article
    class="private-message-item"
    :class="{
      'private-message-item--self': message.isSelf,
      'private-message-item--notice': message.content.type === 'tip' || message.content.type === 'recalled',
    }"
    :data-message-id="message.msgKey"
  >
    <div
      v-if="message.content.type === 'tip' || message.content.type === 'recalled'"
      class="private-message-item__notice-content"
    >
      <PrivateMessageContent
        :content="message.content"
        @preview="emit('preview', $event)"
      />
      <span v-if="message.source" class="private-message-item__source">{{ sourceLabel }}</span>
    </div>

    <div v-else class="private-message-item__content">
      <PrivateMessageContent :content="message.content" @preview="emit('preview', $event)" />

      <div v-if="message.source || displayTime" class="private-message-item__metadata">
        <span v-if="message.source" class="private-message-item__source">{{ sourceLabel }}</span>
        <time v-if="displayTime" class="private-message-item__time">
          {{ displayTime }}
        </time>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.private-message-item {
  display: flex;
  justify-content: flex-start;
  width: 100%;
  min-width: 0;
}

.private-message-item--self {
  justify-content: flex-end;
}

.private-message-item--notice {
  justify-content: center;
}

.private-message-item__content {
  display: grid;
  gap: var(--bew-space-1);
  justify-items: start;
  max-width: min(75%, calc(var(--bew-space-12) * 10));
  min-width: 0;
}

.private-message-item__notice-content {
  display: grid;
  gap: var(--bew-space-1);
  justify-items: center;
  min-width: 0;
}

.private-message-item--self .private-message-item__content {
  justify-items: end;
}

.private-message-item__time,
.private-message-item__source {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-caption);
}

.private-message-item__metadata {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  align-items: center;
}

.private-message-item--self .private-message-item__metadata {
  justify-content: flex-end;
}
</style>
