<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ImageViewer from '~/components/ImageViewer.vue'
import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import { validatePrivateMessageImage } from '../privateMessageImage'
import type { DisplayConversation, DisplayMessage } from '../types'
import MessageRenderer from './MessageRenderer.vue'

const props = defineProps<{
  conversation: DisplayConversation
  messages: DisplayMessage[]
  loading: boolean
  loadingOlder: boolean
  noMore: boolean
  sending: boolean
  uploading: boolean
  error: string
  draft: string
}>()

const emit = defineEmits<{
  'back': []
  'loadOlder': []
  'refresh': []
  'sendText': [text: string]
  'sendImage': [file: File]
  'imageRejected': [reason: 'image_too_large' | 'gif_too_large']
  'retry': [message: DisplayMessage]
  'retract': [message: DisplayMessage]
  'acknowledge': []
  'pin': [pinned: boolean]
  'mute': []
  'openOriginal': []
  'update:draft': [value: string]
}>()

const { t } = useI18n()
const scrollRef = ref<HTMLElement | null>(null)
const composerRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const viewerImages = ref<string[]>([])
const viewerIndex = ref(-1)
let viewerTrigger: HTMLElement | null = null
let beforePrependHeight = 0
let beforePrependTop = 0

const originalUrl = computed(() => buildOriginalNotificationUrl('whisper', {
  talker: props.conversation.talkerId,
  sessionType: props.conversation.sessionType,
}))
const conversationName = computed(() => props.conversation.isSupportGroup
  ? t('notifications.conversations.support_group')
  : props.conversation.name || t('notifications.conversations.unknown_user'))

function formatTime(timestamp: number) {
  if (!timestamp)
    return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000))
}

function isNewDay(message: DisplayMessage, index: number) {
  if (index === 0)
    return true
  const previous = props.messages[index - 1]
  return new Date(message.timestamp * 1000).toDateString() !== new Date(previous.timestamp * 1000).toDateString()
}

function isGrouped(message: DisplayMessage, index: number) {
  if (index === 0 || isNewDay(message, index))
    return false
  const previous = props.messages[index - 1]
  return previous.senderId === message.senderId && message.timestamp - previous.timestamp < 300
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing)
    return
  event.preventDefault()
  submitText()
}

function submitText() {
  const value = props.draft.trim()
  if (!value || props.sending || props.uploading)
    return
  emit('sendText', value)
  emit('update:draft', '')
}

function sendImage(file: File | undefined) {
  if (!file || !file.type.startsWith('image/') || props.uploading || props.sending) {
    if (fileInputRef.value)
      fileInputRef.value.value = ''
    return false
  }
  const validationError = validatePrivateMessageImage(file)
  if (validationError) {
    emit('imageRejected', validationError)
    if (fileInputRef.value)
      fileInputRef.value.value = ''
    return false
  }
  emit('sendImage', file)
  if (fileInputRef.value)
    fileInputRef.value.value = ''
  return true
}

function handlePaste(event: ClipboardEvent) {
  const image = Array.from(event.clipboardData?.files ?? []).find(file => file.type.startsWith('image/'))
  if (image && sendImage(image)) {
    event.preventDefault()
  }
}

function handleDrop(event: DragEvent) {
  const image = Array.from(event.dataTransfer?.files ?? []).find(file => file.type.startsWith('image/'))
  if (image)
    sendImage(image)
}

function openImage(url: string, event: MouseEvent) {
  const images = props.messages.flatMap(message => message.content.kind === 'image' && message.content.url ? [message.content.url] : [])
  viewerImages.value = images
  viewerIndex.value = Math.max(0, images.indexOf(url))
  viewerTrigger = event.currentTarget as HTMLElement
}

async function closeViewer() {
  viewerIndex.value = -1
  await nextTick()
  viewerTrigger?.focus({ preventScroll: true })
  viewerTrigger = null
}

function scrollToBottom(behavior: ScrollBehavior = 'auto') {
  scrollRef.value?.scrollTo({ top: scrollRef.value.scrollHeight, behavior })
}

function requestOlder() {
  const element = scrollRef.value
  if (element) {
    beforePrependHeight = element.scrollHeight
    beforePrependTop = element.scrollTop
  }
  emit('loadOlder')
}

function handleScroll() {
  const element = scrollRef.value
  if (!element)
    return
  const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight
  if (distanceToBottom < 80 && !document.hidden)
    emit('acknowledge')
}

watch(() => props.loadingOlder, async (loading, previous) => {
  if (!loading && previous && scrollRef.value) {
    await nextTick()
    scrollRef.value.scrollTop = beforePrependTop + scrollRef.value.scrollHeight - beforePrependHeight
  }
})

