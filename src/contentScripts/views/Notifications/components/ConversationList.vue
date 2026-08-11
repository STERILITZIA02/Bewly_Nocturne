<script setup lang="ts">
import type { ComponentPublicInstance, CSSProperties } from 'vue'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ContextMenu from '~/components/ContextMenu.vue'
import Input from '~/components/Input.vue'
import LiquidSegmentIndicator from '~/components/LiquidSegmentIndicator.vue'

import type { ConversationFilter } from '../composables/usePrivateSessions'
import type { DisplayConversation } from '../types'

const props = defineProps<{
  items: DisplayConversation[]
  selectedKey: string
  loading: boolean
  loaded: boolean
  noMore: boolean
  error: string
  search: string
  filter: ConversationFilter
  initialScrollTop: number
}>()

const emit = defineEmits<{
  'select': [conversation: DisplayConversation]
  'loadMore': []
  'retry': []
  'pin': [conversation: DisplayConversation, pinned: boolean]
  'mute': [conversation: DisplayConversation]
  'read': [conversation: DisplayConversation]
  'remove': [conversation: DisplayConversation]
  'openProfile': [conversation: DisplayConversation]
  'openOriginal': [conversation: DisplayConversation]
  'update:search': [value: string]
  'update:filter': [value: ConversationFilter]
  'scrollPosition': [top: number]
}>()

const { t } = useI18n()
const listRef = ref<HTMLElement | null>(null)
const sentinelRef = ref<HTMLElement | null>(null)
const rovingKey = ref('')
const itemRefs = new Map<string, HTMLButtonElement>()
const contextConversation = ref<DisplayConversation | null>(null)
const contextMenuStyles = ref<CSSProperties>({})
let intersectionObserver: IntersectionObserver | undefined
let longPressTimer: ReturnType<typeof setTimeout> | undefined
let scrollFrame = 0
let longPressTriggered = false

const filters: { value: ConversationFilter, label: string }[] = [
  { value: 'all', label: 'notifications.filters.all' },
  { value: 'unread', label: 'notifications.filters.unread' },
  { value: 'followed', label: 'notifications.filters.followed' },
  { value: 'unfollowed', label: 'notifications.filters.unfollowed' },
  { value: 'system', label: 'notifications.filters.system' },
  { value: 'pinned', label: 'notifications.filters.pinned' },
]

const contextOptions = computed(() => {
  const current = contextConversation.value
  if (!current)
    return []
  const options = [
    {
      value: 'pin',
      label: t(current.isPinned ? 'notifications.actions.unpin' : 'notifications.actions.pin'),
      icon: current.isPinned ? 'i-tabler-pinned-off' : 'i-tabler-pin',
    },
    {
      value: 'mute',
      label: t(current.isMuted ? 'notifications.actions.unmute' : 'notifications.actions.mute'),
      icon: current.isMuted ? 'i-tabler-bell' : 'i-tabler-bell-off',
    },
    {
      value: 'read',
      label: t('notifications.actions.mark_read'),
      icon: 'i-tabler-mail-opened',
    },
    {
      value: 'openOriginal',
      label: t('notifications.actions.open_original'),
      icon: 'i-tabler-external-link',
    },
    {
      value: 'remove',
      label: t('notifications.actions.delete_conversation'),
      icon: 'i-tabler-trash',
      danger: true,
    },
  ]
  if (!current.isSystem && current.sessionType === '1') {
    options.splice(3, 0, {
      value: 'openProfile',
      label: t('notifications.actions.view_profile'),
      icon: 'i-tabler-user-external',
      danger: false,
    })
  }
  return options
})

function formatTime(timestamp: number) {
  if (!timestamp)
    return ''
  const date = new Date(timestamp * 1000)
  const now = new Date()
  return date.toDateString() === now.toDateString()
    ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function getConversationSummary(conversation: DisplayConversation) {
  if (conversation.isSupportGroup)
    return t(conversation.unreadCount ? 'notifications.conversations.support_group_new' : 'notifications.conversations.support_group_empty')
  if (conversation.lastMessage)
    return conversation.lastMessage
  if (conversation.lastMessageKind === 'image')
    return t('notifications.message_types.image')
  if (conversation.lastMessageKind === 'withdrawn')
    return t('notifications.message_types.withdrawn')
  return t('notifications.conversations.no_messages')
}

function getConversationName(conversation: DisplayConversation) {
  return conversation.isSupportGroup
    ? t('notifications.conversations.support_group')
    : conversation.name || t('notifications.conversations.unknown_user')
}

function setItemRef(key: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLButtonElement)
    itemRefs.set(key, element)
  else
    itemRefs.delete(key)
}

