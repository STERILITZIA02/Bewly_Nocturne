<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import ChevronIcon from '~/components/ChevronIcon.vue'
import { useSurfaceMorph } from '~/composables/useSurfaceMorph'
import { LAYOUT_BREAKPOINTS } from '~/constants/layout'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { vLiquidGlass } from '~/utils/liquidGlass'

import ConversationFind from './ConversationFind.vue'
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
import type { PrivateHistorySearchController } from './usePrivateHistorySearch'
import { usePrivateMessagePreviews } from './usePrivateMessagePreviews'
import type { PrivateMessagesController } from './usePrivateMessages'

const props = defineProps<{
  active: boolean
  controller: PrivateMessagesController
  emoteController: PrivateEmotePanelController
  session?: DisplayPrivateSession | null
  recipient?: TransientPrivateRecipient | null
  writeController: PrivateMessageWriteController | null
  searchMode?: boolean
  historySearch?: PrivateHistorySearchController
}>()

const emit = defineEmits<{
  (event: 'back'): void
  (event: 'sendConfirmed', talkerId: string): void
  (event: 'moveSearch', direction: number): void
  (event: 'closeSearch'): void
}>()

const { t } = useI18n()
const topBarStore = useTopBarStore()
const conversationAccountId = topBarStore.userInfo.mid
const talkerId = computed(() => props.session?.talkerId ?? props.recipient?.mid ?? '')
usePrivateMessagePreviews(() => props.active, () => topBarStore.userInfo.mid || null, () => talkerId.value)
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
const composerRef = ref<HTMLElement | null>(null)
const navigationRef = ref<HTMLElement | null>(null)
useSurfaceMorph(navigationRef, () => props.searchMode)

const previewImage = ref('')
const highlightedMessage = ref('')
let searchViewportOwned = Boolean(props.searchMode)
const searchContext = computed(() => props.searchMode && props.historySearch?.state.context?.talkerId === talkerId.value ? props.historySearch.state.context : null)
const state = computed(() => {
  if (!props.searchMode && props.active)
    return props.controller.getState(talkerId.value)
  // Search context is transient. Reading an uncached result must not create a
  // normal reader entry or evict another conversation from its LRU.
  return props.controller.states.get(talkerId.value) ?? {
    items: [] as DisplayPrivateMessage[],
    loaded: true,
    loadingOlder: false,
    noMore: false,
    paginationStalled: false,
    errorKind: null,
    failedOperation: null,
    generation: 0,
    atLatest: false,
    scrollTop: 0,
    newMessagesAvailable: false,
  }
})
const isTextSendEnabled = computed(() => Boolean(props.writeController) && Boolean(
  props.recipient || props.session?.capabilities.canSend,
))
const writeState = computed(() => props.writeController?.getState(talkerId.value) ?? null)
const timelineItems = computed<Array<DisplayPrivateMessage | OptimisticPrivateMessage>>(() => {
  if (props.searchMode && props.historySearch?.state.selectedKey)
    return searchContext.value?.items ?? []
  const optimisticItems = writeState.value?.items.filter(item => item.localId) ?? []
  return [...state.value.items, ...optimisticItems].sort((left, right) => (
    left.timestamp - right.timestamp || left.msgKey.localeCompare(right.msgKey)
  ))
})
const galleryImages = computed(() => [...new Set(timelineItems.value.flatMap(message => message.content.type === 'image' || message.content.type === 'emoticon' ? [message.content.src] : []))])
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

const historyLoading = computed(() => props.searchMode ? props.historySearch?.state.loadingContext : state.value.loadingOlder)
const isAtHistoryStart = computed(() => state.value.noMore)

let activationGeneration = 0

let componentMounted = false
let conversationActivationPending = false

