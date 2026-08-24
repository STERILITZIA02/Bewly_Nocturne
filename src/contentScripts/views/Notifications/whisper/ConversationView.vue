<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { LAYOUT_BREAKPOINTS } from '~/constants/layout'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'

import type {
  ConversationExpansionAction,
  ConversationExpansionGeometry,
  ConversationExpansionModel,
  ConversationScrollMetrics,
} from './conversationExpansion'
import {
  calculateConversationExpandedGeometry,
  calculateConversationTopProgress,
  COMPACT_CONVERSATION_EXPANSION,
  CONVERSATION_EXPANSION_DURATION,
  getConversationCornerProgress,
  getConversationExpansionGeometry,
  getConversationLayoutProgress,
  reduceConversationExpansion,
  shouldCollapseConversationAtLatest,
} from './conversationExpansion'
import ConversationHistorySkeleton from './ConversationHistorySkeleton.vue'
import ConversationTimelineSkeleton from './ConversationTimelineSkeleton.vue'
import MessageComposer from './experimental/MessageComposer.vue'
import type { DisplayPrivateMessage as OptimisticPrivateMessage } from './experimental/privateMessageTransactions'
import type { PrivateMessagesController as PrivateMessageWriteController } from './experimental/usePrivateMessageWrites'
import type { DisplayPrivateMessage } from './privateMessage'
import PrivateMessageImageViewer from './PrivateMessageImageViewer.vue'
import PrivateMessageItem from './PrivateMessageItem.vue'
import type { TransientPrivateRecipient } from './privateRecipientSearch'
import type { DisplayPrivateSession } from './privateSession'
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
const topBarStore = useTopBarStore()
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
const conversationCardRef = ref<HTMLElement | null>(null)
const messageScrollRef = ref<HTMLElement | null>(null)
const previewImage = ref('')
const state = computed(() => props.controller.getState(talkerId.value))
const isTextSendEnabled = computed(() => Boolean(props.writeController) && Boolean(
  props.recipient || props.session?.capabilities.canSend,
))
const writeState = computed(() => props.writeController?.getState(talkerId.value) ?? null)
const emotePackages = computed(() => props.controller.emotePackages.value)
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
const expansionModel = ref<ConversationExpansionModel>({ ...COMPACT_CONVERSATION_EXPANSION })
const baseTopRadius = ref(12)
const isMobileLayout = ref(false)
const reducedMotion = ref(false)
const isLayoutTransitioning = ref(false)
const isAtLatestPosition = ref(true)
const expandedGeometry = ref<ConversationExpansionGeometry>({ extraHeight: 0, topLift: 0 })
const historyLoading = computed(() => state.value.loadingOlder)
const isAtHistoryStart = computed(() => state.value.noMore)
const layoutProgress = computed(() => getConversationLayoutProgress(expansionModel.value))
const cornerProgress = computed(() => getConversationCornerProgress(expansionModel.value))
const expansionGeometry = computed(() => getConversationExpansionGeometry(
  {
    bottom: layoutProgress.value,
    top: layoutProgress.value,
  },
  isMobileLayout.value,
  expandedGeometry.value,
))
const conversationLayoutStyle = computed<Record<string, string>>(() => ({
  '--conversation-extra-height': `${expansionGeometry.value.extraHeight}px`,
  '--conversation-top-lift': `${expansionGeometry.value.topLift}px`,
  '--conversation-top-radius': `${baseTopRadius.value * cornerProgress.value.top}px`,
  '--conversation-bottom-radius': `${baseTopRadius.value * cornerProgress.value.bottom}px`,
}))

const SCROLL_EDGE_THRESHOLD = 48
let activationGeneration = 0
let layoutGeneration = 0
let scrollInteractionGeneration = 0
let scrollFrameId: number | null = null
let layoutTransitionTimer: ReturnType<typeof setTimeout> | null = null
let layoutTransitionTarget: 'compact' | 'expanded' | null = null
let directScrollGestureEndFrame: number | null = null
let conversationResizeObserver: ResizeObserver | null = null
let layoutMediaController: AbortController | null = null
let componentMounted = false
let conversationActivationPending = false
let userHasReadUpward = false
let userRequestedLatest = false
let directScrollGestureActive = false
let directGestureClientY: number | null = null
let lastProcessedScrollTop = 0

