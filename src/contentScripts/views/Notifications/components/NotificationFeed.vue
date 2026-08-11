<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ImageViewer from '~/components/ImageViewer.vue'

import type { DisplayNotification, NotificationFeedSection } from '../types'

const props = defineProps<{
  section: NotificationFeedSection
  items: DisplayNotification[]
  loading: boolean
  loaded: boolean
  noMore: boolean
  error: string
  busyIds: Set<string>
  initialScrollTop: number
}>()

const emit = defineEmits<{
  'loadMore': []
  'refresh': []
  'delete': [item: DisplayNotification]
  'like': [item: DisplayNotification]
  'reply': [item: DisplayNotification, message: string, done: (success: boolean) => void]
  'scrollPosition': [section: NotificationFeedSection, top: number]
}>()

const { t } = useI18n()
const scrollRef = ref<HTMLElement | null>(null)
const sentinelRef = ref<HTMLElement | null>(null)
const unreadOnly = ref(false)
const replyingId = ref('')
const replyDraft = ref('')
const replySending = ref(false)
const viewerImages = ref<string[]>([])
const viewerIndex = ref(-1)
let viewerTrigger: HTMLElement | null = null
let intersectionObserver: IntersectionObserver | undefined
let scrollFrame = 0
let replyRequestId = 0

const visibleItems = computed(() => unreadOnly.value ? props.items.filter(item => item.unread) : props.items)

function formatTime(timestamp: number) {
  if (!timestamp)
    return ''
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000))
}

function actionLabel(item: DisplayNotification) {
  if (item.section === 'reply')
    return t('notifications.feed.replied')
  if (item.section === 'at')
    return t('notifications.feed.mentioned')
  if (item.section === 'love')
    return t('notifications.feed.liked')
  return t('notifications.feed.system_sent')
}

function openImage(item: DisplayNotification, event: MouseEvent) {
  if (!item.image)
    return
  viewerTrigger = event.currentTarget as HTMLElement
  viewerImages.value = [item.image]
  viewerIndex.value = 0
}

async function closeViewer() {
  viewerIndex.value = -1
  await nextTick()
  viewerTrigger?.focus({ preventScroll: true })
  viewerTrigger = null
}

function submitReply(item: DisplayNotification) {
  const value = replyDraft.value.trim()
  if (!value || replySending.value)
    return
  const requestId = ++replyRequestId
  const section = props.section
  const itemId = item.id
  replySending.value = true
  emit('reply', item, value, (success) => {
    if (requestId !== replyRequestId || props.section !== section || replyingId.value !== itemId)
      return
    replySending.value = false
    if (success) {
      replyDraft.value = ''
      replyingId.value = ''
    }
  })
}

function toggleReply(item: DisplayNotification) {
  replyRequestId += 1
  replySending.value = false
  replyDraft.value = ''
  replyingId.value = replyingId.value === item.id ? '' : item.id
}

function setupObserver() {
  intersectionObserver?.disconnect()
  if (!sentinelRef.value)
    return
  intersectionObserver = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting) && !props.loading && !props.noMore)
      emit('loadMore')
  }, { root: scrollRef.value, rootMargin: '240px' })
  intersectionObserver.observe(sentinelRef.value)
}

function scheduleScrollPosition() {
  if (scrollFrame)
    return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    emit('scrollPosition', props.section, scrollRef.value?.scrollTop || 0)
  })
}

watch(() => props.items, async () => {
  await nextTick()
  setupObserver()
})
watch(() => props.section, async (_section, previousSection) => {
  emit('scrollPosition', previousSection, scrollRef.value?.scrollTop || 0)
  replyRequestId += 1
  replyingId.value = ''
  replyDraft.value = ''
  replySending.value = false
  await nextTick()
  if (scrollRef.value)
    scrollRef.value.scrollTop = props.initialScrollTop
  setupObserver()
})
onMounted(async () => {
  await nextTick()
  if (scrollRef.value)
    scrollRef.value.scrollTop = props.initialScrollTop
  setupObserver()
})
onBeforeUnmount(() => {
  replyRequestId += 1
  if (scrollFrame)
    cancelAnimationFrame(scrollFrame)
  emit('scrollPosition', props.section, scrollRef.value?.scrollTop || 0)
  intersectionObserver?.disconnect()
})

defineExpose({ scrollRef })
</script>