watch(() => props.messages.length, async (length, previous) => {
  if (length <= previous)
    return
  const newest = props.messages.at(-1)
  const element = scrollRef.value
  const nearBottom = !element || element.scrollHeight - element.scrollTop - element.clientHeight < 160
  if (nearBottom || newest?.outgoing) {
    await nextTick()
    scrollToBottom(newest?.outgoing ? 'smooth' : 'auto')
    if (!document.hidden)
      emit('acknowledge')
  }
})

onMounted(async () => {
  await nextTick()
  scrollToBottom()
  handleScroll()
})
onBeforeUnmount(() => {
  viewerIndex.value = -1
})

defineExpose({ scrollRef, scrollToBottom })
</script>

<template>
  <section class="conversation-view">
    <header class="conversation-view__header">
      <button type="button" class="conversation-view__back" :aria-label="t('notifications.actions.back')" @click="emit('back')">
        <i i-tabler-chevron-left aria-hidden="true" />
      </button>
      <img v-if="conversation.avatar" :src="conversation.avatar" alt="" class="conversation-view__avatar">
      <span v-else class="conversation-view__avatar conversation-view__avatar--fallback" aria-hidden="true"><i i-tabler-user /></span>
      <div class="conversation-view__identity">
        <h2>{{ conversationName }}</h2>
        <span>{{ conversation.isSystem ? t('notifications.status.system_conversation') : conversation.isFollowed ? t('notifications.status.followed') : t('notifications.status.unfollowed') }}</span>
      </div>
      <div class="conversation-view__actions">
        <button type="button" :aria-label="t(conversation.isPinned ? 'notifications.actions.unpin' : 'notifications.actions.pin')" @click="emit('pin', !conversation.isPinned)">
          <i :class="conversation.isPinned ? 'i-tabler-pinned-off' : 'i-tabler-pin'" aria-hidden="true" />
        </button>
        <button type="button" :aria-label="t('notifications.actions.mute')" @click="emit('mute')">
          <i :class="conversation.isMuted ? 'i-tabler-bell' : 'i-tabler-bell-off'" aria-hidden="true" />
        </button>
        <button type="button" :aria-label="t('notifications.actions.open_original')" @click="emit('openOriginal')">
          <i i-tabler-external-link aria-hidden="true" />
        </button>
      </div>
    </header>

    <div ref="scrollRef" class="conversation-view__scroll" :aria-busy="loading" @scroll.passive="handleScroll">
      <div class="conversation-view__messages">
        <div class="conversation-view__older">
          <button v-if="!noMore && messages.length" type="button" :disabled="loadingOlder" @click="requestOlder">
            <i v-if="loadingOlder" i-svg-spinners-180-ring-with-bg aria-hidden="true" />
            {{ t(loadingOlder ? 'common.loading' : 'notifications.actions.load_older') }}
          </button>
        </div>
        <div v-if="loading && !messages.length" class="conversation-view__loading" role="status">
          <i i-svg-spinners-180-ring-with-bg aria-hidden="true" />
          <span>{{ t('common.loading') }}</span>
        </div>
        <div v-else-if="error && !messages.length" class="conversation-view__error" role="alert">
          <p>{{ t('notifications.status.load_failed') }}</p>
          <Button size="small" type="secondary" @click="emit('refresh')">
            {{ t('notifications.actions.retry') }}
          </Button>
        </div>
        <div v-else-if="!messages.length" class="conversation-view__empty" role="status">
          <i i-tabler-message-circle aria-hidden="true" />
          <p>{{ t('notifications.empty.no_messages') }}</p>
        </div>

        <template v-for="(message, index) in messages" :key="message.id">
          <div v-if="isNewDay(message, index)" class="conversation-view__date">
            {{ formatTime(message.timestamp) }}
          </div>
          <div
            class="conversation-view__message"
            :class="{
              'is-outgoing': message.outgoing,
              'is-grouped': isGrouped(message, index),
            }"
          >
            <div class="conversation-view__bubble">
              <MessageRenderer
                :message="message"
                :original-url="originalUrl"
                @image="openImage"
                @retry="emit('retry', $event)"
                @retract="emit('retract', $event)"
              />
            </div>
            <time>{{ formatTime(message.timestamp) }}</time>
          </div>
        </template>
      </div>
    </div>

    <form class="conversation-view__composer" @submit.prevent="submitText" @drop.prevent="handleDrop" @dragover.prevent>
      <input ref="fileInputRef" type="file" accept="image/*" hidden @change="sendImage(($event.target as HTMLInputElement).files?.[0])">
      <button type="button" :disabled="uploading || sending" :aria-label="t('notifications.composer.add_image')" @click="fileInputRef?.click()">
        <i v-if="uploading" i-svg-spinners-180-ring-with-bg aria-hidden="true" />
        <i v-else i-tabler-photo-plus aria-hidden="true" />
      </button>
      <textarea
        ref="composerRef"
        :value="draft"
        rows="1"
        :placeholder="t('notifications.composer.placeholder')"
        :aria-label="t('notifications.composer.placeholder')"
        @input="emit('update:draft', ($event.target as HTMLTextAreaElement).value)"
        @keydown="handleComposerKeydown"
        @paste="handlePaste"
      />
      <Button native-type="submit" type="primary" size="medium" :disabled="!draft.trim() || sending || uploading">
        <i v-if="sending" i-svg-spinners-180-ring-with-bg aria-hidden="true" />
        <span>{{ t('notifications.actions.send') }}</span>
      </Button>
    </form>

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