interface VisibleMessageAnchor {
  id: string
  offset: number
}

function readScrollMetrics(viewport: HTMLElement): ConversationScrollMetrics {
  return {
    clientHeight: viewport.clientHeight,
    scrollHeight: viewport.scrollHeight,
    scrollTop: viewport.scrollTop,
  }
}

function isMetricsAtLatest(metrics: ConversationScrollMetrics): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= SCROLL_EDGE_THRESHOLD
}

function clearLayoutTransition() {
  if (layoutTransitionTimer !== null)
    clearTimeout(layoutTransitionTimer)
  layoutTransitionTimer = null
  layoutTransitionTarget = null
  isLayoutTransitioning.value = false
}

function completeLayoutTransition() {
  if (layoutTransitionTimer !== null)
    clearTimeout(layoutTransitionTimer)
  layoutTransitionTimer = null
  layoutTransitionTarget = null
  isLayoutTransitioning.value = false
  const completionLayoutGeneration = layoutGeneration
  const shouldSettleCompact = expansionModel.value.state === 'expanding'
    && expansionModel.value.topExpansionProgress === 0
  if (shouldSettleCompact)
    expansionModel.value = reduceConversationExpansion(expansionModel.value, { type: 'settle' })

  void nextTick(() => {
    if (
      !componentMounted
      || !props.active
      || completionLayoutGeneration !== layoutGeneration
    ) {
      return
    }
    const viewport = messageScrollRef.value
    if (viewport && shouldSettleCompact) {
      if (state.value.newMessagesAvailable) {
        isAtLatestPosition.value = false
        saveViewportState(readScrollMetrics(viewport), false)
      }
      else {
        viewport.scrollTop = viewport.scrollHeight
        lastProcessedScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
        isAtLatestPosition.value = true
        saveViewportState(readScrollMetrics(viewport), true)
        void acknowledgeIfEligible()
      }
    }
    scheduleScrollFrame()
  })
}

function beginLayoutTransition(target: 'compact' | 'expanded') {
  clearLayoutTransition()
  layoutTransitionTarget = target
  if (reducedMotion.value) {
    completeLayoutTransition()
    return
  }
  isLayoutTransitioning.value = true
  layoutTransitionTimer = setTimeout(completeLayoutTransition, CONVERSATION_EXPANSION_DURATION)
}

function applyExpansionAction(action: ConversationExpansionAction) {
  if (isMobileLayout.value && action.type !== 'reset')
    return

  const current = expansionModel.value
  const next = reduceConversationExpansion(current, action)
  if (
    next.state === current.state
    && next.topExpansionProgress === current.topExpansionProgress
  ) {
    return
  }
  const currentLayoutProgress = getConversationLayoutProgress(current)
  const nextLayoutProgress = getConversationLayoutProgress(next)
  expansionModel.value = next
  if (currentLayoutProgress !== nextLayoutProgress) {
    beginLayoutTransition(nextLayoutProgress > currentLayoutProgress ? 'expanded' : 'compact')
  }
}

function resetConversationExpansion() {
  layoutGeneration++
  scrollInteractionGeneration++
  userHasReadUpward = false
  userRequestedLatest = false
  directScrollGestureActive = false
  directGestureClientY = null
  if (directScrollGestureEndFrame !== null)
    cancelAnimationFrame(directScrollGestureEndFrame)
  directScrollGestureEndFrame = null
  isAtLatestPosition.value = true
  lastProcessedScrollTop = 0
  clearLayoutTransition()
  if (scrollFrameId !== null)
    cancelAnimationFrame(scrollFrameId)
  scrollFrameId = null
  expansionModel.value = reduceConversationExpansion(expansionModel.value, { type: 'reset' })
}

