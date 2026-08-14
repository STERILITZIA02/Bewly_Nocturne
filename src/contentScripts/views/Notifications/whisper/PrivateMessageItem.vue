<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { DisplayPrivateMessage } from './privateMessage'
import PrivateMessageContent from './PrivateMessageContent.vue'
import { normalizePrivateSessionLocale } from './privateSession'

const props = defineProps<{
  message: DisplayPrivateMessage
}>()

const emit = defineEmits<{
  (event: 'deleteFailed', localId: string): void
  (event: 'editFailed', localId: string): void
  (event: 'preview', src: string): void
  (event: 'retry', localId: string): void
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
    <PrivateMessageContent
      v-if="message.content.type === 'tip' || message.content.type === 'recalled'"
      :content="message.content"
      @preview="emit('preview', $event)"
    />

    <div v-else class="private-message-item__content">
      <PrivateMessageContent :content="message.content" @preview="emit('preview', $event)" />

      <time v-if="displayTime" class="private-message-item__time">
        {{ displayTime }}
      </time>
      <div v-if="message.localId" class="private-message-item__send-status" role="status">
        <span v-if="message.sendState === 'pending'">
          {{ t('notifications.whisper.messages.sending') }}
        </span>
        <span v-else-if="message.sendState === 'reconciling'">
          {{ t('notifications.whisper.messages.reconciling') }}
        </span>
        <template v-else-if="message.sendState === 'failed'">
          <span>{{ t('notifications.whisper.messages.send_failed') }}</span>
          <button type="button" @click="emit('retry', message.localId)">
            {{ t('notifications.whisper.messages.retry_send') }}
          </button>
          <button type="button" @click="emit('editFailed', message.localId)">
            {{ t('notifications.whisper.messages.edit_failed') }}
          </button>
          <button type="button" @click="emit('deleteFailed', message.localId)">
            {{ t('notifications.whisper.messages.delete_failed') }}
          </button>
        </template>
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

.private-message-item--self .private-message-item__content {
  justify-items: end;
}

.private-message-item__time,
.private-message-item__send-status {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-caption);
}

.private-message-item__send-status {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  justify-content: flex-end;
}

.private-message-item__send-status button {
  padding: 0;
  color: var(--bew-theme-color);
  font: inherit;
  appearance: none;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.private-message-item__send-status button:focus-visible {
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: var(--bew-space-0-5);
}
</style>
