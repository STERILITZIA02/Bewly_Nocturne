<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { DisplayPrivateMessage } from './privateMessage'
import PrivateMessageContent from './PrivateMessageContent.vue'
import { normalizePrivateSessionLocale } from './privateSession'
import type { PrivateImageFailureKind } from './usePrivateMessages'

const props = defineProps<{
  message: DisplayPrivateMessage
  imageFailureKind?: PrivateImageFailureKind | null
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
const sendStatus = computed(() => {
  if (props.message.sendState === 'preparing')
    return t('notifications.whisper.messages.image_preparing')
  if (props.message.sendState === 'uploading')
    return t('notifications.whisper.messages.image_uploading')
  if (props.message.sendState === 'sending')
    return t('notifications.whisper.messages.sending')
  if (props.message.sendState === 'reconciling')
    return t('notifications.whisper.messages.reconciling')
  if (props.message.sendState === 'pending')
    return t('notifications.whisper.messages.sending')
  return ''
})
const failureMessage = computed(() => {
  if (props.imageFailureKind === 'upload-failed')
    return t('notifications.whisper.messages.image_upload_failed')
  if (props.imageFailureKind === 'send-failed')
    return t('notifications.whisper.messages.image_send_failed')
  if (props.imageFailureKind === 'reconcile-failed')
    return t('notifications.whisper.messages.image_reconcile_failed')
  return t('notifications.whisper.messages.send_failed')
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
      <div v-if="message.localId" class="private-message-item__send-status" role="status">
        <span v-if="sendStatus">{{ sendStatus }}</span>
        <template v-else-if="message.sendState === 'failed'">
          <span>{{ failureMessage }}</span>
          <button type="button" @click="emit('retry', message.localId)">
            {{ t('notifications.whisper.messages.retry_send') }}
          </button>
          <button v-if="message.msgType === 1" type="button" @click="emit('editFailed', message.localId)">
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
.private-message-item__source,
.private-message-item__send-status {
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
