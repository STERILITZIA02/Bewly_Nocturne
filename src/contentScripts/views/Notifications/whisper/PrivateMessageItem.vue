<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import type { DisplayPrivateMessage } from './privateMessage'
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
const originalUrl = buildOriginalNotificationUrl('whisper')
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
      'private-message-item--notice': message.content.type === 'system' || message.content.type === 'recalled',
    }"
    :data-message-id="message.msgKey"
  >
    <div v-if="message.content.type === 'system'" class="private-message-item__system">
      {{ message.content.text }}
    </div>

    <div v-else-if="message.content.type === 'recalled'" class="private-message-item__system">
      {{ t('notifications.whisper.messages.recalled') }}
    </div>

    <div v-else class="private-message-item__content">
      <div v-if="message.content.type === 'text'" class="private-message-item__bubble">
        <template v-for="(segment, index) in message.content.segments" :key="`${message.msgKey}:${index}`">
          <span v-if="segment.type === 'text'">{{ segment.text }}</span>
          <img
            v-else
            class="private-message-item__inline-emoji"
            :class="{ 'private-message-item__inline-emoji--large': segment.size > 1 }"
            :src="segment.src"
            :alt="segment.alt"
            loading="lazy"
            decoding="async"
          >
        </template>
      </div>

      <button
        v-else-if="message.content.type === 'image' || message.content.type === 'emoticon'"
        type="button"
        class="private-message-item__media-button"
        :aria-label="t('notifications.whisper.messages.preview_image')"
        @click="emit('preview', message.content.src)"
      >
        <img
          class="private-message-item__media"
          :class="{ 'private-message-item__media--emoticon': message.content.type === 'emoticon' }"
          :src="message.content.src"
          :style="message.content.width > 0 && message.content.height > 0
            ? { aspectRatio: `${message.content.width} / ${message.content.height}` }
            : undefined"
          :alt="message.content.type === 'emoticon'
            ? t('notifications.whisper.messages.emoticon_alt')
            : t('notifications.whisper.messages.image_alt')"
          loading="lazy"
          decoding="async"
        >
      </button>

      <div v-else class="private-message-item__unknown">
        <span>{{ t('notifications.whisper.messages.unsupported') }}</span>
        <ALink :href="originalUrl" type="content">
          {{ t('notifications.actions.open_original') }}
        </ALink>
      </div>

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

.private-message-item__bubble,
.private-message-item__unknown {
  box-sizing: border-box;
  max-width: 100%;
  padding: var(--bew-space-2) var(--bew-space-3);
  overflow-wrap: anywhere;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-body);
  white-space: pre-wrap;
  background: var(--bew-elevated-solid);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);
}

.private-message-item--self .private-message-item__bubble {
  background: color-mix(in srgb, var(--bew-theme-color) 12%, var(--bew-elevated-solid));
  border-color: var(--bew-surface-border-color);
}

.private-message-item__inline-emoji {
  display: inline-block;
  width: var(--bew-icon-size-lg);
  height: var(--bew-icon-size-lg);
  margin: 0 var(--bew-space-1);
  vertical-align: text-bottom;
  object-fit: contain;
}

.private-message-item__inline-emoji--large {
  width: var(--bew-icon-size-xl);
  height: var(--bew-icon-size-xl);
}

.private-message-item__media-button {
  max-width: 100%;
  padding: 0;
  appearance: none;
  cursor: zoom-in;
  background: transparent;
  border: 0;
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);
}

.private-message-item__media-button:focus-visible {
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: var(--bew-space-1);
}

.private-message-item__media {
  display: block;
  width: auto;
  max-width: 100%;
  max-height: calc(var(--bew-space-12) * 8);
  object-fit: contain;
  background: var(--bew-fill-1);
  border-radius: inherit;
  corner-shape: inherit;
}

.private-message-item__media--emoticon {
  max-width: calc(var(--bew-space-12) * 3);
  max-height: calc(var(--bew-space-12) * 3);
  background: transparent;
}

.private-message-item__system,
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

.private-message-item__system {
  max-width: 80%;
  padding: var(--bew-space-1) var(--bew-space-2);
  text-align: center;
}

.private-message-item__unknown {
  display: grid;
  gap: var(--bew-space-1);
}

.private-message-item__unknown a {
  color: var(--bew-theme-color);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  text-decoration: none;
}
</style>
