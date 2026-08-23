<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type {
  DisplayPrivateMessage as OptimisticPrivateMessage,
  PrivateMessageSendState,
} from './experimental/privateMessageTransactions'
import type { DisplayPrivateMessage } from './privateMessage'
import PrivateMessageContent from './PrivateMessageContent.vue'
import { normalizePrivateSessionLocale } from './privateSession'

type TimelinePrivateMessage = DisplayPrivateMessage | OptimisticPrivateMessage

const props = defineProps<{
  autoLoadImages: boolean
  message: TimelinePrivateMessage
  senderAvatarUrl: string
  senderName: string
}>()

const emit = defineEmits<{
  (event: 'deleteFailed', localId: string, msgType: number): void
  (event: 'preview', src: string): void
  (event: 'retryFailed', localId: string, msgType: number): void
}>()

const { locale, t } = useI18n()
const avatarLoadFailed = ref(false)
const senderInitial = computed(() => props.senderName.trim().slice(0, 1) || '?')
const dateLocale = computed(() => normalizePrivateSessionLocale(locale.value))

watch(() => props.senderAvatarUrl, () => {
  avatarLoadFailed.value = false
})
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
const sendState = computed<PrivateMessageSendState | undefined>(() => (
  'sendState' in props.message ? props.message.sendState : undefined
))
const localId = computed(() => 'localId' in props.message ? props.message.localId ?? '' : '')
const deliveryLabel = computed(() => {
  if (!props.message.isSelf)
    return ''
  if (!sendState.value || sendState.value === 'sent')
    return t('notifications.whisper.messages.test_send_success')
  if (sendState.value === 'failed')
    return t('notifications.whisper.messages.send_failed')
  if (sendState.value === 'accepted-but-unconfirmed')
    return t('notifications.whisper.messages.test_send_accepted_unconfirmed')
  if (sendState.value === 'preparing')
    return t('notifications.whisper.messages.image_preparing')
  if (sendState.value === 'uploading')
    return t('notifications.whisper.messages.image_uploading')
  if (sendState.value === 'reconciling')
    return t('notifications.whisper.messages.reconciling')
  return t('notifications.whisper.messages.sending')
})
</script>

<template>
  <article
    class="private-message-item"
    :class="{
      'private-message-item--self': message.isSelf,
      'private-message-item--notice': message.content.type === 'tip' || message.content.type === 'recalled',
      'private-message-item--failed': sendState === 'failed',
    }"
    :data-message-id="message.msgKey"
  >
    <div
      v-if="message.content.type === 'tip' || message.content.type === 'recalled'"
      class="private-message-item__notice-content"
    >
      <PrivateMessageContent
        :auto-load-images="autoLoadImages"
        :content="message.content"
        :is-self="message.isSelf"
        @preview="emit('preview', $event)"
      />
      <span v-if="message.source" class="private-message-item__source">{{ sourceLabel }}</span>
    </div>

    <div v-else class="private-message-item__message">
      <span class="private-message-item__avatar" aria-hidden="true">
        <img
          v-if="senderAvatarUrl && !avatarLoadFailed"
          :src="senderAvatarUrl"
          alt=""
          loading="lazy"
          decoding="async"
          @error="avatarLoadFailed = true"
        >
        <span v-else>{{ senderInitial }}</span>
      </span>

      <div class="private-message-item__body">
        <span class="private-message-item__sender">{{ senderName }}</span>

        <div class="private-message-item__content">
          <PrivateMessageContent
            :auto-load-images="autoLoadImages"
            :content="message.content"
            :is-self="message.isSelf"
            @preview="emit('preview', $event)"
          />

          <div v-if="message.source || displayTime || message.isSelf" class="private-message-item__metadata">
            <span v-if="message.source" class="private-message-item__source">{{ sourceLabel }}</span>
            <time v-if="displayTime" class="private-message-item__time">
              {{ displayTime }}
            </time>
            <span
              v-if="message.isSelf"
              class="private-message-item__delivery"
              :class="{
                'private-message-item__delivery--failed': sendState === 'failed',
                'private-message-item__delivery--pending': sendState && !['failed', 'sent'].includes(sendState),
              }"
              :aria-label="deliveryLabel"
              :title="deliveryLabel"
            >
              <i v-if="sendState === 'failed'" i-mingcute:warning-line aria-hidden="true" />
              <i
                v-else-if="sendState && sendState !== 'sent'"
                i-svg-spinners-ring-resize
                aria-hidden="true"
              />
              <i v-else i-mingcute:check-line aria-hidden="true" />
            </span>
          </div>

          <div v-if="sendState === 'failed' && localId" class="private-message-item__failed-actions">
            <Button type="tertiary" @click="emit('retryFailed', localId, message.msgType)">
              {{ t('notifications.whisper.messages.retry_send') }}
            </Button>
            <Button type="tertiary" @click="emit('deleteFailed', localId, message.msgType)">
              {{ t('notifications.whisper.messages.delete_failed') }}
            </Button>
          </div>
        </div>
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

.private-message-item__message {
  display: flex;
  max-width: min(82%, calc(var(--bew-space-12) * 10));
  min-width: 0;
  gap: var(--bew-space-2);
  align-items: flex-start;
}

.private-message-item--self .private-message-item__message {
  flex-direction: row-reverse;
}

.private-message-item__avatar {
  display: grid;
  width: var(--bew-space-8);
  height: var(--bew-space-8);
  overflow: hidden;
  flex: 0 0 auto;
  place-items: center;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  background: var(--bew-fill-2);
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
}

.private-message-item__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.private-message-item__body {
  display: grid;
  flex: 0 1 auto;
  max-width: calc(100% - var(--bew-space-10));
  min-width: 0;
  gap: var(--bew-space-1);
  justify-items: start;
}

.private-message-item__sender {
  max-width: 100%;
  overflow: hidden;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.private-message-item__content {
  display: grid;
  max-width: 100%;
  min-width: 0;
  gap: var(--bew-space-1);
  justify-items: start;
}

.private-message-item__notice-content {
  display: grid;
  gap: var(--bew-space-1);
  justify-items: center;
  min-width: 0;
}

.private-message-item--self .private-message-item__body,
.private-message-item--self .private-message-item__content {
  justify-items: end;
}

.private-message-item__time,
.private-message-item__source,
.private-message-item__delivery {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-caption);
}

.private-message-item__delivery {
  display: inline-flex;
  align-items: center;
  color: var(--bew-theme-color);
}

.private-message-item__delivery--pending {
  color: var(--bew-text-3);
}

.private-message-item__delivery--failed {
  color: var(--bew-error-color);
}

.private-message-item__delivery i {
  font-size: var(--bew-icon-size-sm);
}

.private-message-item__metadata,
.private-message-item__failed-actions {
  display: flex;
  max-width: 100%;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
  align-items: center;
}

.private-message-item--self .private-message-item__metadata,
.private-message-item--self .private-message-item__failed-actions {
  justify-content: flex-end;
}
</style>
