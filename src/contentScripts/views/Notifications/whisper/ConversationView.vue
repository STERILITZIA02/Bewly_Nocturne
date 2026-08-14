<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { buildOriginalNotificationUrl } from '~/utils/notificationRoute'

import MessageComposer from './MessageComposer.vue'
import PrivateMessageImageViewer from './PrivateMessageImageViewer.vue'
import PrivateMessageItem from './PrivateMessageItem.vue'
import type { DisplayPrivateSession } from './privateSession'
import type { PrivateMessagesController } from './usePrivateMessages'

const props = defineProps<{
  active: boolean
  controller: PrivateMessagesController
  session: DisplayPrivateSession
}>()

const { t } = useI18n()
const originalUrl = buildOriginalNotificationUrl('whisper')
const messageScrollRef = ref<HTMLElement | null>(null)
const previewImage = ref('')
const composerRef = ref<InstanceType<typeof MessageComposer> | null>(null)
const state = computed(() => props.controller.getState(props.session.talkerId))
const draft = computed({
  get: () => state.value.draft,
  set: value => props.controller.setDraft(props.session.talkerId, value),
})
const errorMessage = computed(() => {
  const kind = state.value.errorKind
  if (!kind)
    return ''
  if (kind === 'wbi-unavailable')
    return t('notifications.whisper.errors.wbi-unavailable')
  return t(`notifications.native.errors.${kind}`)
})

const SCROLL_EDGE_THRESHOLD = 48
let activationGeneration = 0

function isAtLatest() {
  const viewport = messageScrollRef.value
  if (!viewport)
    return false
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= SCROLL_EDGE_THRESHOLD
}

function saveViewportState() {
  const viewport = messageScrollRef.value
  if (!viewport)
    return
  props.controller.updateViewport(props.session.talkerId, {
    atLatest: isAtLatest(),
    scrollTop: viewport.scrollTop,
  })
}

function scrollToLatest(behavior: ScrollBehavior = 'auto') {
  const viewport = messageScrollRef.value
  if (!viewport)
    return
  const resolvedBehavior = behavior === 'smooth' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : behavior
  viewport.scrollTo({ top: viewport.scrollHeight, behavior: resolvedBehavior })
  props.controller.updateViewport(props.session.talkerId, {
    atLatest: true,
    scrollTop: viewport.scrollHeight,
  })
}

async function acknowledgeIfEligible() {
  await nextTick()
  await props.controller.acknowledgeIfEligible(props.session.talkerId, {
    atLatest: isAtLatest(),
    pageActive: props.active,
    visible: document.visibilityState === 'visible',
  })
}

async function loadOlderMessages() {
  const viewport = messageScrollRef.value
  if (!viewport || state.value.loadingOlder || state.value.noMore)
    return

  const oldScrollHeight = viewport.scrollHeight
  const oldScrollTop = viewport.scrollTop
  await props.controller.loadOlder(props.session.talkerId)
  await nextTick()
  if (viewport === messageScrollRef.value)
    viewport.scrollTop = oldScrollTop + viewport.scrollHeight - oldScrollHeight
  saveViewportState()
}

async function refreshLatest(options: { forceBottom?: boolean } = {}) {
  const wasAtLatest = options.forceBottom || isAtLatest()
  await props.controller.refreshLatest(props.session.talkerId)
  await nextTick()
  if (wasAtLatest)
    scrollToLatest()
  else
    saveViewportState()
  await acknowledgeIfEligible()
}

async function sendDraft() {
  const request = props.controller.sendDraft(props.session.talkerId)
  await nextTick()
  scrollToLatest()
  await request
  await nextTick()
  if (isAtLatest())
    scrollToLatest()
}

async function retrySend(localId: string) {
  const request = props.controller.retrySend(props.session.talkerId, localId)
  await nextTick()
  scrollToLatest()
  await request
}

function editFailed(localId: string) {
  props.controller.editFailed(props.session.talkerId, localId)
  void nextTick(() => composerRef.value?.focus())
}

async function activateConversation() {
  if (!props.active)
    return
  const generation = ++activationGeneration
  const wasLoaded = state.value.loaded
  if (wasLoaded)
    await props.controller.refreshLatest(props.session.talkerId)
  else
    await props.controller.loadInitial(props.session.talkerId, props.session.ackSeqno)
  await nextTick()
  if (generation !== activationGeneration || !props.active)
    return

  const viewport = messageScrollRef.value
  if (!viewport)
    return
  if (!wasLoaded || state.value.atLatest)
    scrollToLatest()
  else
    viewport.scrollTop = state.value.scrollTop
  saveViewportState()
  await acknowledgeIfEligible()
}

function retry() {
  if (state.value.failedOperation === 'load-older')
    void loadOlderMessages()
  else if (state.value.failedOperation === 'refresh')
    void refreshLatest()
  else
    void activateConversation()
}

function handleScroll() {
  const viewport = messageScrollRef.value
  if (!viewport)
    return
  saveViewportState()
  if (viewport.scrollTop <= SCROLL_EDGE_THRESHOLD)
    void loadOlderMessages()
  if (isAtLatest())
    void acknowledgeIfEligible()
}

function handleVisibilityChange() {
  if (props.active && document.visibilityState === 'visible')
    void refreshLatest()
}

