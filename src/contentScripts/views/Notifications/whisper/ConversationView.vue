<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { LAYOUT_BREAKPOINTS } from '~/constants/layout'
import { settings } from '~/logic'

import MessageComposer from './experimental/MessageComposer.vue'
import type { PrivateMessagesController as PrivateMessageWriteController } from './experimental/usePrivateMessageWrites'
import PrivateMessageImageViewer from './PrivateMessageImageViewer.vue'
import PrivateMessageItem from './PrivateMessageItem.vue'
import type { TransientPrivateRecipient } from './privateRecipientSearch'
import type { DisplayPrivateSession } from './privateSession'
import { getPrivateSessionProfileUrl } from './privateSession'
import type { PrivateMessagesController } from './usePrivateMessages'

const props = defineProps<{
  active: boolean
  controller: PrivateMessagesController
  session?: DisplayPrivateSession | null
  recipient?: TransientPrivateRecipient | null
  writeController: PrivateMessageWriteController | null
}>()

const emit = defineEmits<{
  (event: 'back'): void
  (event: 'sendConfirmed', talkerId: string): void
}>()

const { t } = useI18n()
const talkerId = computed(() => props.session?.talkerId ?? props.recipient?.mid ?? '')
const displayName = computed(() => props.session?.name ?? props.recipient?.name ?? '')
const profileUrl = computed(() => props.session
  ? getPrivateSessionProfileUrl(props.session)
  : /^\d+$/.test(props.recipient?.mid ?? '')
    ? `https://space.bilibili.com/${props.recipient!.mid}`
    : '')
const assistantLabel = computed(() => props.session?.assistantType
  ? t(`notifications.whisper.assistants.${props.session.assistantType}`)
  : '')
const headingRef = ref<HTMLElement | null>(null)
const messageScrollRef = ref<HTMLElement | null>(null)
const previewImage = ref('')
const state = computed(() => props.controller.getState(talkerId.value))
const isTextSendEnabled = Boolean(props.recipient || props.session?.kind === 'user')
  && Boolean(props.writeController)
const writeState = computed(() => props.writeController?.getState(talkerId.value) ?? null)
const draft = computed({
  get: () => writeState.value?.draft ?? '',
  set: value => props.writeController?.setDraft(talkerId.value, value),
})
const sendStatusMessage = computed(() => {
  const current = writeState.value
  if (!current || current.sending)
    return ''
  if (current.lastTextSendOutcome === 'confirmed')
    return ''
  if (current.lastTextSendOutcome === 'accepted-but-unconfirmed')
    return t('notifications.whisper.messages.test_send_accepted_unconfirmed')
  if (current.lastTextSendOutcome === 'protocol-mismatch')
    return t('notifications.whisper.messages.test_send_protocol_mismatch')
  if (current.lastTextSendOutcome === 'failed') {
    const kind = current.lastTextSendDiagnostic?.kind ?? 'api-error'
    return t(`notifications.whisper.errors.${kind}`)
  }
  return ''
})
const errorMessage = computed(() => {
  const kind = state.value.errorKind
  if (!kind)
    return ''
  return t(`notifications.whisper.errors.${kind}`)
})

const SCROLL_EDGE_THRESHOLD = 48
let activationGeneration = 0

interface VisibleMessageAnchor {
  id: string
  offset: number
}

function captureVisibleMessageAnchor(viewport: HTMLElement): VisibleMessageAnchor | null {
  const viewportTop = viewport.getBoundingClientRect().top
  const messageElements = Array.from(
    viewport.querySelectorAll<HTMLElement>('[data-message-id]'),
  )
  for (const element of messageElements) {
    const rect = element.getBoundingClientRect()
    if (rect.bottom > viewportTop) {
      return {
        id: element.dataset.messageId ?? '',
        offset: rect.top - viewportTop,
      }
    }
  }
  return null
}