const viewport = useConversationViewport({
  active: () => props.active,
  ready: isHistoryReady,
  canProcess: () => !conversationActivationPending,
  followContentGrowth: () => state.value.atLatest,
  talkerId: () => talkerId.value,
  save: (id, position) => {
    if (props.searchMode || searchViewportOwned)
      return
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
const { messageScrollRef, messageContentRef, isAtLatestPosition, isAtLatest, saveViewportState, scrollToLatest, scheduleScrollFrame, handleContentResize, markReadingIntent, handleDirectGestureMove, endDirectScrollGesture, handleScroll } = viewport
function locateMessage(key: string) {
  highlightedMessage.value = key
  const rootTop = messageScrollRef.value?.getBoundingClientRect().top ?? 0
  const topBarHeight = conversationViewRef.value ? Number.parseFloat(getComputedStyle(conversationViewRef.value).getPropertyValue('--bew-top-bar-height')) || 64 : 64
  viewport.scrollToMessage(key, Math.max(16, topBarHeight - rootTop + 16))
}
const presentation = useConversationPresentation(conversationViewRef, () => props.active, {
  activate: () => void activateConversation(),
  layoutSettled: handleContentResize,
  contentResized: handleContentResize,
  revealFinished: () => void acknowledgeIfEligible(),
}, messageContentRef, composerRef)
const { conversationExpanded, reducedMotion, isLayoutTransitioning, entryPhase, historyVisible, isRevealingHistory, historyRevealDelays, conversationLayoutStyle, updateConversationGeometry, finishConversationSwitch, revealVisibleHistory, finishHistoryReveal, beginHistoryLeave } = presentation
const showLatestButton = computed(() => !props.searchMode && entryPhase.value === 'ready' && timelineItems.value.length > 0
  && (!isAtLatestPosition.value || state.value.newMessagesAvailable))

function isHistoryReady() {
  return entryPhase.value === 'ready'
}

async function acknowledgeIfEligible() {
  if (props.searchMode || searchViewportOwned || !componentMounted || !props.active || !settings.value.autoMarkPrivateMessagesRead || entryPhase.value !== 'ready' || isRevealingHistory.value)
    return
  const generation = activationGeneration
  await nextTick()
  if (props.searchMode || !componentMounted || !props.active || generation !== activationGeneration)
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
  if (props.searchMode || entryPhase.value !== 'ready' || state.value.loadingOlder || state.value.noMore)
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
  if (props.searchMode || !componentMounted || !props.active || entryPhase.value !== 'ready')
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
  if (isTextSendEnabled.value)
    props.writeController?.selectImage(talkerId.value, file)
}

async function finishConfirmedWrite(submittedTalkerId: string, generation: number) {
  await nextTick()
  if (!componentMounted || !props.active || generation !== activationGeneration || submittedTalkerId !== talkerId.value)
    return
  if (!props.searchMode)
    scrollToLatest()
  emit('sendConfirmed', submittedTalkerId)
}

async function sendImage() {
  const writer = props.writeController
  if (!isTextSendEnabled.value || !writer)
    return
  const submittedTalkerId = talkerId.value
  const generation = activationGeneration
  const confirmed = await writer.sendImage(submittedTalkerId)
  if (confirmed)
    await finishConfirmedWrite(submittedTalkerId, generation)
}

async function retryImage(localId: string) {
  const writer = props.writeController
  if (!isTextSendEnabled.value || !writer)
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
  if (props.searchMode) {
    presentation.showReadyHistory()
    await nextTick()
    finishConversationActivation(generation)
    return
  }
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
    searchViewportOwned = false
    finishConversationActivation(generation)
    return
  }
  if (element) {
    updateConversationGeometry()
    viewport.restorePosition(!wasLoaded || state.value.atLatest, state.value.scrollTop)
    revealVisibleHistory(element)
  }
  searchViewportOwned = false
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
  if (props.searchMode) {
    emit('closeSearch')
    return
  }
  if (window.matchMedia(`(max-width: ${LAYOUT_BREAKPOINTS.mobileMax}px)`).matches)
    emit('back')
}

watch(talkerId, (_, previousTalkerId) => {
  saveViewportState(undefined, undefined, previousTalkerId)
  previewImage.value = ''
  highlightedMessage.value = ''
  activationGeneration++
  conversationActivationPending = true
  viewport.resetReading()
  presentation.switchHistory()
})
watch(() => props.searchMode, (searching) => {
  if (searching)
    searchViewportOwned = true
  highlightedMessage.value = ''
  if (componentMounted && props.active && entryPhase.value === 'ready')
    void activateConversation()
  if (searching)
    props.controller.invalidatePendingRequests()
})
watch(() => [searchContext.value?.key, props.historySearch?.state.selectionVersion, entryPhase.value, historyVisible.value] as const, async () => {
  const context = searchContext.value
  const match = props.historySearch?.selected.value
  if (!context || !match) {
    highlightedMessage.value = ''
    return
  }
  if (entryPhase.value !== 'ready' || !historyVisible.value)
    return
  await nextTick()
  if (props.active && context === searchContext.value)
    locateMessage(match.message.msgKey)
}, { flush: 'post' })
watch(() => [props.searchMode, props.historySearch?.state.selectedKey, props.historySearch?.state.selectionVersion, talkerId.value, entryPhase.value] as const, () => {
  const search = props.historySearch
  if (props.active && props.searchMode && entryPhase.value === 'ready' && search?.selected.value?.session.talkerId === talkerId.value
    && !search.state.context && !search.state.loadingContext && !search.state.contextError) {
    void search.select(search.state.selectedKey)
  }
}, { flush: 'post' })
watch(() => writeState.value?.imageDraft?.objectUrl ?? '', (nextUrl, previousUrl) => {
  if (previousUrl && previewImage.value === previousUrl && nextUrl !== previousUrl)
    previewImage.value = ''
})

watch(() => props.active, (active) => {
  if (!active) {
    previewImage.value = ''
    highlightedMessage.value = ''
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
      'conversation-view--has-composer': Boolean(writeState),
      'conversation-view--has-image-draft': writeState?.imageDraft,
      'conversation-view--has-new-messages': showLatestButton || searchMode,
      'conversation-view--search-mode': searchMode,
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
        data-top-bar-scroll
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
          <div v-if="historyVisible" ref="messageContentRef" class="conversation-view__history">
            <span v-if="entryPhase !== 'ready'" class="sr-only" role="status">
              {{ t('notifications.whisper.messages.loading') }}
            </span>

            <div v-else-if="searchMode && historySearch?.state.loadingContext" class="conversation-view__state" role="status">
              {{ t('notifications.whisper.messages.loading') }}
            </div>
            <div v-else-if="searchMode && historySearch?.state.contextError" class="conversation-view__state">
              <Empty text-only :description="t('notifications.whisper.search.context_error')" :action-label="t('notifications.actions.retry')" @action="historySearch?.select(historySearch.state.selectedKey)" />
            </div>
            <div v-else-if="!searchMode && state.errorKind && !timelineItems.length" class="conversation-view__state">
              <Empty text-only :description="errorMessage" :action-label="t('notifications.actions.retry')" @action="retry" />
            </div>

            <template v-else>
              <div
                v-if="!searchMode"
                class="conversation-view__history-status"
              >
                <span v-if="historyLoading" role="status">{{ t('notifications.whisper.messages.loading') }}</span>
                <span v-else-if="isAtHistoryStart">{{ t('notifications.whisper.messages.history_start') }}</span>
                <button v-else type="button" @click="loadOlderMessages()">
                  {{ t('notifications.whisper.messages.load_older') }}
                </button>
              </div>

              <div v-if="!searchMode && state.errorKind" class="conversation-view__inline-error" role="status">
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
                  :class="{ 'conversation-view__message--reveal': isRevealingHistory && message.msgKey in historyRevealDelays, 'conversation-view__message--match': highlightedMessage === message.msgKey }"
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
                <Empty text-only :description="t(searchMode ? 'notifications.whisper.search.select_result' : 'notifications.whisper.messages.empty')" />
              </div>
            </template>
          </div>
        </Transition>
      </div>
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

    <Transition name="conversation-latest">
      <div
        v-if="showLatestButton || (searchMode && entryPhase !== 'opening')"
        ref="navigationRef"
        v-liquid-glass="active"
        class="conversation-view__new-messages"
        :class="{ 'conversation-view__search-navigation': searchMode }"
        :role="searchMode ? 'group' : undefined"
        :aria-label="searchMode ? t('notifications.whisper.search.messages') : undefined"
      >
        <ConversationFind
          v-if="searchMode" external :result-count="historySearch?.filteredResults.value.length ?? 0" :result-index="historySearch?.selectedIndex.value ?? -1" @move="emit('moveSearch', $event)"
          @clear="emit('closeSearch')"
        />
        <button
          v-else type="button" class="conversation-view__latest-action"
          :aria-label="t(state.newMessagesAvailable ? 'notifications.whisper.messages.new_messages' : 'notifications.whisper.messages.return_latest')"
          :title="t(state.newMessagesAvailable ? 'notifications.whisper.messages.new_messages' : 'notifications.whisper.messages.return_latest')"
          @click="scrollToLatest('smooth'); acknowledgeIfEligible()"
        >
          <ChevronIcon />
        </button>
      </div>
    </Transition>

    <footer
      v-if="writeState"
      ref="composerRef"
      v-liquid-glass="active"
      class="conversation-view__floating-composer"
      :data-entering="!conversationExpanded"
      :inert="entryPhase === 'opening' ? true : undefined"
    >
      <div class="conversation-view__test-send">
        <MessageComposer
          v-model="draft"
          :conversation-key="talkerId"
          :disabled-reason="isTextSendEnabled ? '' : t('common.send_not_allowed')"
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
      :images="galleryImages"
      @close="previewImage = ''"
    />
  </section>
</template>

<style scoped lang="scss">
@use "../../../../styles/breakpoints";

.conversation-view {
  --conversation-message-inline-space: var(--bew-space-4);
  --conversation-composer-reserve: 0px;
  --conversation-new-message-reserve: 0px;
  --conversation-composer-start-inset: var(--bew-space-4);
  // Match the distance from the left screen edge on desktop. In a narrow pane,
  // retain enough space for one row of input/actions instead of squeezing it shut.
  --conversation-composer-end-inset: min(
    calc(var(--bew-messages-sidebar-width) + var(--notifications-workspace-gap)),
    max(var(--bew-space-4), calc(100% - var(--bew-space-4) - var(--bew-message-composer-min-width)))
  );

  position: relative;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: visible;
  background: transparent;
}

.conversation-view--has-new-messages {
  --conversation-new-message-reserve: calc(var(--bew-message-composer-rest-height) + var(--bew-space-2));
}

.conversation-view--search-mode,
.conversation-view--has-composer.conversation-view--has-new-messages,
.conversation-view--has-composer:has(> .conversation-latest-leave-active) {
  --conversation-new-message-reserve: 0px;
  --conversation-composer-end-inset: max(
    calc(var(--bew-message-composer-rest-height) + var(--bew-space-4)),
    min(
      calc(var(--bew-messages-sidebar-width) + var(--notifications-workspace-gap)),
      max(var(--bew-space-4), calc(100% - var(--bew-space-4) - var(--bew-message-composer-min-width)))
    )
  );
}

.conversation-view--search-mode:not(.conversation-view--has-composer) {
  --conversation-new-message-reserve: calc(var(--bew-message-composer-rest-height) + var(--bew-space-2));
}

.conversation-card {
  position: relative;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  // Extend the scroll paint area to the sidebar while retaining message alignment.
  width: calc(100% + var(--notifications-workspace-gap) + var(--bew-space-4));
  margin-left: calc(-1 * var(--notifications-workspace-gap));
  height: calc(100% + var(--conversation-extra-height, 0px));
  min-height: 0;
  overflow: hidden;
  background: transparent;
  border: 0;
  border-radius: var(--conversation-radius, var(--bew-panel-radius));
  corner-shape: var(--bew-corner-shape);
  transform: translateY(var(--conversation-top-lift, 0px));
}

// The transparent scroll surface takes its final geometry in one layout pass.
// Animating height/padding made its resize observers run on every entry frame.

.conversation-view__messages {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 0;
  padding: calc(var(--bew-space-3) + var(--conversation-top-expansion, 0px))
    calc(var(--conversation-message-inline-space) + var(--bew-space-4))
    calc(
      var(--conversation-composer-reserve) + var(--conversation-new-message-reserve) +
        var(--conversation-bottom-expansion, 0px) + var(--bew-space-4)
    )
    calc(var(--conversation-message-inline-space) + var(--notifications-workspace-gap));
  overflow: auto;
  overflow-anchor: none;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  background: transparent;
  outline: none;
}
.conversation-view__message--match {
  position: relative;
  isolation: isolate;
}

.conversation-view__message--match::before {
  position: absolute;
  z-index: -1;
  top: calc(-1 * var(--bew-space-2));
  bottom: calc(-1 * var(--bew-space-2));
  left: calc(-1 * (var(--conversation-message-inline-space) + var(--notifications-workspace-gap)));
  right: calc(-1 * (var(--conversation-message-inline-space) + var(--bew-space-4)));
  content: "";
  pointer-events: none;
  background: linear-gradient(to right, var(--bew-message-search-highlight), transparent);
  border-radius: 0;
}

.conversation-view__message--match.private-message-item--self::before {
  background: linear-gradient(to left, var(--bew-message-search-highlight), transparent);
}

.conversation-view__messages:focus-visible {
  outline: var(--bew-focus-ring, 1px solid CanvasText);
  outline-offset: calc(0px - var(--bew-space-1));
}

.conversation-view__timeline {
  display: grid;
  gap: var(--bew-space-3);
}

.conversation-view .private-message-item--self {
  box-sizing: border-box;
  // Keep the conversation avatar inside the top-bar avatar's screen-edge inset.
  padding-inline-end: var(--bew-top-bar-inline-padding);
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
  --conversation-message-inline-space: var(--bew-space-3);
}

.conversation-view--density-compact .conversation-view__timeline {
  gap: var(--bew-space-2);
}

.conversation-view--search-mode .conversation-view__timeline {
  // Eight pixels above/below the highlight plus a clear gap to neighbouring rows.
  gap: var(--bew-space-6);
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
  color: var(--bew-theme-foreground);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
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
  position: fixed;
  right: 0;
  left: var(--bew-messages-sidebar-width);
  z-index: var(--bew-z-topbar);
  overflow: hidden;
  pointer-events: none;
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
  border-radius: 0;
  mask-image: linear-gradient(to bottom, black, transparent);
  -webkit-mask-image: linear-gradient(to bottom, black, transparent);
}

.conversation-card__top-edge--visible {
  opacity: 1;
}

.conversation-card__bottom-edge {
  bottom: 0;
  height: var(--bew-space-12);
  border-radius: 0;
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

.conversation-view__floating-composer,
.conversation-view__new-messages {
  translate: 0 var(--notifications-composer-dock-shift, 0px);
  --bew-liquid-frame-inset: 0px;
  position: absolute;
  right: var(--conversation-composer-end-inset);
  bottom: 0;
  left: var(--conversation-composer-start-inset);
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
  transition:
    translate var(--bew-duration-moderate) var(--bew-ease-standard),
    border-radius var(--bew-duration-normal) var(--bew-ease-standard),
    corner-shape var(--bew-duration-normal) var(--bew-ease-standard);
}

.conversation-view__floating-composer:has(.message-composer[data-expanded="false"]) {
  // Half the single-line bar height, its outer padding and border: a finite capsule radius.
  border-radius: calc((var(--bew-control-height) + var(--bew-space-2)) / 2 + var(--bew-space-2) + 1px);
  corner-shape: var(--bew-corner-shape-round);
}

.conversation-view__floating-composer {
  transform: translateY(0);
  transition:
    translate var(--bew-duration-moderate) var(--bew-ease-standard),
    transform var(--bew-duration-normal) var(--bew-ease-standard),
    border-radius var(--bew-duration-normal) var(--bew-ease-standard),
    corner-shape var(--bew-duration-normal) var(--bew-ease-standard);
}

.conversation-view__floating-composer[data-entering="true"] {
  transform: translateY(var(--bew-space-2));
}

.conversation-view__floating-composer > .conversation-view__test-send {
  opacity: 1;
  transition: opacity var(--bew-duration-normal) var(--bew-ease-standard);
}

.conversation-view__floating-composer[data-entering="true"] > .conversation-view__test-send {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .conversation-view__floating-composer,
  .conversation-view__new-messages {
    transition: none;
  }

  .conversation-view__floating-composer[data-entering="true"] {
    transform: none;
  }

  .conversation-view__floating-composer > .conversation-view__test-send {
    transition: none;
  }
}

.conversation-view--solid .conversation-view__floating-composer,
.conversation-view--solid .conversation-view__new-messages {
  background: var(--bew-elevated-alt-solid);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
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
  box-sizing: border-box;
  display: flex;
  gap: var(--bew-space-2);
  align-items: center;
  justify-content: center;
  right: var(--bew-space-4);
  left: auto;
  bottom: 0;
  width: var(--bew-control-height-lg);
  height: var(--bew-control-height-lg);
  max-width: calc(100% - var(--bew-space-8));
  min-height: var(--bew-control-height-lg);
  padding: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
  appearance: none;
  cursor: pointer;
  border-radius: 50%;
  corner-shape: var(--bew-corner-shape-round);
}

.conversation-view--search-mode .conversation-view__new-messages,
.conversation-view--has-composer .conversation-view__new-messages {
  right: auto;
  left: calc(100% - var(--conversation-composer-end-inset) + var(--bew-space-2));
  width: var(--bew-message-composer-rest-height);
  height: var(--bew-message-composer-rest-height);
  min-height: var(--bew-message-composer-rest-height);
  max-width: calc(var(--conversation-composer-end-inset) - var(--bew-space-2) - var(--bew-space-4));
}

.conversation-view .conversation-view__new-messages.conversation-view__search-navigation {
  width: max-content;
  padding: 0 var(--bew-space-2);
  border-radius: calc(var(--bew-message-composer-rest-height) / 2);
  cursor: default;
}

.conversation-view__latest-action {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  padding: 0;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: inherit;
  color: var(--bew-message-icon-hover);
  transition: color var(--bew-duration-moderate) var(--bew-ease-standard);
}

.conversation-view__latest-action:hover {
  color: var(--bew-theme-foreground);
}

.conversation-view__latest-action svg {
  width: var(--bew-icon-size-lg);
  height: var(--bew-icon-size-lg);
}

.conversation-view__new-messages > * {
  animation: conversation-navigation-enter var(--bew-duration-fast) var(--bew-ease-standard);
}
@keyframes conversation-navigation-enter {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.conversation-latest-enter-active,
.conversation-latest-leave-active {
  transition:
    opacity var(--bew-duration-moderate) var(--bew-ease-standard),
    transform var(--bew-duration-moderate) var(--bew-ease-standard);
}

.conversation-latest-enter-from,
.conversation-latest-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

.conversation-latest-leave-active {
  pointer-events: none;
}

@media (max-width: breakpoints.$mobile-max) {
  .conversation-view--has-composer .conversation-view__new-messages {
    width: var(--bew-message-composer-rest-height);
    padding-inline: var(--bew-space-2);
  }
}

// Latest-message navigation follows the inner single-line field, while search
// navigation retains the existing outer-composer height at each breakpoint.
.conversation-view .conversation-view__new-messages:not(.conversation-view__search-navigation) {
  width: var(--bew-message-input-height);
  height: var(--bew-message-input-height);
  min-height: var(--bew-message-input-height);
  padding: 0;
}

.conversation-view--has-composer .conversation-view__new-messages:not(.conversation-view__search-navigation) {
  bottom: calc((var(--bew-message-composer-rest-height) - var(--bew-message-input-height)) / 2);
}

@media (max-width: breakpoints.$grid-sm) {
  .conversation-view--has-composer:not(.conversation-view--search-mode):is(
      .conversation-view--has-new-messages,
      :has(> .conversation-latest-leave-active)
    ) {
    --conversation-composer-end-inset: calc(var(--bew-message-input-height) + var(--bew-space-2) + var(--bew-space-4));
  }
}

@media (max-width: breakpoints.$grid-sm) {
  .conversation-view.conversation-view--has-composer.conversation-view--search-mode {
    --conversation-composer-end-inset: var(--bew-space-4);
    --conversation-new-message-reserve: calc(var(--bew-control-height-lg) + var(--bew-space-2));
  }
  .conversation-view .conversation-view__new-messages.conversation-view__search-navigation {
    right: var(--bew-space-4);
    left: auto;
    bottom: 0;
    max-width: calc(100% - var(--bew-space-8));
    height: var(--bew-control-height-lg);
    min-height: var(--bew-control-height-lg);
  }
  .conversation-view--has-composer .conversation-view__new-messages.conversation-view__search-navigation {
    bottom: calc(var(--conversation-composer-reserve) + var(--bew-space-2));
  }
  .conversation-view--has-composer.conversation-view--has-new-messages,
  .conversation-view--has-composer:has(> .conversation-latest-leave-active) {
    --conversation-composer-start-inset: var(--bew-space-2);
    --conversation-composer-end-inset: calc(var(--bew-control-height-lg) + var(--bew-space-2) + var(--bew-space-4));
  }

  .conversation-view--has-composer .conversation-view__new-messages {
    width: var(--bew-control-height-lg);
    height: var(--bew-control-height-lg);
    min-height: var(--bew-control-height-lg);
  }
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
}

@media (prefers-reduced-motion: reduce) {
  .conversation-view__latest-action {
    transition: none;
  }
  .conversation-view__new-messages > * {
    animation: none;
  }
  .conversation-view,
  .conversation-card,
  .conversation-view__messages,
  .conversation-card__top-edge,
  .conversation-card__bottom-edge,
  .conversation-history-enter-active,
  .conversation-history-leave-active {
    transition: none;
  }
  .conversation-latest-enter-active,
  .conversation-latest-leave-active {
    transition: opacity var(--bew-duration-fast) linear;
  }
  .conversation-latest-enter-from,
  .conversation-latest-leave-to {
    transform: none;
  }
  .conversation-view__timeline--reveal > .conversation-view__message--reveal {
    animation: none;
  }
}
</style>