function openContextMenu(conversation: DisplayConversation, event: MouseEvent | PointerEvent) {
  event.preventDefault()
  contextConversation.value = conversation
  contextMenuStyles.value = {
    position: 'fixed',
    left: `${Math.min(event.clientX, window.innerWidth - 160)}px`,
    top: `${Math.min(event.clientY, window.innerHeight - 240)}px`,
  }
}

function handleContextAction(value: string | number) {
  const current = contextConversation.value
  if (!current)
    return
  if (value === 'pin')
    emit('pin', current, !current.isPinned)
  else if (value === 'mute')
    emit('mute', current)
  else if (value === 'read')
    emit('read', current)
  else if (value === 'remove')
    emit('remove', current)
  else if (value === 'openProfile')
    emit('openProfile', current)
  else if (value === 'openOriginal')
    emit('openOriginal', current)
  contextConversation.value = null
}

function cancelLongPress() {
  if (longPressTimer !== undefined)
    clearTimeout(longPressTimer)
  longPressTimer = undefined
}

function handlePointerDown(conversation: DisplayConversation, event: PointerEvent) {
  if (event.pointerType === 'mouse')
    return
  cancelLongPress()
  longPressTriggered = false
  longPressTimer = setTimeout(() => {
    longPressTriggered = true
    openContextMenu(conversation, event)
  }, 550)
}

function handleConversationClick(conversation: DisplayConversation, event: MouseEvent) {
  if (longPressTriggered) {
    event.preventDefault()
    longPressTriggered = false
    return
  }
  emit('select', conversation)
}

function handleListKeydown(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key))
    return
  const activeIndex = props.items.findIndex(item => itemRefs.get(item.key) === document.activeElement)
  if (activeIndex < 0)
    return
  event.preventDefault()
  const delta = event.key === 'ArrowDown' ? 1 : -1
  const next = props.items[(activeIndex + delta + props.items.length) % props.items.length]
  if (!next)
    return
  rovingKey.value = next.key
  void nextTick(() => itemRefs.get(next.key)?.focus())
}

function setupObserver() {
  intersectionObserver?.disconnect()
  if (!sentinelRef.value)
    return
  intersectionObserver = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting) && !props.loading && !props.noMore)
      emit('loadMore')
  }, { root: listRef.value, rootMargin: '160px' })
  intersectionObserver.observe(sentinelRef.value)
}

function scheduleScrollPosition() {
  if (scrollFrame)
    return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    emit('scrollPosition', listRef.value?.scrollTop || 0)
  })
}

watch(() => props.items, async () => {
  const keys = new Set(props.items.map(item => item.key))
  if (contextConversation.value && !keys.has(contextConversation.value.key)) {
    cancelLongPress()
    contextConversation.value = null
  }
  itemRefs.forEach((_element, key) => {
    if (!keys.has(key))
      itemRefs.delete(key)
  })
  if (!keys.has(rovingKey.value))
    rovingKey.value = keys.has(props.selectedKey) ? props.selectedKey : props.items[0]?.key || ''
  await nextTick()
  setupObserver()
}, { immediate: true })
watch(() => props.selectedKey, (key) => {
  if (key)
    rovingKey.value = key
})

onMounted(async () => {
  await nextTick()
  if (listRef.value)
    listRef.value.scrollTop = props.initialScrollTop
  setupObserver()
})
onBeforeUnmount(() => {
  if (scrollFrame)
    cancelAnimationFrame(scrollFrame)
  emit('scrollPosition', listRef.value?.scrollTop || 0)
  intersectionObserver?.disconnect()
  cancelLongPress()
})