function restoreVisibleMessageAnchor(
  viewport: HTMLElement,
  anchor: VisibleMessageAnchor | null,
): boolean {
  if (!anchor?.id)
    return false
  const target = Array.from(
    viewport.querySelectorAll<HTMLElement>('[data-message-id]'),
  ).find(element => element.dataset.messageId === anchor.id)
  if (!target)
    return false
  const nextOffset = target.getBoundingClientRect().top - viewport.getBoundingClientRect().top
  viewport.scrollTop += nextOffset - anchor.offset
  return true
}

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
  props.controller.updateViewport(talkerId.value, {
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
  props.controller.updateViewport(talkerId.value, {
    atLatest: true,
    scrollTop: viewport.scrollHeight,
  })
}

async function acknowledgeIfEligible() {
  if (!settings.value.autoMarkPrivateMessagesRead)
    return
  await nextTick()
  await props.controller.acknowledgeIfEligible(talkerId.value, {
    atLatest: isAtLatest(),
    canAck: props.session?.capabilities.canAck ?? false,
    pageActive: props.active,
    sessionMaxSeqno: props.session?.maxSeqno ?? '',
    unreadCount: props.session?.unreadCount ?? 0,
    visible: document.visibilityState === 'visible',
  })
}

async function loadOlderMessages() {
  const viewport = messageScrollRef.value
  if (!viewport || state.value.loadingOlder || state.value.noMore)
    return

  const oldScrollHeight = viewport.scrollHeight
  const oldScrollTop = viewport.scrollTop
  const anchor = captureVisibleMessageAnchor(viewport)
  await props.controller.loadOlder(talkerId.value)
  await nextTick()
  if (
    viewport === messageScrollRef.value
    && !restoreVisibleMessageAnchor(viewport, anchor)
  ) {
    viewport.scrollTop = oldScrollTop + viewport.scrollHeight - oldScrollHeight
  }
  saveViewportState()
}

async function refreshLatest(options: { forceBottom?: boolean } = {}) {
  const wasAtLatest = isAtLatest()
  const shouldFollow = options.forceBottom
    || (settings.value.followNewPrivateMessages && wasAtLatest)
  if (wasAtLatest && !shouldFollow) {
    props.controller.updateViewport(talkerId.value, {
      atLatest: false,
      scrollTop: messageScrollRef.value?.scrollTop ?? state.value.scrollTop,
    })
  }
  await props.controller.refreshLatest(talkerId.value)
  await nextTick()
  if (shouldFollow)
    scrollToLatest()
  else
    saveViewportState()
  await acknowledgeIfEligible()
}

async function sendDraft() {
  const writer = props.writeController
  if (!isTextSendEnabled || !writer)
    return
  const submittedDraft = draft.value
  const confirmed = await writer.sendDraft(talkerId.value)
  if (!confirmed) {
    if (
      props.recipient
      && writeState.value?.lastTextSendOutcome === 'failed'
      && !writeState.value.draft
    ) {
      writer.setDraft(talkerId.value, submittedDraft)
    }
    return
  }
  await props.controller.refreshLatest(talkerId.value)
  await nextTick()
  scrollToLatest()
  emit('sendConfirmed', talkerId.value)
}

async function activateConversation() {
  if (!props.active)
    return
  const generation = ++activationGeneration
  const wasLoaded = state.value.loaded
  if (wasLoaded)
    await props.controller.refreshLatest(talkerId.value)
  else
    await props.controller.loadInitial(talkerId.value, props.session?.ackSeqno ?? '0')
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
    void props.controller.retryLoadOlder(talkerId.value).then(() => nextTick()).then(saveViewportState)
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

function focusHeading() {
  headingRef.value?.focus({ preventScroll: true })
}

function handleEscape() {
  if (window.matchMedia(`(max-width: ${LAYOUT_BREAKPOINTS.mobileMax}px)`).matches)
    emit('back')
}

watch(() => props.active, (active) => {
  if (active)
    void activateConversation()
  else
    activationGeneration++
}, { immediate: true })

onBeforeUnmount(() => {
  activationGeneration++
  saveViewportState()
})

defineExpose({
  focusHeading,
  refresh: () => refreshLatest({ forceBottom: false }),
})
</script>

<template>
  <section
    class="conversation-view"
    :class="{
      'conversation-view--compact': settings.privateMessageDensity === 'compact',
      'conversation-view--has-composer': isTextSendEnabled && writeState,
    }"
    :aria-label="t('notifications.whisper.messages.timeline_aria', { name: displayName })"
    @keydown.esc="handleEscape"
  >
    <header class="conversation-view__header">
      <IconButton
        class="conversation-view__back"
        shape="circle"
        :label="t('notifications.whisper.back_to_conversations')"
        @click="emit('back')"
      >
        <i i-mingcute:arrow-left-line aria-hidden="true" />
      </IconButton>
      <div class="conversation-view__identity">
        <ALink
          v-if="profileUrl"
          class="conversation-view__profile-link"
          :href="profileUrl"
          type="content"
          :aria-label="t('notifications.whisper.open_profile', { name: displayName })"
        >
          <strong ref="headingRef" tabindex="-1">
            {{ displayName || t('notifications.whisper.unknown_user') }}
          </strong>
        </ALink>
        <strong v-else ref="headingRef" tabindex="-1">
          {{ displayName || t('notifications.whisper.unknown_user') }}
        </strong>
        <span v-if="session?.assistantType" class="conversation-view__assistant-label">
          {{ assistantLabel }}
        </span>
      </div>
    </header>

    <div
      ref="messageScrollRef"
      class="conversation-view__messages"
      @scroll.passive="handleScroll"
    >
      <div v-if="state.loadingInitial && !state.loaded" class="conversation-view__state" aria-busy="true">
        <Loading />
        <span>{{ t('notifications.whisper.messages.loading') }}</span>
      </div>

      <div v-else-if="state.errorKind && !state.items.length" class="conversation-view__state">
        <Empty :description="errorMessage">
          <div class="conversation-view__state-actions">
            <Button type="tertiary" @click="retry">
              {{ t('notifications.actions.retry') }}
            </Button>
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
            :auto-load-images="settings.autoLoadPrivateMessageImages"
            @preview="previewImage = $event"
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

    <footer v-if="isTextSendEnabled && writeState" class="conversation-view__footer">
      <div class="conversation-view__test-send">
        <MessageComposer
          v-model="draft"
          :sending="writeState.sending"
          :image-draft="null"
          :enable-image="false"
          @submit="sendDraft"
        />
        <span
          v-if="sendStatusMessage"
          class="conversation-view__test-send-status"
          role="status"
        >
          {{ sendStatusMessage }}
        </span>
      </div>
    </footer>

    <PrivateMessageImageViewer
      v-if="previewImage"
      :src="previewImage"
      @close="previewImage = ''"
    />
  </section>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.conversation-view {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: transparent;
}

.conversation-view__header,
.conversation-view__footer {
  display: flex;
  gap: var(--bew-space-3);
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  padding: var(--bew-space-3) var(--bew-space-4);
  background: var(--bew-elevated);
  backdrop-filter: var(--bew-filter-glass-1);
  -webkit-backdrop-filter: var(--bew-filter-glass-1);
}

.conversation-view__header {
  border-bottom: 1px solid var(--bew-border-color);
}

.conversation-view__back {
  display: none;
  flex: 0 0 auto;
}

.conversation-view__footer {
  border-top: 1px solid var(--bew-border-color);
}

.conversation-view__test-send {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: var(--bew-space-2);
}

.conversation-view__test-send-status {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.conversation-view__identity {
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

.conversation-view__profile-link {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: inherit;
  text-decoration: none;
}

.conversation-view__profile-link strong {
  display: block;
}

.conversation-view__profile-link:focus-visible {
  border-radius: var(--bew-radius-sm);
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: var(--bew-space-0-5);
}

.conversation-view__header span {
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.conversation-view__assistant-label {
  flex: 0 0 auto;
  padding: 0 var(--bew-space-1);
  background: var(--bew-fill-1);
  border-radius: var(--bew-badge-radius);
  corner-shape: var(--bew-corner-shape-round);
}

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
  background: transparent;
}

.conversation-view__timeline {
  display: grid;
  gap: var(--bew-space-3);
}

.conversation-view--compact .conversation-view__messages {
  padding-right: var(--bew-space-3);
  padding-bottom: var(--bew-space-3);
  padding-left: var(--bew-space-3);
}

.conversation-view--compact .conversation-view__timeline {
  gap: var(--bew-space-2);
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
  bottom: var(--bew-space-4);
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

.conversation-view--has-composer .conversation-view__new-messages {
  bottom: calc(var(--bew-control-height-lg) + var(--bew-space-12) + var(--bew-space-4));
}

@media (max-width: breakpoints.$mobile-max) {
  .conversation-view__back {
    display: inline-flex;
  }
}

@media (prefers-reduced-motion: reduce) {
  .conversation-view {
    scroll-behavior: auto;
  }
}
</style>