function processScrollFrame() {
  scrollFrameId = null
  const viewport = messageScrollRef.value
  if (!viewport || !props.active || conversationActivationPending)
    return

  const metrics = readScrollMetrics(viewport)
  const physicalAtLatest = isMetricsAtLatest(metrics)
  lastProcessedScrollTop = metrics.scrollTop
  const atLatest = shouldCollapseConversationAtLatest({
    physicalAtLatest,
    requestedLatest: userRequestedLatest,
    userHasReadUpward,
  })
  isAtLatestPosition.value = atLatest
  saveViewportState(metrics, atLatest)

  if (atLatest) {
    userHasReadUpward = false
    userRequestedLatest = false
    applyExpansionAction({
      type: 'scroll',
      atLatest: true,
      noMore: isAtHistoryStart.value,
      progress: 0,
    })
  }
  else if (
    !isMobileLayout.value
    && (
      userHasReadUpward
      || expansionModel.value.state === 'history-open'
      || historyLoading.value
    )
  ) {
    applyExpansionAction({
      type: 'scroll',
      atLatest: false,
      noMore: isAtHistoryStart.value,
      progress: layoutProgress.value > 0
        ? 1
        : calculateConversationTopProgress(metrics, { atLatest }),
    })
  }

  if (
    userHasReadUpward
    && metrics.scrollTop <= SCROLL_EDGE_THRESHOLD
    && !state.value.loadingOlder
    && !state.value.noMore
    && state.value.failedOperation !== 'load-older'
    && !state.value.paginationStalled
  ) {
    void loadOlderMessages()
  }
  if (atLatest)
    void acknowledgeIfEligible()
}

function scheduleScrollFrame() {
  if (scrollFrameId !== null)
    return
  scrollFrameId = requestAnimationFrame(processScrollFrame)
}

function applyReadingDirection(readsUpward: boolean) {
  scrollInteractionGeneration++
  if (readsUpward) {
    if (layoutTransitionTarget === 'compact')
      clearLayoutTransition()
    userHasReadUpward = true
    userRequestedLatest = false
  }
  else {
    userRequestedLatest = true
  }
}

function getDirectGestureClientY(event: PointerEvent | TouchEvent): number | null {
  if (event instanceof PointerEvent)
    return event.clientY
  return event.touches[0]?.clientY ?? event.changedTouches[0]?.clientY ?? null
}

function markReadingIntent(event: Event) {
  let readsUpward = true
  if (event instanceof WheelEvent) {
    readsUpward = event.deltaY < 0
  }
  else if (event instanceof KeyboardEvent) {
    const scrollKeys = ['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp']
    if (!scrollKeys.includes(event.key))
      return
    readsUpward = ['ArrowUp', 'Home', 'PageUp'].includes(event.key)
  }
  else if (event instanceof PointerEvent || event instanceof TouchEvent) {
    if (directScrollGestureEndFrame !== null)
      cancelAnimationFrame(directScrollGestureEndFrame)
    directScrollGestureEndFrame = null
    directScrollGestureActive = true
    directGestureClientY = getDirectGestureClientY(event)
    scheduleScrollFrame()
    return
  }

  directScrollGestureActive = false
  directGestureClientY = null
  applyReadingDirection(readsUpward)
  scheduleScrollFrame()
}

function handleDirectGestureMove(event: PointerEvent | TouchEvent) {
  if (!directScrollGestureActive)
    return
  const clientY = getDirectGestureClientY(event)
  if (clientY === null)
    return
  const previousClientY = directGestureClientY
  directGestureClientY = clientY
  if (previousClientY === null || Math.abs(clientY - previousClientY) <= 1)
    return
  if (event instanceof PointerEvent && event.pointerType === 'mouse')
    return

  applyReadingDirection(clientY > previousClientY)
  scheduleScrollFrame()
}

function endDirectScrollGesture() {
  if (directScrollGestureEndFrame !== null)
    return
  directScrollGestureEndFrame = requestAnimationFrame(() => {
    directScrollGestureEndFrame = null
    directScrollGestureActive = false
    directGestureClientY = null
  })
  scheduleScrollFrame()
}

