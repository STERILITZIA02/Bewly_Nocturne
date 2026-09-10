<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { LAYOUT_BREAKPOINTS } from '~/constants/layout'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { vLiquidGlass } from '~/utils/liquidGlass'

import MessageComposer from './experimental/MessageComposer.vue'
import type { DisplayPrivateMessage as OptimisticPrivateMessage } from './experimental/privateMessageTransactions'
import type { PrivateMessageWritesController as PrivateMessageWriteController } from './experimental/privateMessageWriteTypes'
import type { DisplayPrivateMessage } from './privateMessage'
import PrivateMessageImageViewer from './PrivateMessageImageViewer.vue'
import PrivateMessageItem from './PrivateMessageItem.vue'
import type { TransientPrivateRecipient } from './privateRecipientSearch'
import type { DisplayPrivateSession } from './privateSession'
import { useConversationPresentation } from './useConversationPresentation'
import { useConversationViewport } from './useConversationViewport'
import type { PrivateEmotePanelController } from './usePrivateEmotePanel'
import type { PrivateMessagesController } from './usePrivateMessages'

const props = defineProps<{
  active: boolean
  controller: PrivateMessagesController
  emoteController: PrivateEmotePanelController
  session?: DisplayPrivateSession | null
  recipient?: TransientPrivateRecipient | null
  writeController: PrivateMessageWriteController | null
}>()

const emit = defineEmits<{
  (event: 'back'): void
  (event: 'sendConfirmed', talkerId: string): void
}>()

const { t } = useI18n()
const topBarStore = useTopBarStore()
const conversationAccountId = topBarStore.userInfo.mid
const talkerId = computed(() => props.session?.talkerId ?? props.recipient?.mid ?? '')
const displayName = computed(() => (
  props.session?.name
  || props.recipient?.name
  || t('notifications.whisper.unknown_user')
))
const avatarUrl = computed(() => props.session?.avatar ?? props.recipient?.avatar ?? '')
const selfDisplayName = computed(() => (
  topBarStore.userInfo.uname || t('notifications.whisper.messages.self_label')
))
const selfAvatarUrl = computed(() => topBarStore.userInfo.face || '')
const conversationViewRef = ref<HTMLElement | null>(null)

const previewImage = ref('')
const state = computed(() => props.controller.getState(talkerId.value))
const isTextSendEnabled = computed(() => Boolean(props.writeController) && Boolean(
  props.recipient || props.session?.capabilities.canSend,
))
const writeState = computed(() => props.writeController?.getState(talkerId.value) ?? null)
const timelineItems = computed<Array<DisplayPrivateMessage | OptimisticPrivateMessage>>(() => {
  const optimisticItems = writeState.value?.items.filter(item => item.localId) ?? []
  return [...state.value.items, ...optimisticItems].sort((left, right) => (
    left.timestamp - right.timestamp || left.msgKey.localeCompare(right.msgKey)
  ))
})
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

const historyLoading = computed(() => state.value.loadingOlder)
const isAtHistoryStart = computed(() => state.value.noMore)

let activationGeneration = 0

let componentMounted = false
let conversationActivationPending = false

const viewport = useConversationViewport({
  active: () => props.active,
  ready: isHistoryReady,
  canProcess: () => !conversationActivationPending,
  talkerId: () => talkerId.value,
  save: (id, position) => {
    if (topBarStore.userInfo.mid === conversationAccountId)
      props.controller.updateViewport(id, position)
  },
  onFrame: (atLatest, shouldLoadOlder) => {
    if (shouldLoadOlder && !state.value.loadingOlder && !state.value.noMore
      && state.value.failedOperation !== 'load-older' && !state.value.paginationStalled) {
      void loadOlderMessages()
    }
    if (atLatest)
      void acknowledgeIfEligible()
  },
})
const { messageScrollRef, isAtLatestPosition, isAtLatest, saveViewportState, scrollToLatest, scheduleScrollFrame, markReadingIntent, handleDirectGestureMove, endDirectScrollGesture, handleScroll } = viewport
const presentation = useConversationPresentation(conversationViewRef, () => props.active, {
  activate: () => void activateConversation(),
  layoutSettled: scheduleScrollFrame,
  revealFinished: () => void acknowledgeIfEligible(),
})
const { conversationExpanded, reducedMotion, isLayoutTransitioning, entryPhase, historyVisible, isRevealingHistory, historyRevealDelays, conversationLayoutStyle, updateConversationGeometry, finishConversationSwitch, revealVisibleHistory, finishHistoryReveal, beginHistoryLeave } = presentation