<template>
  <section class="notification-feed">
    <header class="notification-feed__header">
      <div>
        <h2>{{ t(`notifications.sections.${section}`) }}</h2>
        <p>{{ t(`notifications.feed.description_${section}`) }}</p>
      </div>
      <div class="notification-feed__tools">
        <label class="notification-feed__unread-toggle">
          <input v-model="unreadOnly" type="checkbox">
          <span>{{ t('notifications.filters.unread_only') }}</span>
        </label>
        <button type="button" :aria-label="t('notifications.actions.refresh')" @click="emit('refresh')">
          <i i-tabler-refresh aria-hidden="true" />
        </button>
      </div>
    </header>

    <div ref="scrollRef" class="notification-feed__scroll" :aria-busy="loading" @scroll.passive="scheduleScrollPosition">
      <div class="notification-feed__content" role="feed">
        <article v-for="item in visibleItems" :key="item.id" class="notification-feed__item" :class="{ 'is-unread': item.unread, 'is-system': item.section === 'system' }">
          <div v-if="item.section !== 'system'" class="notification-feed__actors">
            <img v-if="item.actors[0]?.avatar" :src="item.actors[0].avatar" alt="" loading="lazy">
            <span v-else class="notification-feed__actor-fallback" aria-hidden="true"><i i-tabler-user /></span>
          </div>
          <div class="notification-feed__body">
            <div class="notification-feed__meta">
              <template v-if="item.section !== 'system'">
                <strong>{{ item.actors[0]?.name || t('notifications.conversations.unknown_user') }}</strong>
                <span>{{ actionLabel(item) }}</span>
                <span v-if="item.actorCount > 1">+{{ item.actorCount - 1 }}</span>
              </template>
              <time>{{ formatTime(item.timestamp) }}</time>
            </div>
            <h3 v-if="item.title">
              {{ item.title }}
            </h3>
            <p v-if="item.body" class="notification-feed__text">
              {{ item.body }}
            </p>
            <blockquote v-if="item.quote">
              {{ item.quote }}
            </blockquote>
            <button v-if="item.image" type="button" class="notification-feed__image" @click="openImage(item, $event)">
              <img :src="item.image" :alt="item.title" loading="lazy">
            </button>
            <div class="notification-feed__actions">
              <button v-if="item.canReply" type="button" :disabled="busyIds.has(item.id)" @click="toggleReply(item)">
                <i i-tabler-message-reply aria-hidden="true" />
                {{ t('notifications.actions.reply') }}
              </button>
              <button v-if="item.canLike" type="button" :disabled="busyIds.has(item.id)" :class="{ 'is-active': item.liked }" @click="emit('like', item)">
                <i :class="item.liked ? 'i-tabler-thumb-up-filled' : 'i-tabler-thumb-up'" aria-hidden="true" />
                {{ t(item.liked ? 'notifications.actions.unlike' : 'notifications.actions.like') }}
              </button>
              <ALink v-if="item.href" :href="item.href" class="notification-feed__link">
                <i i-tabler-external-link aria-hidden="true" />
                {{ t('notifications.actions.view_source') }}
              </ALink>
              <ALink v-for="link in item.links" :key="`${item.id}:${link.href}`" :href="link.href" class="notification-feed__link">
                <i i-tabler-external-link aria-hidden="true" />
                {{ link.text }}
              </ALink>
              <button v-if="section !== 'system'" type="button" class="is-danger" :disabled="busyIds.has(item.id)" @click="emit('delete', item)">
                <i i-tabler-trash aria-hidden="true" />
                {{ t('notifications.actions.delete') }}
              </button>
            </div>
            <form v-if="replyingId === item.id" class="notification-feed__reply" @submit.prevent="submitReply(item)">
              <textarea
                v-model="replyDraft"
                rows="2"
                :placeholder="t('notifications.composer.reply_placeholder')"
                :aria-label="t('notifications.composer.reply_placeholder')"
              />
              <Button native-type="submit" type="primary" size="small" :disabled="!replyDraft.trim() || replySending">
                {{ t('notifications.actions.send') }}
              </Button>
            </form>
          </div>
        </article>

        <div v-if="!visibleItems.length && loaded && !loading" class="notification-feed__empty" role="status">
          <i i-tabler-inbox aria-hidden="true" />
          <h3>{{ t(unreadOnly ? 'notifications.empty.no_unread' : `notifications.empty.${section}`) }}</h3>
          <p>{{ t('notifications.empty.feed_hint') }}</p>
        </div>
        <div v-if="error && !items.length" class="notification-feed__error" role="alert">
          <p>{{ t('notifications.status.load_failed') }}</p>
          <Button type="secondary" size="small" @click="emit('refresh')">
            {{ t('notifications.actions.retry') }}
          </Button>
        </div>
        <div ref="sentinelRef" class="notification-feed__sentinel" aria-hidden="true" />
        <div v-if="loading" class="notification-feed__loading" role="status">
          <i i-svg-spinners-180-ring-with-bg aria-hidden="true" />
          <span>{{ t('common.loading') }}</span>
        </div>
      </div>
    </div>

    <ImageViewer
      v-if="viewerIndex >= 0"
      v-model="viewerIndex"
      :images="viewerImages"
      @close="closeViewer"
    />
  </section>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.notification-feed {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--bew-content-alt);
}

.notification-feed__header {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: var(--bew-notifications-header-height);
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-4);
  padding: var(--bew-space-3) var(--bew-space-5);
  background: var(--bew-notifications-detail-header-background);
  border-bottom: 1px solid var(--bew-border-color);
  backdrop-filter: var(--bew-filter-glass-1);

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: var(--bew-font-size-title);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-title);
  }

  p {
    color: var(--bew-text-3);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
  }
}

