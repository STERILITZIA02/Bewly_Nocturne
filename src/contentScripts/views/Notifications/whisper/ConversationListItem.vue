<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { DisplayPrivateSession } from './privateSession'
import { normalizePrivateSessionLocale } from './privateSession'

const props = defineProps<{
  compact?: boolean
  selected: boolean
  session: DisplayPrivateSession
}>()

const emit = defineEmits<{
  (event: 'select', session: DisplayPrivateSession): void
}>()

const { locale, t } = useI18n()
const avatarFailed = ref(false)
const assistantLabel = computed(() => props.session.assistantType
  ? t(`notifications.whisper.assistants.${props.session.assistantType}`)
  : '')

const displayName = computed(() => props.session.name || t('notifications.whisper.unknown_user'))
const displaySummary = computed(() => props.session.summary || t('notifications.whisper.summary_unavailable'))
const dateLocale = computed(() => normalizePrivateSessionLocale(locale.value))
const displayTime = computed(() => {
  if (!props.session.timestamp)
    return ''
  const timestampMs = Math.trunc(props.session.timestamp / 1000)
  const date = new Date(timestampMs)
  if (Number.isNaN(date.getTime()))
    return ''
  return new Intl.DateTimeFormat(dateLocale.value, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
})

watch(() => props.session.avatar, () => {
  avatarFailed.value = false
})
</script>

<template>
  <button
    type="button"
    class="conversation-list-item bew-shape-smooth-rect"
    :data-session-key="session.key"
    :class="{
      'conversation-list-item--compact': compact,
      'conversation-list-item--selected': selected,
    }"
    :aria-current="selected ? 'true' : undefined"
    :aria-label="t('notifications.whisper.select_conversation', { name: displayName })"
    @click="emit('select', session)"
  >
    <span class="conversation-list-item__avatar-wrap">
      <img
        v-if="session.avatar && !avatarFailed"
        class="conversation-list-item__avatar"
        :src="session.avatar"
        :alt="displayName"
        loading="lazy"
        decoding="async"
        @error="avatarFailed = true"
      >
      <span v-else class="conversation-list-item__fallback-avatar" aria-hidden="true">
        {{ displayName.slice(0, 1) }}
      </span>
    </span>

    <span class="conversation-list-item__body">
      <span class="conversation-list-item__heading">
        <span class="conversation-list-item__name">
          <strong>{{ displayName }}</strong>
          <span v-if="session.assistantType" class="conversation-list-item__assistant-label">
            {{ assistantLabel }}
          </span>
        </span>
        <time v-if="displayTime">{{ displayTime }}</time>
      </span>
      <span class="conversation-list-item__meta">
        <span class="conversation-list-item__summary">{{ displaySummary }}</span>
        <span class="conversation-list-item__status">
          <Tooltip v-if="session.pinned" :content="t('notifications.whisper.pinned')" placement="top">
            <i i-mingcute:pin-line aria-hidden="true" />
          </Tooltip>
          <Tooltip v-if="session.muted" :content="t('notifications.whisper.muted')" placement="top">
            <i i-mingcute:notification-off-line aria-hidden="true" />
          </Tooltip>
          <span
            v-if="session.unreadCount > 0"
            class="conversation-list-item__badge"
            :aria-label="t('notifications.whisper.unread_count', { count: session.unreadCount })"
          >
            {{ session.unreadCount > 99 ? '99+' : session.unreadCount }}
          </span>
        </span>
      </span>
    </span>
  </button>
</template>

<style scoped lang="scss">
.conversation-list-item {
  display: flex;
  gap: var(--bew-space-3);
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: var(--bew-space-3);
  color: var(--bew-text-1);
  text-align: left;
  text-decoration: none;
  appearance: none;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);
}

.conversation-list-item:hover {
  background: var(--bew-fill-1);
}

.conversation-list-item--selected {
  background: var(--bew-theme-color-10);
}

.conversation-list-item--compact {
  padding: var(--bew-space-2) var(--bew-space-3);
}

.conversation-list-item__avatar-wrap,
.conversation-list-item__avatar,
.conversation-list-item__fallback-avatar {
  width: var(--bew-control-height-lg);
  height: var(--bew-control-height-lg);
}

.conversation-list-item__avatar-wrap,
.conversation-list-item__avatar,
.conversation-list-item__fallback-avatar {
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
}

.conversation-list-item__avatar {
  display: block;
  object-fit: cover;
}

.conversation-list-item__fallback-avatar {
  display: inline-grid;
  place-items: center;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
  background: var(--bew-fill-1);
}

.conversation-list-item__body,
.conversation-list-item__heading,
.conversation-list-item__name,
.conversation-list-item__meta {
  min-width: 0;
}

.conversation-list-item__body {
  display: grid;
  flex: 1 1 auto;
  gap: var(--bew-space-1);
}

.conversation-list-item__heading,
.conversation-list-item__meta {
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
}

.conversation-list-item__name {
  display: flex;
  min-width: 0;
  gap: var(--bew-space-1);
  align-items: center;
}

.conversation-list-item__assistant-label {
  flex: 0 0 auto;
  max-width: 50%;
  padding: 0 var(--bew-space-1);
  overflow: hidden;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--bew-fill-1);
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
}

.conversation-list-item strong {
  min-width: 0;
  overflow: hidden;
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-list-item time,
.conversation-list-item__summary {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-regular);
  line-height: var(--bew-line-height-caption);
}

.conversation-list-item time {
  flex: 0 0 auto;
  margin-left: auto;
}

.conversation-list-item__summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-list-item__status {
  display: inline-flex;
  flex: 0 0 auto;
  gap: var(--bew-space-1);
  align-items: center;
  margin-left: auto;
  color: var(--bew-text-3);
  font-size: var(--bew-icon-size-sm);
}

.conversation-list-item__badge {
  display: inline-grid;
  place-items: center;
  min-width: var(--bew-space-4);
  height: var(--bew-space-4);
  padding: 0 var(--bew-space-1);
  color: var(--bew-on-theme-color);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-caption);
  background: var(--bew-theme-color);
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
}

@media (prefers-reduced-motion: reduce) {
  .conversation-list-item {
    transition: none;
  }
}
</style>