function isHistoryReady() {
  return entryPhase.value === 'ready'
}

async function acknowledgeIfEligible() {
  if (!componentMounted || !props.active || !settings.value.autoMarkPrivateMessagesRead || entryPhase.value !== 'ready' || isRevealingHistory.value)
    return
  const generation = activationGeneration
  await nextTick()
  if (!componentMounted || !props.active || generation !== activationGeneration)
    return
  await props.controller.acknowledgeIfEligible(talkerId.value, {
    atLatest: isAtLatest(),
    canAck: props.session?.capabilities.canAck ?? false,
    pageActive: props.active,
    sessionMaxSeqno: props.session?.maxSeqno ?? '',
    unreadCount: props.session?.unreadCount ?? 0,
    visible: document.visibilityState === 'visible',
  })
}

async function loadOlderMessages(explicitRetry = false) {
  if (entryPhase.value !== 'ready' || state.value.loadingOlder || state.value.noMore)
    return
  const anchor = viewport.captureReadingAnchor()
  if (!anchor)
    return
  const requestTalkerId = talkerId.value
  const generation = activationGeneration
  const epoch = props.controller.lifecycleEpoch.value
  const stateGeneration = state.value.generation
  if (explicitRetry)
    await props.controller.retryLoadOlder(requestTalkerId)
  else
    await props.controller.loadOlder(requestTalkerId)
  await nextTick()
  if (!componentMounted || !props.active || generation !== activationGeneration
    || requestTalkerId !== talkerId.value || epoch !== props.controller.lifecycleEpoch.value
    || stateGeneration !== state.value.generation) {
    return
  }
  anchor.restore()
  if (state.value.failedOperation === 'load-older' || state.value.paginationStalled)
    viewport.stopAutomaticHistory()
  else
    scheduleScrollFrame()
}

async function refreshLatest(options: { forceBottom?: boolean } = {}) {
  if (!componentMounted || !props.active || entryPhase.value !== 'ready')
    return
  const generation = activationGeneration
  const wasAtLatest = isAtLatest()
  const anchor = viewport.captureReadingAnchor()
  const shouldFollow = options.forceBottom || (settings.value.followNewPrivateMessages && wasAtLatest)
  if (wasAtLatest && !shouldFollow) {
    props.controller.updateViewport(talkerId.value, { atLatest: false, scrollTop: messageScrollRef.value?.scrollTop ?? state.value.scrollTop })
  }
  await props.controller.refreshLatest(talkerId.value)
  await nextTick()
  if (!componentMounted || !props.active || generation !== activationGeneration)
    return
  if (shouldFollow && anchor?.isCurrent())
    scrollToLatest()
  else
    saveViewportState()
  await acknowledgeIfEligible()
}

async function sendDraft() {
  const writer = props.writeController
  if (!isTextSendEnabled.value || !writer)
    return
  const submittedDraft = draft.value
  const submittedTalkerId = talkerId.value
  const generation = activationGeneration
  const confirmed = await writer.sendDraft(submittedTalkerId)
  if (!componentMounted || generation !== activationGeneration || submittedTalkerId !== talkerId.value)
    return
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
  await finishConfirmedWrite(submittedTalkerId, generation)
}

function selectImage(file: File) {
  props.writeController?.selectImage(talkerId.value, file)
}

async function finishConfirmedWrite(submittedTalkerId: string, generation: number) {
  await nextTick()
  if (!componentMounted || !props.active || generation !== activationGeneration || submittedTalkerId !== talkerId.value)
    return
  scrollToLatest()
  emit('sendConfirmed', submittedTalkerId)
}