.notification-feed__tools,
.notification-feed__unread-toggle,
.notification-feed__actions {
  display: flex;
  align-items: center;
}

.notification-feed__tools {
  gap: var(--bew-space-2);

  > button {
    display: grid;
    width: var(--bew-icon-button-size-sm);
    height: var(--bew-icon-button-size-sm);
    place-items: center;
    color: var(--bew-text-2);
    background: var(--bew-fill-1);
    border: 0;
    border-radius: 50%;
    corner-shape: round;
    cursor: pointer;
  }
}

.notification-feed__unread-toggle {
  gap: var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}

.notification-feed__scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
}

.notification-feed__content {
  width: min(100%, var(--bew-notifications-content-max-width));
  margin-inline: auto;
  padding: var(--bew-space-5);
}

.notification-feed__item {
  position: relative;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: var(--bew-space-3);
  padding: var(--bew-space-5) 0;
  border-bottom: 1px solid var(--bew-border-color);

  &.is-system {
    grid-template-columns: minmax(0, 1fr);
  }

  &.is-unread::before {
    position: absolute;
    top: var(--bew-space-6);
    left: calc(var(--bew-space-3) * -1);
    width: 6px;
    height: 6px;
    background: var(--bew-theme-color);
    border-radius: 50%;
    corner-shape: round;
    content: "";
  }
}

.notification-feed__actors img,
.notification-feed__actor-fallback {
  width: 44px;
  height: 44px;
  object-fit: cover;
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: 50%;
  corner-shape: round;
}

.notification-feed__actor-fallback {
  display: grid;
  place-items: center;
  color: var(--bew-text-3);
}

.notification-feed__body {
  min-width: 0;

  h3 {
    margin: var(--bew-space-2) 0 0;
    font-size: var(--bew-font-size-title);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-title);
  }

  blockquote {
    margin: var(--bew-space-3) 0 0;
    padding: var(--bew-space-3);
    color: var(--bew-text-2);
    background: var(--bew-fill-1);
    border: 0;
    border-left: 2px solid var(--bew-theme-color-40);
    border-radius: var(--bew-interactive-radius);
    corner-shape: var(--bew-corner-shape);
  }
}

.notification-feed__meta {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: var(--bew-space-2);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);

  strong {
    max-width: 40%;
    overflow: hidden;
    color: var(--bew-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  time {
    margin-left: auto;
    white-space: nowrap;
  }
}

.notification-feed__text {
  margin: var(--bew-space-2) 0 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
  white-space: pre-wrap;
}

.notification-feed__image {
  display: block;
  max-width: 360px;
  margin-top: var(--bew-space-3);
  padding: 0;
  overflow: hidden;
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-media-radius);
  corner-shape: var(--bew-corner-shape);
  cursor: zoom-in;

  img {
    display: block;
    width: 100%;
    max-height: 240px;
    object-fit: cover;
  }
}

.notification-feed__actions {
  flex-wrap: wrap;
  gap: var(--bew-space-3);
  margin-top: var(--bew-space-3);

  button,
  .notification-feed__link {
    display: inline-flex;
    min-height: 28px;
    align-items: center;
    gap: var(--bew-space-1);
    padding: 0;
    color: var(--bew-text-2);
    font: inherit;
    font-size: var(--bew-font-size-control);
    background: none;
    border: 0;
    cursor: pointer;

    &:hover,
    &.is-active {
      color: var(--bew-theme-color);
    }

    &.is-danger:hover {
      color: var(--bew-error-color);
    }
  }
}

.notification-feed__reply {
  display: flex;
  align-items: flex-end;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-3);

  textarea {
    min-height: 56px;
    flex: 1;
    resize: vertical;
    color: var(--bew-text-1);
    font: inherit;
    background: var(--bew-fill-1);
    border: 1px solid var(--bew-surface-border-color);
    border-radius: var(--bew-interactive-radius);
    corner-shape: var(--bew-corner-shape);
    outline: none;
    padding: var(--bew-space-2) var(--bew-space-3);

    &:focus-visible {
      outline: 2px solid var(--bew-theme-focus-ring);
      outline-offset: 2px;
    }
  }
}

.notification-feed__empty,
.notification-feed__error,
.notification-feed__loading {
  display: flex;
  min-height: 320px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: var(--bew-space-3);
  color: var(--bew-text-3);
  text-align: center;

  h3,
  p {
    margin: 0;
  }
}

.notification-feed__empty > i {
  width: 72px;
  height: 72px;
}

.notification-feed__loading > i {
  width: var(--bew-icon-size-lg);
  height: var(--bew-icon-size-lg);
}

.notification-feed__sentinel {
  height: 1px;
}

@media (width < breakpoints.$grid-md) {
  .notification-feed__header,
  .notification-feed__content {
    padding-inline: var(--bew-space-4);
  }
}
</style>