function setupConversationMeasurements() {
  conversationResizeObserver?.disconnect()
  conversationResizeObserver = null
  if (typeof ResizeObserver === 'undefined')
    return
  conversationResizeObserver = new ResizeObserver(() => {
    if (!componentMounted || !props.active)
      return
    updateConversationGeometry()
    const card = conversationCardRef.value
    if (card && expansionModel.value.state === 'compact') {
      const radius = Number.parseFloat(
        getComputedStyle(card).getPropertyValue('--bew-panel-radius'),
      )
      if (Number.isFinite(radius) && radius >= 0)
        baseTopRadius.value = radius
    }
    scheduleScrollFrame()
  })
  if (conversationViewRef.value)
    conversationResizeObserver.observe(conversationViewRef.value)
}

function updateConversationGeometry() {
  const view = conversationViewRef.value
  if (!view)
    return

  const rect = view.getBoundingClientRect()
  const visualViewport = window.visualViewport
  const viewportTop = visualViewport?.offsetTop ?? 0
  const viewportHeight = visualViewport?.height ?? window.innerHeight
  expandedGeometry.value = calculateConversationExpandedGeometry({
    bottom: rect.bottom - viewportTop,
    top: rect.top - viewportTop,
    viewportHeight,
  }, isMobileLayout.value)
}

function setupLayoutMediaQueries() {
  layoutMediaController?.abort()
  const controller = new AbortController()
  layoutMediaController = controller
  const mobileQuery = window.matchMedia(`(max-width: ${LAYOUT_BREAKPOINTS.mobileMax}px)`)
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  const sync = () => {
    const enteredMobileLayout = !isMobileLayout.value && mobileQuery.matches
    isMobileLayout.value = mobileQuery.matches
    reducedMotion.value = motionQuery.matches
    if (enteredMobileLayout)
      resetConversationExpansion()
    else if (reducedMotion.value && isLayoutTransitioning.value)
      completeLayoutTransition()
    updateConversationGeometry()
  }
  sync()
  mobileQuery.addEventListener('change', sync, { signal: controller.signal })
  motionQuery.addEventListener('change', sync, { signal: controller.signal })
  window.addEventListener('resize', sync, { signal: controller.signal })
  window.addEventListener('pointercancel', endDirectScrollGesture, { signal: controller.signal })
  window.addEventListener('pointerup', endDirectScrollGesture, { signal: controller.signal })
  window.addEventListener('touchcancel', endDirectScrollGesture, { passive: true, signal: controller.signal })
  window.addEventListener('touchend', endDirectScrollGesture, { passive: true, signal: controller.signal })
  window.visualViewport?.addEventListener('resize', sync, { signal: controller.signal })
  window.visualViewport?.addEventListener('scroll', sync, { signal: controller.signal })
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
  const physicalAtLatest = isMetricsAtLatest(readScrollMetrics(viewport))
  return shouldCollapseConversationAtLatest({
    physicalAtLatest,
    requestedLatest: userRequestedLatest,
    userHasReadUpward,
  })
}

function saveViewportState(
  metrics?: ConversationScrollMetrics,
  atLatestOverride?: boolean,
) {
  const viewport = messageScrollRef.value
  if (!viewport)
    return
  const currentMetrics = metrics ?? readScrollMetrics(viewport)
  props.controller.updateViewport(talkerId.value, {
    atLatest: atLatestOverride
      ?? (isAtLatestPosition.value && isMetricsAtLatest(currentMetrics)),
    scrollTop: currentMetrics.scrollTop,
  })
}