async function sendImage() {
  const writer = props.writeController
  if (!writer)
    return
  const submittedTalkerId = talkerId.value
  const generation = activationGeneration
  const confirmed = await writer.sendImage(submittedTalkerId)
  if (confirmed)
    await finishConfirmedWrite(submittedTalkerId, generation)
}

async function retryImage(localId: string) {
  const writer = props.writeController
  if (!writer)
    return
  const submittedTalkerId = talkerId.value
  const generation = activationGeneration
  const confirmed = await writer.retryImage(submittedTalkerId, localId)
  if (confirmed)
    await finishConfirmedWrite(submittedTalkerId, generation)
}

async function retryFailed(localId: string, msgType: number) {
  if (msgType === 2) {
    await retryImage(localId)
    return
  }
  const writer = props.writeController
  if (!writer)
    return
  const submittedTalkerId = talkerId.value
  const generation = activationGeneration
  const confirmed = await writer.retrySend(submittedTalkerId, localId)
  if (confirmed)
    await finishConfirmedWrite(submittedTalkerId, generation)
}

function deleteFailed(localId: string, msgType: number) {
  const writer = props.writeController
  if (!writer)
    return
  if (msgType === 2)
    writer.removeImage(talkerId.value, localId)
  else
    writer.deleteFailed(talkerId.value, localId)
}

function finishConversationActivation(generation: number) {
  if (generation !== activationGeneration)
    return
  conversationActivationPending = false
  scheduleScrollFrame()
}

async function activateConversation() {
  if (!props.active || !componentMounted || entryPhase.value === 'opening' || entryPhase.value === 'switching')
    return
  const generation = ++activationGeneration
  conversationActivationPending = true
  const initialScrollGeneration = viewport.interactionGeneration
  const wasLoaded = state.value.loaded
  if (wasLoaded)
    await props.controller.refreshLatest(talkerId.value)
  else
    await props.controller.loadInitial(talkerId.value, props.session?.ackSeqno ?? '0')
  if (generation !== activationGeneration || !props.active || !componentMounted)
    return
  presentation.showReadyHistory()
  await nextTick()
  if (generation !== activationGeneration || !props.active || !componentMounted)
    return
  const element = messageScrollRef.value
  if (initialScrollGeneration !== viewport.interactionGeneration) {
    if (element)
      revealVisibleHistory(element)
    finishConversationActivation(generation)
    return
  }
  if (element) {
    updateConversationGeometry()
    viewport.restorePosition(!wasLoaded || state.value.atLatest, state.value.scrollTop)
    revealVisibleHistory(element)
  }
  finishConversationActivation(generation)
  saveViewportState()
  await acknowledgeIfEligible()
}

function retry() {
  if (state.value.failedOperation === 'load-older')
    void loadOlderMessages(true)
  else if (state.value.failedOperation === 'refresh')
    void refreshLatest()
  else
    void activateConversation()
}

function focusHeading() {
  messageScrollRef.value?.focus({ preventScroll: true })
}

function handleEscape() {
  if (window.matchMedia(`(max-width: ${LAYOUT_BREAKPOINTS.mobileMax}px)`).matches)
    emit('back')
}

watch(talkerId, (_, previousTalkerId) => {
  saveViewportState(undefined, undefined, previousTalkerId)
  previewImage.value = ''
  activationGeneration++
  conversationActivationPending = true
  viewport.resetReading()
  presentation.switchHistory()
})
watch(() => writeState.value?.imageDraft?.objectUrl ?? '', (nextUrl, previousUrl) => {
  if (previousUrl && previewImage.value === previousUrl && nextUrl !== previousUrl)
    previewImage.value = ''
})

watch(() => props.active, (active) => {
  if (!active) {
    activationGeneration++
    conversationActivationPending = false
  }
}, { immediate: true })

onMounted(() => {
  componentMounted = true
})

onBeforeUnmount(() => {
  saveViewportState()
  componentMounted = false
  conversationActivationPending = false
  activationGeneration++
})

defineExpose({
  focusHeading,
  refresh: () => refreshLatest({ forceBottom: false }),
})
</script>

