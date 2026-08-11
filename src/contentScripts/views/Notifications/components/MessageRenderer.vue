<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DisplayMessage } from '../types'

const props = defineProps<{
  message: DisplayMessage
  originalUrl: string
}>()

const emit = defineEmits<{
  image: [url: string, event: MouseEvent]
  retry: [message: DisplayMessage]
  retract: [message: DisplayMessage]
}>()

const { t } = useI18n()
const imageFailed = ref(false)
const retractExpired = ref(false)
let retractExpiryTimer: ReturnType<typeof setTimeout> | undefined
const canRetract = computed(() => props.message.outgoing
  && props.message.status === 'sent'
  && !props.message.id.startsWith('local:')
  && props.message.content.kind !== 'withdrawn'
  && !retractExpired.value)

function scheduleRetractExpiry() {
  if (retractExpiryTimer !== undefined)
    clearTimeout(retractExpiryTimer)
  retractExpiryTimer = undefined
  const deadline = props.message.timestamp * 1000 + 120_000
  const remaining = deadline - Date.now()
  retractExpired.value = remaining <= 0
  if (!retractExpired.value && props.message.outgoing && props.message.status === 'sent') {
    retractExpiryTimer = setTimeout(() => {
      retractExpiryTimer = undefined
      retractExpired.value = true
    }, remaining)
  }
}

watch(() => props.message.content.kind === 'image' ? props.message.content.url : '', () => {
  imageFailed.value = false
})
watch(
  () => [props.message.id, props.message.timestamp, props.message.outgoing, props.message.status, props.message.content.kind] as const,
  scheduleRetractExpiry,
  { immediate: true },
)
onBeforeUnmount(() => {
  if (retractExpiryTimer !== undefined)
    clearTimeout(retractExpiryTimer)
})
</script>

<template>
  <div class="message-renderer" :class="[`is-${message.content.kind}`, { 'is-outgoing': message.outgoing }]">
    <template v-if="message.content.kind === 'text'">
      <p>{{ message.content.text }}</p>
    </template>
    <button
      v-else-if="message.content.kind === 'image' && message.content.url && !imageFailed"
      type="button"
      class="message-renderer__image"
      @click="emit('image', message.content.url, $event)"
    >
      <img :src="message.content.url" :alt="message.content.alt || t('notifications.message_types.image')" loading="lazy" @error="imageFailed = true">
    </button>
    <div v-else-if="message.content.kind === 'image'" class="message-renderer__unavailable" role="status" aria-live="polite">
      <i i-tabler-photo-off aria-hidden="true" />
      {{ t('notifications.status.image_unavailable') }}
    </div>
    <ALink v-else-if="message.content.kind === 'share'" :href="message.content.href || originalUrl" class="message-renderer__card">
      <img v-if="message.content.image" :src="message.content.image" alt="" loading="lazy">
      <span>
        <strong>{{ message.content.title || t('notifications.message_types.share') }}</strong>
        <small v-if="message.content.description">{{ message.content.description }}</small>
      </span>
      <i i-tabler-external-link aria-hidden="true" />
    </ALink>
    <div v-else-if="message.content.kind === 'notice'" class="message-renderer__notice">
      <strong v-if="message.content.title">{{ message.content.title }}</strong>
      <p v-if="message.content.text">
        {{ message.content.text }}
      </p>
      <ALink v-if="message.content.href" :href="message.content.href">
        {{ t('notifications.actions.open') }}
      </ALink>
    </div>
    <p v-else-if="message.content.kind === 'withdrawn'" class="message-renderer__withdrawn" role="status" aria-live="polite">
      {{ t('notifications.status.retracted') }}
    </p>
    <div v-else class="message-renderer__unknown">
      <i i-tabler-message-question aria-hidden="true" />
      <span>
        {{ t('notifications.message_types.unknown', { type: message.content.messageType }) }}
        <small v-if="message.content.summary">{{ message.content.summary }}</small>
      </span>
      <ALink :href="originalUrl">
        {{ t('notifications.actions.open_original') }}
      </ALink>
    </div>

    <div v-if="message.status !== 'sent'" class="message-renderer__status" role="status">
      <span v-if="message.status === 'sending'">
        <i i-svg-spinners-180-ring-with-bg aria-hidden="true" />
        {{ t('notifications.status.sending') }}
      </span>
      <button v-else type="button" @click="emit('retry', message)">
        <i i-tabler-alert-circle aria-hidden="true" />
        {{ t('notifications.actions.retry') }}
      </button>
    </div>
    <span v-else-if="message.autoReply" class="message-renderer__auto-reply">
      {{ t('notifications.status.auto_reply') }}
    </span>
    <button
      v-else-if="canRetract"
      type="button"
      class="message-renderer__retract"
      :aria-label="t('notifications.actions.retract')"
      :title="t('notifications.actions.retract')"
      @click="emit('retract', message)"
    >
      {{ t('notifications.actions.retract') }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.message-renderer {
  max-width: 100%;

  > p {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}

.message-renderer__image {
  display: block;
  max-width: min(360px, 100%);
  padding: 0;
  overflow: hidden;
  background: var(--bew-fill-1);
  border: 0;
  border-radius: inherit;
  corner-shape: inherit;
  cursor: zoom-in;

  img {
    display: block;
    max-width: 100%;
    max-height: 420px;
    object-fit: contain;
    border-radius: inherit;
    corner-shape: inherit;
  }
}

.message-renderer__card,
.message-renderer__unknown,
.message-renderer__notice,
.message-renderer__unavailable {
  display: flex;
  min-width: 220px;
  max-width: 380px;
  align-items: center;
  gap: var(--bew-space-3);
  color: var(--bew-text-1);
  text-decoration: none;
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  padding: var(--bew-space-3);

  img {
    width: 72px;
    height: 72px;
    flex: 0 0 auto;
    object-fit: cover;
    border-radius: var(--bew-radius-half);
    corner-shape: var(--bew-corner-shape);
  }

  span {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: var(--bew-space-1);
  }

  strong,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: var(--bew-text-3);
  }
}

.message-renderer__notice {
  align-items: flex-start;
  flex-direction: column;

  p {
    margin: 0;
    white-space: pre-wrap;
  }

  a {
    color: var(--bew-theme-color);
  }
}

.message-renderer__withdrawn {
  color: var(--bew-text-3);
  font-style: italic;
}

.message-renderer__unknown {
  align-items: flex-start;

  > i {
    width: var(--bew-icon-size-lg);
    height: var(--bew-icon-size-lg);
    color: var(--bew-text-3);
  }

  a {
    flex: 0 0 auto;
    color: var(--bew-theme-color);
  }
}

.message-renderer__status {
  margin-top: var(--bew-space-1);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  text-align: right;

  span,
  button {
    display: inline-flex;
    align-items: center;
    gap: var(--bew-space-1);
  }

  button {
    color: var(--bew-error-color);
    font: inherit;
    background: none;
    border: 0;
    cursor: pointer;
  }
}

.message-renderer__auto-reply,
.message-renderer__retract {
  display: block;
  margin-top: var(--bew-space-1);
  margin-left: auto;
  padding: 0;
  color: var(--bew-text-3);
  font: inherit;
  font-size: var(--bew-font-size-caption);
  background: none;
  border: 0;
  cursor: pointer;

  &.message-renderer__auto-reply {
    cursor: default;
  }

  &:hover {
    color: var(--bew-text-1);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-focus-ring);
    outline-offset: 2px;
  }
}
</style>