watch(() => props.active, (active) => {
  if (active)
    void activateConversation()
  else
    activationGeneration++
}, { immediate: true })

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onBeforeUnmount(() => {
  activationGeneration++
  saveViewportState()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

defineExpose({ refresh: () => refreshLatest({ forceBottom: false }) })
</script>

<template>
  <section class="conversation-view" :aria-label="t('notifications.whisper.messages.timeline_aria', { name: session.name })">
    <header class="conversation-view__header">
      <div>
        <strong>{{ session.name || t('notifications.whisper.unknown_user') }}</strong>
        <span>{{ t('notifications.whisper.messages.text_send_enabled') }}</span>
      </div>
    </header>

    <div
      ref="messageScrollRef"
      class="conversation-view__messages"
      @scroll.passive="handleScroll"
    >
      <div v-if="state.loading && !state.loaded" class="conversation-view__state" aria-busy="true">
        <Loading />
        <span>{{ t('notifications.whisper.messages.loading') }}</span>
      </div>

      <div v-else-if="state.errorKind && !state.items.length" class="conversation-view__state">
        <Empty :description="errorMessage">
          <div class="conversation-view__state-actions">
            <Button type="tertiary" @click="retry">
              {{ t('notifications.actions.retry') }}
            </Button>
            <ALink :href="originalUrl" type="content">
              {{ t('notifications.actions.open_original') }}
            </ALink>
          </div>
        </Empty>
      </div>

      <template v-else>
        <div class="conversation-view__history-status">
          <i v-if="state.loadingOlder" i-svg-spinners-ring-resize aria-hidden="true" />
          <span v-else-if="state.noMore">{{ t('notifications.whisper.messages.history_start') }}</span>
          <button v-else type="button" @click="loadOlderMessages">
            {{ t('notifications.whisper.messages.load_older') }}
          </button>
        </div>

        <div v-if="state.errorKind" class="conversation-view__inline-error" role="status">
          <span>{{ errorMessage }}</span>
          <button type="button" @click="retry">
            {{ t('notifications.actions.retry') }}
          </button>
        </div>

        <div v-if="state.items.length" class="conversation-view__timeline">
          <PrivateMessageItem
            v-for="message in state.items"
            :key="message.msgKey"
            :message="message"
            @delete-failed="controller.deleteFailed(session.talkerId, $event)"
            @edit-failed="editFailed"
            @preview="previewImage = $event"
            @retry="retrySend"
          />
        </div>
        <div v-else class="conversation-view__state">
          <Empty :description="t('notifications.whisper.messages.empty')" />
        </div>
      </template>
    </div>

    <button
      v-if="state.newMessagesAvailable"
      type="button"
      class="conversation-view__new-messages"
      @click="scrollToLatest('smooth'); acknowledgeIfEligible()"
    >
      {{ t('notifications.whisper.messages.new_messages') }}
    </button>

    <footer class="conversation-view__footer">
      <MessageComposer
        ref="composerRef"
        v-model="draft"
        :sending="state.sending"
        @submit="sendDraft"
      />
    </footer>

    <PrivateMessageImageViewer
      v-if="previewImage"
      :src="previewImage"
      @close="previewImage = ''"
    />
  </section>
</template>

<style scoped lang="scss">
.conversation-view {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bew-homepage-bg);
}

.conversation-view__header,
.conversation-view__footer {
  display: flex;
  gap: var(--bew-space-3);
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  padding: var(--bew-space-3) var(--bew-space-4);
  background: var(--bew-elevated-solid);
}

.conversation-view__header {
  border-bottom: 1px solid var(--bew-border-color);
}

.conversation-view__footer {
  border-top: 1px solid var(--bew-border-color);
}

.conversation-view__header > div {
  display: grid;
  min-width: 0;
}

.conversation-view__header strong {
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-view__header span {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.conversation-view__state-actions a,
.conversation-view__inline-error button,
.conversation-view__history-status button {
  color: var(--bew-theme-color);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  text-decoration: none;
}

.conversation-view__messages {
  min-width: 0;
  min-height: 0;
  padding: 0 var(--bew-space-4) var(--bew-space-4);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.conversation-view__timeline {
  display: grid;
  gap: var(--bew-space-3);
}

.conversation-view__state {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: var(--bew-space-3);
  align-items: center;
  justify-content: center;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
  text-align: center;
}

.conversation-view__state-actions {
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
}

.conversation-view__history-status {
  display: flex;
  min-height: var(--bew-control-height);
  align-items: center;
  justify-content: center;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.conversation-view__history-status button,
.conversation-view__inline-error button {
  padding: 0;
  appearance: none;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.conversation-view__inline-error {
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
  justify-content: center;
  margin-bottom: var(--bew-space-3);
  padding: var(--bew-space-2) var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  background: var(--bew-fill-1);
  border-radius: var(--bew-interactive-radius);
  corner-shape: var(--bew-corner-shape);
}

.conversation-view__new-messages {
  position: absolute;
  right: var(--bew-space-4);
  bottom: calc(var(--bew-control-height-lg) + var(--bew-space-12) + var(--bew-space-4));
  z-index: 1;
  min-height: var(--bew-control-height);
  padding: 0 var(--bew-space-3);
  color: var(--bew-on-theme-color);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  appearance: none;
  cursor: pointer;
  background: var(--bew-theme-color);
  border: 0;
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
  box-shadow: var(--bew-shadow-2);
}

@media (prefers-reduced-motion: reduce) {
  .conversation-view {
    scroll-behavior: auto;
  }
}
</style>