<template>
  <section
    ref="conversationViewRef"
    class="conversation-view conversation-column"
    :class="{
      'conversation-view--density-compact': settings.privateMessageDensity === 'compact',
      'conversation-view--has-composer': isTextSendEnabled && writeState,
      'conversation-view--has-image-draft': writeState?.imageDraft,
      'conversation-view--has-new-messages': state.newMessagesAvailable,
      'conversation-view--layout-transitioning': isLayoutTransitioning,
      'conversation-view--reduced-motion': reducedMotion,
      'conversation-view--solid': settings.disableFrostedGlass,
    }"
    :style="conversationLayoutStyle"
    :data-expansion-state="conversationExpanded ? 'expanded' : 'compact'"
    :data-entry-phase="entryPhase"
    :data-at-history-start="isAtHistoryStart ? 'true' : undefined"
    :data-at-latest="isAtLatestPosition ? 'true' : undefined"
    :aria-label="t('notifications.whisper.messages.timeline_aria', { name: displayName })"
    :aria-busy="entryPhase !== 'ready' || historyLoading"
    @keydown.esc="handleEscape"
  >
    <div class="conversation-card">
      <div
        ref="messageScrollRef"
        class="conversation-view__messages"
        tabindex="0"
        :aria-label="t('notifications.whisper.messages.timeline_aria', { name: displayName })"
        @keydown="markReadingIntent"
        @pointercancel="endDirectScrollGesture"
        @pointerdown="markReadingIntent"
        @pointermove.passive="handleDirectGestureMove"
        @pointerup="endDirectScrollGesture"
        @scroll.passive="handleScroll"
        @touchcancel.passive="endDirectScrollGesture"
        @touchend.passive="endDirectScrollGesture"
        @touchmove.passive="handleDirectGestureMove"
        @touchstart.passive="markReadingIntent"
        @wheel.passive="markReadingIntent"
      >
        <Transition name="conversation-history" @before-leave="beginHistoryLeave" @after-leave="finishConversationSwitch">
          <div v-if="historyVisible" class="conversation-view__history">
            <span v-if="entryPhase !== 'ready'" class="sr-only" role="status">
              {{ t('notifications.whisper.messages.loading') }}
            </span>

            <div v-else-if="state.errorKind && !timelineItems.length" class="conversation-view__state">
              <Empty :description="errorMessage">
                <div class="conversation-view__state-actions">
                  <Button type="tertiary" @click="retry">
                    {{ t('notifications.actions.retry') }}
                  </Button>
                </div>
              </Empty>
            </div>

            <template v-else>
              <div
                class="conversation-view__history-status"
              >
                <span v-if="historyLoading" role="status">{{ t('notifications.whisper.messages.loading') }}</span>
                <span v-else-if="isAtHistoryStart">{{ t('notifications.whisper.messages.history_start') }}</span>
                <button v-else type="button" @click="loadOlderMessages()">
                  {{ t('notifications.whisper.messages.load_older') }}
                </button>
              </div>

              <div v-if="state.errorKind" class="conversation-view__inline-error" role="status">
                <span>{{ errorMessage }}</span>
                <button type="button" @click="retry">
                  {{ t('notifications.actions.retry') }}
                </button>
              </div>

              <div
                v-if="timelineItems.length"
                class="conversation-view__timeline"
                :class="{ 'conversation-view__timeline--reveal': isRevealingHistory }"
                @animationend="finishHistoryReveal"
              >
                <PrivateMessageItem
                  v-for="message in timelineItems"
                  :key="message.msgKey"
                  :class="{ 'conversation-view__message--reveal': isRevealingHistory && message.msgKey in historyRevealDelays }"
                  :style="isRevealingHistory ? { '--conversation-message-delay': `${historyRevealDelays[message.msgKey] ?? 0}ms` } : undefined"
                  :message="message"
                  :auto-load-images="settings.autoLoadPrivateMessageImages"
                  :sender-avatar-url="message.isSelf ? selfAvatarUrl : avatarUrl"
                  :sender-name="message.isSelf ? selfDisplayName : displayName"
                  @delete-failed="deleteFailed"
                  @preview="previewImage = $event"
                  @retry-failed="retryFailed"
                />
              </div>
              <div v-else class="conversation-view__state">
                <Empty :description="t('notifications.whisper.messages.empty')" />
              </div>
            </template>
          </div>
        </Transition>
      </div>

      <div
        class="conversation-card__top-edge"
        :class="{ 'conversation-card__top-edge--visible': conversationExpanded }"
        aria-hidden="true"
      />
      <div
        class="conversation-card__bottom-edge"
        :class="{ 'conversation-card__bottom-edge--visible': conversationExpanded }"
        aria-hidden="true"
      />
    </div>

    <button
      v-if="state.newMessagesAvailable"
      type="button"
      class="conversation-view__new-messages"
      @click="scrollToLatest('smooth'); acknowledgeIfEligible()"
    >
      {{ t('notifications.whisper.messages.new_messages') }}
    </button>

    <footer
      v-if="isTextSendEnabled && writeState && entryPhase !== 'opening'"
      v-liquid-glass="active"
      class="conversation-view__floating-composer"
    >
      <div class="conversation-view__test-send">
        <MessageComposer
          v-model="draft"
          :conversation-key="talkerId"
          :sending="writeState.sending"
          :image-draft="writeState.imageDraft"
          :emote-packages="emoteController.packages.value"
          :emotes-loading="emoteController.loading.value"
          :emotes-failed="emoteController.failed.value"
          enable-image
          @load-emotes="emoteController.load()"
          @remove-image="writeController?.removeImage(talkerId, $event)"
          @retry-image="retryImage"
          @select-image="selectImage"
          @submit="sendDraft"
          @submit-image="sendImage"
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
  --conversation-composer-reserve: 0px;
  --conversation-new-message-reserve: 0px;

  position: relative;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: visible;
  background: transparent;
}