.conversation-view {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--bew-content-alt);
}

.conversation-view__header {
  position: relative;
  z-index: 1;
  display: grid;
  min-height: var(--bew-notifications-header-height);
  grid-template-columns: auto 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bew-space-3);
  padding: var(--bew-space-2) var(--bew-space-4);
  background: var(--bew-notifications-detail-header-background);
  border-bottom: 1px solid var(--bew-border-color);
  backdrop-filter: var(--bew-filter-glass-1);
}

.conversation-view__avatar {
  width: 40px;
  height: 40px;
  object-fit: cover;
  background: var(--bew-fill-1);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: 50%;
  corner-shape: round;
}

.conversation-view__avatar--fallback {
  display: grid;
  place-items: center;
  color: var(--bew-text-3);
}

.conversation-view__identity {
  min-width: 0;

  h2,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  h2 {
    margin: 0;
    font-size: var(--bew-font-size-title);
    font-weight: var(--bew-font-weight-semibold);
    line-height: var(--bew-line-height-title);
  }

  span {
    display: block;
    color: var(--bew-text-3);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
  }
}

.conversation-view__back,
.conversation-view__actions button,
.conversation-view__composer > button {
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

  &:hover:not(:disabled) {
    color: var(--bew-text-1);
    background: var(--bew-fill-2);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-focus-ring);
    outline-offset: 2px;
  }
}

.conversation-view__back {
  display: none;
}

.conversation-view__actions {
  display: flex;
  gap: var(--bew-space-2);
}

.conversation-view__scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
}

.conversation-view__messages {
  width: min(100%, var(--bew-notifications-content-max-width));
  min-height: 100%;
  margin-inline: auto;
  padding: var(--bew-space-4) var(--bew-space-5);
}

.conversation-view__older,
.conversation-view__date {
  display: flex;
  justify-content: center;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.conversation-view__older {
  min-height: 32px;
  align-items: center;

  button {
    display: inline-flex;
    min-height: 28px;
    align-items: center;
    gap: var(--bew-space-1);
    color: var(--bew-theme-color);
    font: inherit;
    background: none;
    border: 0;
    cursor: pointer;
  }
}

.conversation-view__date {
  margin-block: var(--bew-space-4);
}

.conversation-view__message {
  display: flex;
  align-items: flex-end;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-3);

  > time {
    color: var(--bew-text-3);
    font-size: var(--bew-font-size-caption);
    line-height: var(--bew-line-height-caption);
    opacity: 0;
    transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
  }

  &:hover > time,
  &:focus-within > time {
    opacity: 1;
  }

  &.is-grouped {
    margin-top: var(--bew-space-1);
  }

  &.is-outgoing {
    justify-content: flex-start;
    flex-direction: row-reverse;

    .conversation-view__bubble {
      background: color-mix(in srgb, var(--bew-theme-color) 18%, var(--bew-elevated-solid));
    }
  }
}

.conversation-view__bubble {
  max-width: 68%;
  padding: var(--bew-space-3) var(--bew-space-4);
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
  background: var(--bew-elevated-solid);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);
}

.conversation-view__composer {
  display: flex;
  min-height: var(--bew-notifications-composer-min-height);
  align-items: flex-end;
  gap: var(--bew-space-3);
  padding: var(--bew-space-3) var(--bew-space-4);
  background: var(--bew-elevated-solid);
  border-top: 1px solid var(--bew-border-color);

  textarea {
    min-height: var(--bew-control-height-lg);
    max-height: calc(var(--bew-line-height-body) * 5 + var(--bew-space-4));
    flex: 1;
    resize: none;
    overflow-y: auto;
    color: var(--bew-text-1);
    font: inherit;
    font-size: var(--bew-font-size-body);
    line-height: var(--bew-line-height-body);
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

.conversation-view__loading,
.conversation-view__error,
.conversation-view__empty {
  display: flex;
  min-height: 300px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: var(--bew-space-3);
  color: var(--bew-text-3);
  text-align: center;

  > i {
    width: 64px;
    height: 64px;
  }
}

@media (width < breakpoints.$grid-lg) {
  .conversation-view__back {
    display: grid;
  }
}

@media (width < breakpoints.$grid-md) {
  .conversation-view__messages {
    padding-inline: var(--bew-space-4);
  }

  .conversation-view__bubble {
    max-width: 82%;
  }
}
</style>