function scrollToLatest(behavior: ScrollBehavior = 'auto') {
  const viewport = messageScrollRef.value
  if (!viewport)
    return
  scrollInteractionGeneration++
  directScrollGestureActive = false
  userHasReadUpward = false
  userRequestedLatest = true
  const resolvedBehavior = behavior === 'smooth' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : behavior
  lastProcessedScrollTop = viewport.scrollTop
  viewport.scrollTo({ top: viewport.scrollHeight, behavior: resolvedBehavior })
  const metrics = readScrollMetrics(viewport)
  const atLatest = isMetricsAtLatest(metrics)
  isAtLatestPosition.value = atLatest
  props.controller.updateViewport(talkerId.value, {
    atLatest,
    scrollTop: metrics.scrollTop,
  })
  scheduleScrollFrame()
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

async function loadOlderMessages(explicitRetry = false) {
  const viewport = messageScrollRef.value
  if (!viewport || state.value.loadingOlder || state.value.noMore)
    return

  const requestTalkerId = talkerId.value
  const requestLayoutGeneration = layoutGeneration
  const requestScrollGeneration = scrollInteractionGeneration
  const requestActivationGeneration = activationGeneration
  const requestLifecycleEpoch = props.controller.lifecycleEpoch.value
  const requestStateGeneration = state.value.generation
  const oldScrollHeight = viewport.scrollHeight
  const oldScrollTop = viewport.scrollTop
  const anchor = captureVisibleMessageAnchor(viewport)
  applyExpansionAction({ type: 'load-start', noMore: state.value.noMore })

  if (explicitRetry)
    await props.controller.retryLoadOlder(requestTalkerId)
  else
    await props.controller.loadOlder(requestTalkerId)
  await nextTick()
  if (
    viewport !== messageScrollRef.value
    || requestTalkerId !== talkerId.value
    || requestLayoutGeneration !== layoutGeneration
    || requestScrollGeneration !== scrollInteractionGeneration
    || requestActivationGeneration !== activationGeneration
    || requestLifecycleEpoch !== props.controller.lifecycleEpoch.value
    || requestStateGeneration !== state.value.generation
    || !props.active
  ) {
    scheduleScrollFrame()
    return
  }

  if (!restoreVisibleMessageAnchor(viewport, anchor))
    viewport.scrollTop = oldScrollTop + viewport.scrollHeight - oldScrollHeight
  lastProcessedScrollTop = viewport.scrollTop
  applyExpansionAction({ type: 'load-end', noMore: state.value.noMore })
  saveViewportState()
  if (state.value.failedOperation === 'load-older' || state.value.paginationStalled)
    userHasReadUpward = false
  else
    scheduleScrollFrame()
}

async function refreshLatest(options: { forceBottom?: boolean } = {}) {
  const wasAtLatest = isAtLatest()
  const requestScrollGeneration = scrollInteractionGeneration
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
  if (shouldFollow && requestScrollGeneration === scrollInteractionGeneration)
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

function selectImage(file: File) {
  props.writeController?.selectImage(talkerId.value, file)
}

async function finishConfirmedWrite() {
  await props.controller.refreshLatest(talkerId.value)
  await nextTick()
  scrollToLatest()
  emit('sendConfirmed', talkerId.value)
}

async function sendImage() {
  const writer = props.writeController
  if (!writer)
    return
  const confirmed = await writer.sendImage(talkerId.value)
  if (confirmed)
    await finishConfirmedWrite()
}

async function retryImage(localId: string) {
  const writer = props.writeController
  if (!writer)
    return
  const confirmed = await writer.retryImage(talkerId.value, localId)
  if (confirmed)
    await finishConfirmedWrite()
}

async function retryFailed(localId: string, msgType: number) {
  if (msgType === 2) {
    await retryImage(localId)
    return
  }
  const writer = props.writeController
  if (!writer)
    return
  const confirmed = await writer.retrySend(talkerId.value, localId)
  if (confirmed)
    await finishConfirmedWrite()
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
  if (!props.active || !componentMounted)
    return
  const generation = ++activationGeneration
  conversationActivationPending = true
  const initialScrollGeneration = scrollInteractionGeneration
  const wasLoaded = state.value.loaded
  if (wasLoaded)
    await props.controller.refreshLatest(talkerId.value)
  else
    await props.controller.loadInitial(talkerId.value, props.session?.ackSeqno ?? '0')
  await nextTick()
  if (
    generation !== activationGeneration
    || initialScrollGeneration !== scrollInteractionGeneration
    || !props.active
  ) {
    finishConversationActivation(generation)
    return
  }

  const viewport = messageScrollRef.value
  if (!viewport) {
    finishConversationActivation(generation)
    return
  }
  if (!wasLoaded || state.value.atLatest) {
    scrollToLatest()
  }
  else {
    userHasReadUpward = true
    userRequestedLatest = false
    isAtLatestPosition.value = false
    viewport.scrollTop = state.value.scrollTop
    lastProcessedScrollTop = viewport.scrollTop
    applyExpansionAction({
      type: 'scroll',
      atLatest: false,
      noMore: state.value.noMore,
      progress: 1,
    })
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

function handleScroll() {
  const viewport = messageScrollRef.value
  if (viewport && directScrollGestureActive) {
    const scrollTop = viewport.scrollTop
    if (scrollTop < lastProcessedScrollTop - 1)
      applyReadingDirection(true)
    else if (scrollTop > lastProcessedScrollTop + 1)
      applyReadingDirection(false)
    lastProcessedScrollTop = scrollTop
  }
  scheduleScrollFrame()
}

function focusHeading() {
  messageScrollRef.value?.focus({ preventScroll: true })
}

function handleEscape() {
  if (window.matchMedia(`(max-width: ${LAYOUT_BREAKPOINTS.mobileMax}px)`).matches)
    emit('back')
}

watch(talkerId, () => {
  previewImage.value = ''
  resetConversationExpansion()
})
watch(() => writeState.value?.imageDraft?.objectUrl ?? '', (nextUrl, previousUrl) => {
  if (previousUrl && previewImage.value === previousUrl && nextUrl !== previousUrl)
    previewImage.value = ''
})

watch(() => state.value.noMore, (noMore) => {
  if (expansionModel.value.state === 'history-open') {
    applyExpansionAction({
      type: 'scroll',
      atLatest: false,
      noMore,
      progress: expansionModel.value.topExpansionProgress,
    })
  }
})

watch(() => props.active, (active) => {
  if (active) {
    if (componentMounted) {
      setupLayoutMediaQueries()
      setupConversationMeasurements()
      void activateConversation()
    }
  }
  else {
    activationGeneration++
    conversationActivationPending = false
    conversationResizeObserver?.disconnect()
    conversationResizeObserver = null
    layoutMediaController?.abort()
    layoutMediaController = null
    resetConversationExpansion()
  }
}, { immediate: true })

onMounted(() => {
  componentMounted = true
  if (props.active) {
    setupLayoutMediaQueries()
    setupConversationMeasurements()
    void activateConversation()
  }
})

onBeforeUnmount(() => {
  componentMounted = false
  conversationActivationPending = false
  activationGeneration++
  saveViewportState()
  layoutMediaController?.abort()
  layoutMediaController = null
  conversationResizeObserver?.disconnect()
  conversationResizeObserver = null
  resetConversationExpansion()
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
    :data-expansion-state="expansionModel.state"
    :data-at-history-start="isAtHistoryStart ? 'true' : undefined"
    :data-at-latest="isAtLatestPosition ? 'true' : undefined"
    :aria-label="t('notifications.whisper.messages.timeline_aria', { name: displayName })"
    :aria-busy="state.loadingInitial && !state.loaded || historyLoading"
    @keydown.esc="handleEscape"
  >
    <div
      ref="conversationCardRef"
      class="conversation-card"
      :class="{
        'conversation-card--solid': settings.disableFrostedGlass,
        'conversation-card--history-open': expansionModel.state === 'history-open',
      }"
    >
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
        <div
          v-if="state.loadingInitial && !state.loaded"
          class="conversation-view__initial-skeleton"
        >
          <div class="conversation-view__history-status conversation-view__history-status--loading">
            <ConversationHistorySkeleton
              :announce="false"
              :label="t('notifications.whisper.messages.loading')"
            />
          </div>
          <ConversationTimelineSkeleton
            :compact="settings.privateMessageDensity === 'compact'"
            :label="t('notifications.whisper.messages.loading')"
          />
        </div>

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
            :class="{ 'conversation-view__history-status--loading': historyLoading }"
          >
            <ConversationHistorySkeleton
              v-if="historyLoading"
              :label="t('notifications.whisper.messages.loading')"
            />
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

          <div v-if="timelineItems.length" class="conversation-view__timeline">
            <PrivateMessageItem
              v-for="message in timelineItems"
              :key="message.msgKey"
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

      <div
        class="conversation-card__top-edge"
        :class="{ 'conversation-card__top-edge--visible': layoutProgress > 0 }"
        aria-hidden="true"
      />
      <div
        class="conversation-card__bottom-edge"
        :class="{ 'conversation-card__bottom-edge--visible': layoutProgress > 0 }"
        aria-hidden="true"
      />
    </div>

    <CloseButton
      class="conversation-view__close"
      :label="t('common.close')"
      @click="emit('back')"
    />

    <button
      v-if="state.newMessagesAvailable"
      type="button"
      class="conversation-view__new-messages"
      @click="scrollToLatest('smooth'); acknowledgeIfEligible()"
    >
      {{ t('notifications.whisper.messages.new_messages') }}
    </button>

    <footer
      v-if="isTextSendEnabled && writeState"
      class="conversation-view__floating-composer"
      :class="{ 'conversation-view__floating-composer--solid': settings.disableFrostedGlass }"
    >
      <div class="conversation-view__test-send">
        <MessageComposer
          v-model="draft"
          :sending="writeState.sending"
          :image-draft="writeState.imageDraft"
          :emote-packages="emotePackages"
          enable-image
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
  background: var(--bew-elevated-alt);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--conversation-top-radius, var(--bew-panel-radius))
    var(--conversation-top-radius, var(--bew-panel-radius)) var(--conversation-bottom-radius, var(--bew-panel-radius))
    var(--conversation-bottom-radius, var(--bew-panel-radius));
  corner-shape: var(--bew-corner-shape);
  box-shadow: var(--bew-shadow-2), var(--bew-shadow-edge-glow-1);
  backdrop-filter: var(--bew-filter-glass-1);
  transform: translateY(var(--conversation-top-lift, 0px));
  transition:
    height var(--bew-duration-normal) var(--bew-ease-standard),
    transform var(--bew-duration-normal) var(--bew-ease-standard),
    border-radius var(--bew-duration-fast) linear;
  -webkit-backdrop-filter: var(--bew-filter-glass-1);
}

.conversation-view--layout-transitioning .conversation-card {
  will-change: height, transform, border-radius;
}

.conversation-view__close {
  position: absolute;
  top: var(--bew-space-3);
  right: var(--bew-space-3);
  z-index: 5;
}

.conversation-card--solid,
.conversation-view__floating-composer--solid {
  background: var(--bew-elevated-alt-solid);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.conversation-view__messages {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 0;
  padding: var(--bew-space-3) var(--bew-space-4)
    calc(var(--conversation-composer-reserve) + var(--conversation-new-message-reserve) + var(--bew-space-4));
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  background: transparent;
  outline: none;
}

.conversation-view__messages:focus-visible {
  outline: 2px solid var(--bew-theme-focus-ring);
  outline-offset: calc(0px - var(--bew-space-1));
}

.conversation-view__initial-skeleton {
  min-width: 0;
}

.conversation-view__timeline {
  display: grid;
  gap: var(--bew-space-3);
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

.conversation-view__history-status--loading {
  padding: 0;
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
  position: absolute;
  right: var(--bew-space-4);
  bottom: var(--bew-space-4);
  left: var(--bew-space-4);
  z-index: 4;
  padding: var(--bew-space-2);
  background: var(--bew-elevated-alt);
  border: 1px solid var(--bew-surface-border-color);
  border-radius: var(--bew-panel-radius);
  corner-shape: var(--bew-corner-shape);
  box-shadow: var(--bew-shadow-3), var(--bew-shadow-edge-glow-1);
  backdrop-filter: var(--bew-filter-glass-1);
  -webkit-backdrop-filter: var(--bew-filter-glass-1);
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
    bottom: var(--bew-space-3);
    left: var(--bew-space-3);
  }
}

@media (prefers-reduced-motion: reduce) {
  .conversation-view,
  .conversation-card,
  .conversation-card__top-edge,
  .conversation-card__bottom-edge {
    transition: none;
  }
}
</style>