.conversation-view--has-composer {
  --conversation-composer-reserve: calc(var(--bew-space-12) * 2 + var(--bew-space-8));
}

.conversation-view--has-image-draft {
  --conversation-composer-reserve: calc(var(--bew-space-12) * 4);
}

.conversation-view--has-new-messages {
  --conversation-new-message-reserve: calc(var(--bew-control-height) + var(--bew-space-4));
}

.conversation-card {
  position: relative;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  width: 100%;
  height: calc(100% + var(--conversation-extra-height, 0px));
  min-height: 0;
  overflow: hidden;
  background: transparent;
  border: 0;
  border-inline: 1px solid var(--bew-surface-border-color);
  border-radius: var(--conversation-radius, var(--bew-panel-radius));
  corner-shape: var(--bew-corner-shape);
  transform: translateY(var(--conversation-top-lift, 0px));
}

.conversation-view--layout-transitioning .conversation-card {
  will-change: height, transform, border-radius;
  transition:
    height var(--bew-duration-normal) var(--bew-ease-standard),
    transform var(--bew-duration-normal) var(--bew-ease-standard),
    border-radius var(--bew-duration-fast) linear;
}

.conversation-view__messages {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 0;
  padding: calc(var(--bew-space-3) + var(--conversation-top-expansion, 0px)) var(--bew-space-4)
    calc(
      var(--conversation-composer-reserve) + var(--conversation-new-message-reserve) +
        var(--conversation-bottom-expansion, 0px) + var(--bew-space-4)
    );
  overflow: auto;
  overflow-anchor: none;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  background: transparent;
  outline: none;
}

.conversation-view--layout-transitioning .conversation-view__messages {
  transition:
    padding-top var(--bew-duration-normal) var(--bew-ease-standard),
    padding-bottom var(--bew-duration-normal) var(--bew-ease-standard);
}

.conversation-view__messages:focus-visible {
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: calc(0px - var(--bew-space-1));
}

.conversation-view__timeline {
  display: grid;
  gap: var(--bew-space-3);
}