defineExpose({ scrollRef: listRef })
</script>

<template>
  <section class="conversation-list" :aria-label="t('notifications.conversations.title')">
    <header class="conversation-list__header">
      <div class="conversation-list__title-row">
        <h2>{{ t('notifications.sections.whisper') }}</h2>
      </div>
      <Input
        :model-value="search"
        size="small"
        :placeholder="t('notifications.conversations.search_loaded')"
        :aria-label="t('notifications.conversations.search_loaded')"
        @update:model-value="emit('update:search', String($event || ''))"
      >
        <template #prefix>
          <i i-tabler-search aria-hidden="true" />
        </template>
      </Input>
      <div class="bew-segment-control conversation-list__filters" role="tablist" :aria-label="t('notifications.filters.label')">
        <button
          v-for="item in filters"
          :key="item.value"
          type="button"
          class="bew-segment-control__item"
          :data-active="filter === item.value"
          data-segment-item
          role="tab"
          :aria-selected="filter === item.value"
          @click="emit('update:filter', item.value)"
        >
          {{ t(item.label) }}
        </button>
        <LiquidSegmentIndicator :active-key="filter" />
      </div>
    </header>

    <div
      ref="listRef"
      class="conversation-list__scroll"
      role="listbox"
      :aria-busy="loading"
      @scroll.passive="scheduleScrollPosition"
      @keydown="handleListKeydown"
    >
      <button
        v-for="conversation in items"
        :key="conversation.key"
        :ref="element => setItemRef(conversation.key, element)"
        type="button"
        :tabindex="rovingKey === conversation.key ? 0 : -1"
        class="conversation-list__item"
        :class="{ 'is-selected': selectedKey === conversation.key }"
        role="option"
        :aria-selected="selectedKey === conversation.key"
        @click="handleConversationClick(conversation, $event)"
        @focus="rovingKey = conversation.key"
        @contextmenu="openContextMenu(conversation, $event)"
        @pointerdown="handlePointerDown(conversation, $event)"
        @pointerup="cancelLongPress"
        @pointercancel="cancelLongPress"
        @pointermove="cancelLongPress"
      >
        <img v-if="conversation.avatar" :src="conversation.avatar" alt="" loading="lazy" class="conversation-list__avatar">
        <span v-else class="conversation-list__avatar conversation-list__avatar--fallback" aria-hidden="true">
          <i i-tabler-user />
        </span>
        <span class="conversation-list__body">
          <span class="conversation-list__name-row">
            <strong>{{ getConversationName(conversation) }}</strong>
            <time>{{ formatTime(conversation.timestamp) }}</time>
          </span>
          <span class="conversation-list__summary-row">
            <span class="conversation-list__summary">{{ getConversationSummary(conversation) }}</span>
            <i v-if="conversation.isPinned" i-tabler-pin-filled :title="t('notifications.status.pinned')" aria-hidden="true" />
            <i v-if="conversation.isMuted" i-tabler-bell-off :title="t('notifications.status.muted')" aria-hidden="true" />
            <span v-if="conversation.unreadCount" class="conversation-list__unread">
              {{ conversation.unreadCount > 99 ? '99+' : conversation.unreadCount }}
            </span>
          </span>
        </span>
      </button>

      <div v-if="!items.length && loaded && !loading" class="conversation-list__empty" role="status">
        <i i-tabler-messages-off aria-hidden="true" />
        <span>{{ search || filter !== 'all' ? t('notifications.empty.no_matching_conversations') : t('notifications.empty.no_conversations') }}</span>
      </div>
      <div v-if="error && !items.length" class="conversation-list__error" role="alert">
        <span>{{ t('notifications.status.load_failed') }}</span>
        <button type="button" @click="emit('retry')">
          {{ t('notifications.actions.retry') }}
        </button>
      </div>
      <div ref="sentinelRef" class="conversation-list__sentinel" aria-hidden="true" />
      <div v-if="loading" class="conversation-list__loading" role="status">
        <i i-svg-spinners-180-ring-with-bg aria-hidden="true" />
        <span>{{ t('common.loading') }}</span>
      </div>
    </div>

    <ContextMenu
      v-if="contextConversation"
      :options="contextOptions"
      :menu-styles="contextMenuStyles"
      @select="handleContextAction"
      @close="contextConversation = null"
    />
  </section>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.conversation-list {
  display: flex;
  width: var(--bew-notifications-session-width);
  min-width: 0;
  flex: 0 0 auto;
  flex-direction: column;
  background: var(--bew-content);
  border-right: 1px solid var(--bew-border-color);
}

