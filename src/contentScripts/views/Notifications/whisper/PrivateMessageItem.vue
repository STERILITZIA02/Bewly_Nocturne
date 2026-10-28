<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import ALink from '~/components/ALink.vue'
import Button from '~/components/Button.vue'
import LoadingRing from '~/components/LoadingRing.vue'

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
  (event: 'preview', src: string, trigger: HTMLElement): void
  (event: 'retryFailed', localId: string, msgType: number): void
}>()

const { locale, t } = useI18n()
const avatarLoadFailed = ref(false)
const senderInitial = computed(() => props.senderName.trim().slice(0, 1) || '?')
const dateLocale = computed(() => normalizePrivateSessionLocale(locale.value))
const profileUrl = computed(() => /^[1-9]\d*$/.test(props.message.senderId)
  ? `https://space.bilibili.com/${props.message.senderId}`
  : '')
const isMediaCard = computed(() => [
  'share-v2',
  'video-card',
  'article-card',
  'common-share-card',
  'picture-card',
  'business-card',
  'expired',
].includes(props.message.content.type))

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
      'private-message-item--media-card': isMediaCard,
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
        @preview="(src, trigger) => emit('preview', src, trigger)"
      />
      <span v-if="message.source" class="private-message-item__source">{{ sourceLabel }}</span>
    </div>

    <div v-else class="private-message-item__message">
      <ALink
        v-if="profileUrl"
        :href="profileUrl"
        type="content"
        class="private-message-item__avatar"
        :aria-label="t('notifications.whisper.open_profile', { name: senderName })"
      >
        <img
          v-if="senderAvatarUrl && !avatarLoadFailed"
          :src="senderAvatarUrl"
          alt=""
          loading="lazy"
          decoding="async"
          @error="avatarLoadFailed = true"
        >
        <span v-else>{{ senderInitial }}</span>
      </ALink>
      <span v-else class="private-message-item__avatar" aria-hidden="true">{{ senderInitial }}</span>

      <div class="private-message-item__body">
        <span class="private-message-item__sender">{{ senderName }}</span>

        <div class="private-message-item__content">
          <PrivateMessageContent
            :auto-load-images="autoLoadImages"
            :content="message.content"
            :is-self="message.isSelf"
            @preview="(src, trigger) => emit('preview', src, trigger)"
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
              <LoadingRing :loading="Boolean(sendState && !['failed', 'sent'].includes(sendState))">
                <i v-if="sendState === 'failed'" i-tabler:alert-triangle aria-hidden="true" />
                <i v-else i-tabler:check aria-hidden="true" />
              </LoadingRing>
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
@use "../../../../styles/truncateFade";
.private-message-item {
  display: flex;
  justify-content: flex-start;
  width: 100%;
  min-width: 0;
}

.private-message-item--self {
  justify-content: flex-end;
}

// The corner facing the sender's avatar is square; the other corners keep
// their existing surface radii, including media and unavailable-message bubbles.
.private-message-item:not(.private-message-item--self)
  .private-message-item__content
  :deep(
    :is(
      .private-message-content__bubble,
      .private-message-content__card,
      .private-message-content__unknown,
      .private-message-content__expired,
      .private-message-content__media-button,
      .private-message-content__picture-card,
      .private-message-content__media-placeholder
    )
  ) {
  border-top-left-radius: 0;
}
.private-message-item--self
  .private-message-item__content
  :deep(
    :is(
      .private-message-content__bubble,
      .private-message-content__card,
      .private-message-content__unknown,
      .private-message-content__expired,
      .private-message-content__media-button,
      .private-message-content__picture-card,
      .private-message-content__media-placeholder
    )
  ) {
  border-top-right-radius: 0;
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

// Give large media a definite available width before resolving nested 100%
// widths. Intrinsic image width must never expand the flex item past the pane.
.private-message-item--media-card .private-message-item__message {
  width: min(100%, calc(var(--bew-message-share-width) + var(--bew-space-10) + var(--bew-space-4)));
  max-width: 100%;

  .private-message-item__body {
    flex: 1 1 0;
    width: 0;
    max-width: none;
  }

  .private-message-item__content {
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
  }
}

.private-message-item--self .private-message-item__message {
  flex-direction: row-reverse;
}

// Keep all outgoing bubble surfaces opaque, including shared media cards.
// Metadata outside the bubble retains the neutral page foreground.
.private-message-item--self .private-message-item__content {
  :deep(.private-message-content__card),
  :deep(.private-message-content__media-button),
  :deep(.private-message-content__picture-card),
  :deep(.private-message-content__expired),
  :deep(.private-message-content__unknown) {
    color: var(--bew-text-1);
    background: var(--bew-selected-bg);
    border-color: var(--bew-edge-color);
  }
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
  font-weight: var(--bew-font-weight-regular);
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
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-caption);
  @include truncateFade.line;
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
  color: var(--bew-text-2);
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