.conversation-view__history {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.conversation-history-enter-active,
.conversation-history-leave-active {
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.conversation-history-enter-from,
.conversation-history-leave-to {
  opacity: 0;
}

.conversation-view__timeline--reveal > .conversation-view__message--reveal {
  animation: conversation-message-reveal var(--bew-duration-moderate) var(--bew-ease-standard) both;
  animation-delay: var(--conversation-message-delay, 0ms);
}

@keyframes conversation-message-reveal {
  from {
    opacity: 0;
    transform: translateY(var(--bew-space-2));
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.conversation-view--density-compact .conversation-view__messages {
  padding-right: var(--bew-space-3);
  padding-left: var(--bew-space-3);
}

.conversation-view--density-compact .conversation-view__timeline {
  gap: var(--bew-space-2);
}

.conversation-view__state {
  display: flex;
  flex: 1 1 auto;
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
  padding: 0 calc(var(--bew-icon-button-size-md) + var(--bew-space-4));
  align-items: center;
  justify-content: center;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.conversation-view__inline-error button,
.conversation-view__history-status button {
  padding: 0;
  color: var(--bew-theme-color);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  text-decoration: none;
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

.conversation-card__top-edge,
.conversation-card__bottom-edge {
  position: absolute;
  right: 0;
  left: 0;
  z-index: 2;
  overflow: hidden;
  pointer-events: none;
  corner-shape: var(--bew-corner-shape);
  backdrop-filter: var(--bew-filter-glass-1);
  opacity: 0;
  transition:
    opacity var(--bew-duration-fast) var(--bew-ease-standard),
    border-radius var(--bew-duration-fast) linear;
  -webkit-backdrop-filter: var(--bew-filter-glass-1);
}

.conversation-card__top-edge {
  top: 0;
  height: var(--bew-space-12);
  border-top-left-radius: inherit;
  border-top-right-radius: inherit;
  mask-image: linear-gradient(to bottom, black, transparent);
  -webkit-mask-image: linear-gradient(to bottom, black, transparent);
}

.conversation-card__top-edge--visible {
  opacity: 1;
}

.conversation-card__bottom-edge {
  bottom: 0;
  height: var(--bew-space-12);
  border-bottom-right-radius: inherit;
  border-bottom-left-radius: inherit;
  mask-image: linear-gradient(to bottom, transparent, black 70%);
  -webkit-mask-image: linear-gradient(to bottom, transparent, black 70%);
}

.conversation-card__bottom-edge--visible {
  opacity: 1;
}

.conversation-view--solid .conversation-card__top-edge,
.conversation-view--solid .conversation-card__bottom-edge {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.conversation-view__floating-composer {
  --bew-liquid-frame-inset: 0px;
  position: absolute;
  right: var(--bew-space-4);
  bottom: 0;
  left: var(--bew-space-4);
  z-index: 4;
  padding: var(--bew-space-2);
  background: var(--bew-elevated-alt);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-modal-radius);
  corner-shape: var(--bew-corner-shape);
  box-shadow: var(--bew-shadow-edge-glow-1);
  backdrop-filter: var(--bew-filter-glass-1);
  -webkit-backdrop-filter: var(--bew-filter-glass-1);
  background-clip: padding-box;
}

.conversation-view--solid .conversation-view__floating-composer {
  background: var(--bew-elevated-alt-solid);
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

.conversation-view__new-messages {
  position: absolute;
  right: var(--bew-space-4);
  bottom: var(--bew-space-4);
  z-index: 3;
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
  bottom: calc(var(--conversation-composer-reserve) + var(--bew-space-4));
}

@media (max-width: breakpoints.$mobile-max) {
  .conversation-view {
    height: 100%;
  }

  .conversation-card {
    height: 100%;
    transform: none;
  }

  .conversation-card__top-edge,
  .conversation-card__bottom-edge {
    display: none;
  }

  .conversation-view__floating-composer {
    right: var(--bew-space-3);
    left: var(--bew-space-3);
  }
}

@media (prefers-reduced-motion: reduce) {
  .conversation-view,
  .conversation-card,
  .conversation-view__messages,
  .conversation-card__top-edge,
  .conversation-card__bottom-edge,
  .conversation-history-enter-active,
  .conversation-history-leave-active {
    transition: none;
  }
  .conversation-view__timeline--reveal > .conversation-view__message--reveal {
    animation: none;
  }
}
</style>