.conversation-list__header {
  position: sticky;
  z-index: 1;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  padding: var(--bew-space-4);
  background: var(--bew-notifications-list-header-background);
  border-bottom: 1px solid var(--bew-border-color);
  backdrop-filter: var(--bew-filter-glass-1);
}

.conversation-list__title-row,
.conversation-list__name-row,
.conversation-list__summary-row {
  display: flex;
  min-width: 0;
  align-items: center;
}

.conversation-list__title-row {
  justify-content: space-between;

  h2 {
    margin: 0;
    font-size: var(--bew-font-size-title);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-title);
  }
}

.conversation-list__filters {
  width: 100%;
  justify-content: flex-start;
  overflow-x: auto;

  .bew-segment-control__item {
    flex: 0 0 auto;
    padding-inline: var(--bew-space-2);
  }
}

.conversation-list__scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
}

.conversation-list__item {
  display: grid;
  width: 100%;
  min-height: 72px;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  gap: var(--bew-space-3);
  padding: var(--bew-space-3) var(--bew-space-4);
  color: var(--bew-text-1);
  font: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--bew-border-color);
  cursor: pointer;
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover {
    background: var(--bew-fill-1);
  }

  &:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--bew-theme-focus-ring);
    outline-offset: -3px;
  }

  &.is-selected {
    background: var(--bew-theme-color-10);
  }
}

.conversation-list__avatar {
  width: 44px;
  height: 44px;
  object-fit: cover;
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: 50%;
  corner-shape: round;
}

.conversation-list__avatar--fallback {
  display: grid;
  place-items: center;
  color: var(--bew-text-3);
}

.conversation-list__body,
.conversation-list__summary {
  min-width: 0;
}

.conversation-list__name-row {
  gap: var(--bew-space-2);

  strong,
  time {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    flex: 1;
    font-size: var(--bew-font-size-body);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-body);
  }

  time {
    color: var(--bew-text-3);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
  }
}

.conversation-list__summary-row {
  height: var(--bew-line-height-control);
  gap: var(--bew-space-1);
  margin-top: var(--bew-space-1);
  color: var(--bew-text-3);

  > i {
    width: var(--bew-icon-size-sm);
    height: var(--bew-icon-size-sm);
    flex: 0 0 auto;
  }
}

.conversation-list__summary {
  flex: 1;
  overflow: hidden;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-list__unread {
  min-width: 18px;
  height: 18px;
  flex: 0 0 auto;
  padding-inline: var(--bew-space-1);
  color: var(--bew-on-theme-color);
  font-size: var(--bew-font-size-caption);
  line-height: 18px;
  text-align: center;
  background: var(--bew-theme-color);
  border-radius: var(--bew-radius-full);
  corner-shape: round;
}

.conversation-list__empty,
.conversation-list__error,
.conversation-list__loading {
  display: flex;
  min-height: 160px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: var(--bew-space-3);
  padding: var(--bew-space-6);
  color: var(--bew-text-3);
  text-align: center;
}

.conversation-list__empty > i {
  width: var(--bew-icon-size-xl);
  height: var(--bew-icon-size-xl);
}

.conversation-list__loading > i {
  width: var(--bew-icon-size-lg);
  height: var(--bew-icon-size-lg);
}

.conversation-list__error button {
  color: var(--bew-theme-color);
  background: none;
  border: 0;
  cursor: pointer;
}

.conversation-list__sentinel {
  height: 1px;
}

@media (width < breakpoints.$grid-lg) {
  .conversation-list {
    width: min(320px, calc(100% - var(--bew-notifications-nav-compact-width)));
  }
}

@media (width < breakpoints.$grid-md) {
  .conversation-list {
    width: 100%;
    border-right: 0;
  }
}
</style>
