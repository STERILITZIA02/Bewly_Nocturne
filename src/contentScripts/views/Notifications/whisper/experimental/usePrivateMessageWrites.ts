/**
 * EXPERIMENTAL: text send is available only through the explicit DEV test UI; image writes remain unexposed.
 */
import type { Ref } from 'vue'
import { reactive, watch } from 'vue'

import type {
  PrivateMessageApiResponse,
  PrivateMessagesData,
  PrivateMessageTransportErrorKind,
  UploadedPrivateImage,
} from '~/background/privateMessage/types'

import type { DisplayPrivateMessage } from './privateMessageTransactions'
import {
  comparePrivateMessageSeqno,
  createOptimisticPrivateImageMessage,
  createOptimisticPrivateTextMessage,
  getLatestPrivateMessageSeqno,
  getOldestPrivateMessageSeqno,
  getPrivateMessageText,
  mergePrivateMessages,
  reconcileOptimisticPrivateMessages,
  transformPrivateMessages,
} from './privateMessageTransactions'

interface FetchPrivateMessagesOptions {
  endSeqno?: string
  talkerId: string
}

interface AckPrivateMessagesOptions {
  ackSeqno: string
  csrf: string
  talkerId: string
}

interface SendPrivateMessageOptions {
  csrf: string
  senderId: string
  talkerId: string
  text: string
}

interface UploadPrivateImageOptions {
  bytes: number[]
  csrf: string
  fileName: string
  mimeType: string
  requestId: string
}

interface SendPrivateImageMessageOptions {
  csrf: string
  senderId: string
  talkerId: string
  uploaded: UploadedPrivateImage
}

export type PrivateImageFailureKind = 'upload-failed' | 'send-failed' | 'reconcile-failed'

export type PrivateTextSendOutcome
  = | 'confirmed'
    | 'accepted-but-unconfirmed'
    | 'protocol-mismatch'
    | 'failed'
    | null

export interface PrivateTextSendDiagnostic {
  kind: PrivateMessageTransportErrorKind
  httpStatus: number
  redirected: boolean
  finalHost: string
  apiCode: number | null
}

export const PRIVATE_TEXT_SEND_HISTORY_RETRY_DELAYS_MS = [250, 750, 1500] as const

export interface PrivateImageDraftState {
  failureKind: PrivateImageFailureKind | null
  fileName: string
  localId: string
  objectUrl: string
  size: number
  status: 'preparing' | 'uploading' | 'sending' | 'reconciling' | 'failed'
}

export interface PrivateConversationState {
  talkerId: string
  items: DisplayPrivateMessage[]
  loading: boolean
  loadingOlder: boolean
  refreshing: boolean
  loaded: boolean
  noMore: boolean
  errorKind: PrivateMessageTransportErrorKind | null
  failedOperation: 'initial' | 'refresh' | 'load-older' | null
  generation: number
  scrollTop: number
  atLatest: boolean
  newMessagesAvailable: boolean
  lastAckSeqno: string
  draft: string
  sending: boolean
  imageDraft: PrivateImageDraftState | null
  lastTextSendOutcome: PrivateTextSendOutcome
  lastTextSendDiagnostic: PrivateTextSendDiagnostic | null
}

export interface PrivateMessagesDependencies {
  fetchMessages: (options: FetchPrivateMessagesOptions) => Promise<unknown>
  ackSession: (options: AckPrivateMessagesOptions) => Promise<unknown>
  getCsrf: () => string
  markSessionRead: (talkerId: string, ackSeqno: string) => void
  syncUnread: () => Promise<void>
  sendMessage?: (options: SendPrivateMessageOptions) => Promise<unknown>
  uploadImage?: (options: UploadPrivateImageOptions) => Promise<unknown>
  cancelImageUpload?: (requestId: string) => Promise<unknown>
  sendImageMessage?: (options: SendPrivateImageMessageOptions) => Promise<unknown>
  markSessionSent?: (talkerId: string, summary: string, timestamp: number) => void
  refreshSessions?: () => Promise<void>
  createLocalId?: () => string
  nowSeconds?: () => number
  createObjectUrl?: (file: File) => string
  revokeObjectUrl?: (url: string) => void
  readFileBytes?: (file: File) => Promise<number[]>
  createUploadRequestId?: () => string
  getImageSummary?: () => string
  wait?: (delayMs: number) => Promise<void>
}

export interface PrivateAckEligibility {
  atLatest: boolean
  pageActive: boolean
  visible: boolean
}

export interface PrivateMessagesController {
  states: Map<string, PrivateConversationState>
  getState: (talkerId: string) => PrivateConversationState
  loadInitial: (talkerId: string, lastAckSeqno?: string) => Promise<void>
  loadOlder: (talkerId: string) => Promise<void>
  refreshLatest: (talkerId: string) => Promise<void>
  updateViewport: (talkerId: string, viewport: { atLatest: boolean, scrollTop: number }) => void
  acknowledgeIfEligible: (talkerId: string, eligibility: PrivateAckEligibility) => Promise<boolean>
  setDraft: (talkerId: string, text: string) => void
  sendDraft: (talkerId: string) => Promise<boolean>
  retrySend: (talkerId: string, localId: string) => Promise<boolean>
  sendImage: (talkerId: string, file: File) => Promise<boolean>
  retryImage: (talkerId: string, localId: string) => Promise<boolean>
  removeImage: (talkerId: string, localId: string) => void
  editFailed: (talkerId: string, localId: string) => void
  deleteFailed: (talkerId: string, localId: string) => void
  invalidateConversation: (talkerId: string) => void
  dispose: () => void
}

interface PrivateImageTask {
  bytes?: number[]
  file: File
  localId: string
  objectUrl: string
  talkerId: string
  uploaded?: UploadedPrivateImage
  uploadRequestId?: string
  failureKind: PrivateImageFailureKind | null
}

function asResponse(value: unknown): PrivateMessageApiResponse<unknown> | null {
  if (!value || typeof value !== 'object')
    return null
  const response = value as Partial<PrivateMessageApiResponse<unknown>>
  return typeof response.code === 'number' ? response as PrivateMessageApiResponse<unknown> : null
}

function createTextSendDiagnostic(value: unknown): PrivateTextSendDiagnostic {
  const response = asResponse(value)
  const transportError = response?.bewlyError
  if (transportError) {
    return {
      kind: transportError.kind,
      httpStatus: transportError.httpStatus,
      redirected: transportError.redirected,
      finalHost: transportError.finalHost,
      apiCode: typeof transportError.apiCode === 'number'
        ? transportError.apiCode
        : response.code,
    }
  }

  return {
    kind: response ? 'api-error' : 'invalid-response',
    httpStatus: 0,
    redirected: false,
    finalHost: '',
    apiCode: response?.code ?? null,
  }
}

function extractMessages(response: unknown): PrivateMessagesData | null {
  const parsed = asResponse(response)
  if (!parsed || parsed.code !== 0 || !parsed.data || typeof parsed.data !== 'object')
    return null
  const data = parsed.data as Partial<PrivateMessagesData>
  return Array.isArray(data.messages) && Array.isArray(data.e_infos)
    ? data as PrivateMessagesData
    : null
}

function extractSentMessageKey(response: unknown): string {
  const parsed = asResponse(response)
  if (!parsed || parsed.code !== 0 || !parsed.data || typeof parsed.data !== 'object')
    return ''
  const msgKey = (parsed.data as { msg_key?: unknown }).msg_key
  return typeof msgKey === 'string' ? msgKey : ''
}

function extractUploadedImage(response: unknown): UploadedPrivateImage | null {
  const parsed = asResponse(response)
  if (!parsed || parsed.code !== 0 || !parsed.data || typeof parsed.data !== 'object')
    return null
  const data = parsed.data as Partial<UploadedPrivateImage>
  if (
    typeof data.url !== 'string'
    || typeof data.width !== 'number'
    || typeof data.height !== 'number'
    || typeof data.size !== 'number'
    || typeof data.imageType !== 'string'
  ) {
    return null
  }
  return data as UploadedPrivateImage
}

function resolveErrorKind(response: unknown): PrivateMessageTransportErrorKind {
  const parsed = asResponse(response)
  return parsed?.bewlyError?.kind ?? (parsed ? 'api-error' : 'invalid-response')
}

function createConversationState(talkerId: string): PrivateConversationState {
  return reactive({
    talkerId,
    items: [],
    loading: false,
    loadingOlder: false,
    refreshing: false,
    loaded: false,
    noMore: false,
    errorKind: null,
    failedOperation: null,
    generation: 0,
    scrollTop: 0,
    atLatest: true,
    newMessagesAvailable: false,
    lastAckSeqno: '0',
    draft: '',
    sending: false,
    imageDraft: null,
    lastTextSendOutcome: null,
    lastTextSendDiagnostic: null,
  })
}

export function useExperimentalPrivateMessageWrites(
  currentMid: Ref<string>,
  activeTalkerId: Ref<string>,
  dependencies: PrivateMessagesDependencies,
): PrivateMessagesController {
  const states = reactive(new Map<string, PrivateConversationState>())
  const firstPageRequests = new Map<string, Promise<void>>()
  const olderRequests = new Map<string, Promise<void>>()
  const ackRequests = new Map<string, Promise<boolean>>()
  const sendRequests = new Map<string, Promise<boolean>>()
  const imageRequests = new Map<string, Promise<boolean>>()
  const imageTasks = new Map<string, PrivateImageTask>()
  let accountGeneration = 0
  let disposed = false

  function getState(talkerId: string): PrivateConversationState {
    let state = states.get(talkerId)
    if (!state) {
      state = createConversationState(talkerId)
      states.set(talkerId, state)
    }
    return state
  }

  function isCurrentRequest(
    mid: string,
    requestAccountGeneration: number,
    state: PrivateConversationState,
    conversationGeneration: number,
  ): boolean {
    return (
      mid === currentMid.value
      && requestAccountGeneration === accountGeneration
      && conversationGeneration === state.generation
      && states.get(state.talkerId) === state
    )
  }

  function isCurrentAccountState(
    mid: string,
    requestAccountGeneration: number,
    state: PrivateConversationState,
  ): boolean {
    return (
      mid === currentMid.value
      && requestAccountGeneration === accountGeneration
      && states.get(state.talkerId) === state
    )
  }

  function applyLastAckSeqno(state: PrivateConversationState, lastAckSeqno?: string) {
    if (
      lastAckSeqno
      && comparePrivateMessageSeqno(lastAckSeqno, state.lastAckSeqno) > 0
    ) {
      state.lastAckSeqno = lastAckSeqno
    }
  }

  function reconcilePendingMessages(state: PrivateConversationState) {
    const localIds = state.items.flatMap(item => (
      item.localId && (
        item.sendState === 'reconciling'
        || item.sendState === 'accepted-but-unconfirmed'
      )
        ? [item.localId]
        : []
    ))
    for (const localId of localIds) {
      const result = reconcileOptimisticPrivateMessages(state.items, localId)
      state.items = result.items
      if (result.reconciled)
        state.lastTextSendOutcome = 'confirmed'
    }
  }

  function requestFirstPage(
    talkerId: string,
    mode: 'replace' | 'merge',
    lastAckSeqno?: string,
  ): Promise<void> {
    const activeRequest = firstPageRequests.get(talkerId)
    if (activeRequest)
      return activeRequest

    const mid = currentMid.value
    if (!mid)
      return Promise.resolve()

    const state = getState(talkerId)
    applyLastAckSeqno(state, lastAckSeqno)
    const requestAccountGeneration = accountGeneration
    const conversationGeneration = state.generation
    const failedOperation = mode === 'replace' && !state.loaded ? 'initial' : 'refresh'
    const request = (async () => {
      state.loading = mode === 'replace' && !state.loaded
      state.refreshing = mode === 'merge' || state.loaded
      state.errorKind = null
      state.failedOperation = null
      try {
        const response = await dependencies.fetchMessages({ talkerId })
        const data = extractMessages(response)
        if (!data)
          throw resolveErrorKind(response)
        if (!isCurrentRequest(mid, requestAccountGeneration, state, conversationGeneration))
          return

        const incoming = transformPrivateMessages(data.messages, data.e_infos, mid)
        const previousKeys = new Set(state.items.map(item => item.msgKey))
        const hasNewItems = incoming.some(item => !previousKeys.has(item.msgKey))
        const localItems = state.items.filter(item => item.localId)
        state.items = mode === 'replace'
          ? mergePrivateMessages(incoming, localItems)
          : mergePrivateMessages(state.items, incoming)
        reconcilePendingMessages(state)
        state.loaded = true
        state.noMore = mode === 'replace' ? incoming.length === 0 : state.noMore
        state.errorKind = null
        state.failedOperation = null
        if (mode === 'merge' && !state.atLatest && hasNewItems)
          state.newMessagesAvailable = true
        else if (state.atLatest)
          state.newMessagesAvailable = false
      }
      catch (error) {
        if (!isCurrentRequest(mid, requestAccountGeneration, state, conversationGeneration))
          return
        state.errorKind = typeof error === 'string'
          ? error as PrivateMessageTransportErrorKind
          : 'invalid-response'
        state.failedOperation = failedOperation
      }
      finally {
        if (isCurrentRequest(mid, requestAccountGeneration, state, conversationGeneration)) {
          state.loading = false
          state.refreshing = false
        }
      }
    })().finally(() => {
      if (firstPageRequests.get(talkerId) === request)
        firstPageRequests.delete(talkerId)
    })

    firstPageRequests.set(talkerId, request)
    return request
  }

  function loadInitial(talkerId: string, lastAckSeqno?: string): Promise<void> {
    const state = getState(talkerId)
    applyLastAckSeqno(state, lastAckSeqno)
    return state.loaded
      ? Promise.resolve()
      : requestFirstPage(talkerId, 'replace', lastAckSeqno)
  }

  function loadOlder(talkerId: string): Promise<void> {
    const activeRequest = olderRequests.get(talkerId)
    if (activeRequest)
      return activeRequest

    const mid = currentMid.value
    const state = getState(talkerId)
    const endSeqno = getOldestPrivateMessageSeqno(state.items)
    if (!mid || !state.loaded || state.noMore || !endSeqno)
      return Promise.resolve()

    const requestAccountGeneration = accountGeneration
    const conversationGeneration = state.generation
    const request = (async () => {
      state.loadingOlder = true
      state.errorKind = null
      state.failedOperation = null
      try {
        const response = await dependencies.fetchMessages({ talkerId, endSeqno })
        const data = extractMessages(response)
        if (!data)
          throw resolveErrorKind(response)
        if (!isCurrentRequest(mid, requestAccountGeneration, state, conversationGeneration))
          return

        const incoming = transformPrivateMessages(data.messages, data.e_infos, mid)
        const merged = mergePrivateMessages(state.items, incoming)
        const nextOldestSeqno = getOldestPrivateMessageSeqno(merged)
        state.items = merged
        state.noMore = incoming.length === 0 || comparePrivateMessageSeqno(nextOldestSeqno, endSeqno) >= 0
        state.errorKind = null
        state.failedOperation = null
      }
      catch (error) {
        if (!isCurrentRequest(mid, requestAccountGeneration, state, conversationGeneration))
          return
        state.errorKind = typeof error === 'string'
          ? error as PrivateMessageTransportErrorKind
          : 'invalid-response'
        state.failedOperation = 'load-older'
      }
      finally {
        if (isCurrentRequest(mid, requestAccountGeneration, state, conversationGeneration))
          state.loadingOlder = false
      }
    })().finally(() => {
      if (olderRequests.get(talkerId) === request)
        olderRequests.delete(talkerId)
    })

    olderRequests.set(talkerId, request)
    return request
  }

  function refreshLatest(talkerId: string): Promise<void> {
    const state = getState(talkerId)
    return state.loaded
      ? requestFirstPage(talkerId, 'merge')
      : requestFirstPage(talkerId, 'replace')
  }

  function updateViewport(
    talkerId: string,
    viewport: { atLatest: boolean, scrollTop: number },
  ) {
    const state = states.get(talkerId)
    if (!state)
      return
    state.atLatest = viewport.atLatest
    state.scrollTop = Math.max(0, viewport.scrollTop)
    if (viewport.atLatest)
      state.newMessagesAvailable = false
  }

  function acknowledgeIfEligible(
    talkerId: string,
    eligibility: PrivateAckEligibility,
  ): Promise<boolean> {
    const activeRequest = ackRequests.get(talkerId)
    if (activeRequest)
      return activeRequest

    const mid = currentMid.value
    const state = states.get(talkerId)
    if (!state)
      return Promise.resolve(false)
    const latestSeqno = getLatestPrivateMessageSeqno(state.items)
    if (
      !mid
      || !state.loaded
      || state.failedOperation === 'refresh'
      || activeTalkerId.value !== talkerId
      || !eligibility.pageActive
      || !eligibility.visible
      || !eligibility.atLatest
      || !latestSeqno
      || comparePrivateMessageSeqno(latestSeqno, state.lastAckSeqno) <= 0
    ) {
      return Promise.resolve(false)
    }

    const csrf = dependencies.getCsrf().trim()
    if (!csrf)
      return Promise.resolve(false)

    const requestAccountGeneration = accountGeneration
    const request = (async () => {
      const response = asResponse(await dependencies.ackSession({
        talkerId,
        ackSeqno: latestSeqno,
        csrf,
      }))
      if (
        response?.code !== 0
        || !isCurrentAccountState(mid, requestAccountGeneration, state)
      ) {
        return false
      }

      state.lastAckSeqno = latestSeqno
      dependencies.markSessionRead(talkerId, latestSeqno)
      await dependencies.syncUnread().catch(() => {})
      return true
    })().catch(() => false).finally(() => {
      if (ackRequests.get(talkerId) === request)
        ackRequests.delete(talkerId)
    })

    ackRequests.set(talkerId, request)
    return request
  }

  function setDraft(talkerId: string, text: string) {
    getState(talkerId).draft = text
  }

  function createLocalId(): string {
    return dependencies.createLocalId?.() ?? globalThis.crypto.randomUUID()
  }

  function nowSeconds(): number {
    return dependencies.nowSeconds?.() ?? Math.floor(Date.now() / 1000)
  }

  function createObjectUrl(file: File): string {
    return dependencies.createObjectUrl?.(file) ?? URL.createObjectURL(file)
  }

  function revokeObjectUrl(url: string) {
    if (dependencies.revokeObjectUrl)
      dependencies.revokeObjectUrl(url)
    else
      URL.revokeObjectURL(url)
  }

  async function readFileBytes(file: File): Promise<number[]> {
    if (dependencies.readFileBytes)
      return dependencies.readFileBytes(file)
    return Array.from(new Uint8Array(await file.arrayBuffer()))
  }

  function createUploadRequestId(): string {
    return dependencies.createUploadRequestId?.() ?? globalThis.crypto.randomUUID()
  }

  function updateImageState(
    state: PrivateConversationState,
    task: PrivateImageTask,
    status: PrivateImageDraftState['status'],
    failureKind: PrivateImageFailureKind | null = null,
  ) {
    const message = state.items.find(item => item.localId === task.localId)
    if (message)
      message.sendState = status
    if (state.imageDraft?.localId === task.localId) {
      state.imageDraft.status = status
      state.imageDraft.failureKind = failureKind
    }
    task.failureKind = failureKind
  }

  function releaseImageTask(task: PrivateImageTask, removeOptimistic: boolean) {
    if (task.uploadRequestId) {
      void dependencies.cancelImageUpload?.(task.uploadRequestId).catch(() => {})
      task.uploadRequestId = undefined
    }
    revokeObjectUrl(task.objectUrl)
    imageTasks.delete(task.localId)
    const state = states.get(task.talkerId)
    if (!state)
      return
    if (removeOptimistic)
      state.items = state.items.filter(item => item.localId !== task.localId)
    if (state.imageDraft?.localId === task.localId)
      state.imageDraft = null
  }

  function cancelConversationImages(talkerId: string) {
    for (const task of [...imageTasks.values()]) {
      if (task.talkerId === talkerId)
        releaseImageTask(task, true)
    }
    imageRequests.delete(talkerId)
  }

  async function waitForTextSendHistory(delayMs: number): Promise<void> {
    if (dependencies.wait)
      return dependencies.wait(delayMs)
    await new Promise<void>(resolve => setTimeout(resolve, delayMs))
  }

  async function pullLatestAfterSend(
    talkerId: string,
    localId: string,
    mid: string,
    requestAccountGeneration: number,
    state: PrivateConversationState,
  ): Promise<boolean> {
    const activeFirstPageRequest = firstPageRequests.get(talkerId)
    if (activeFirstPageRequest)
      await activeFirstPageRequest
    if (!isCurrentAccountState(mid, requestAccountGeneration, state))
      return false

    for (const delayMs of [0, ...PRIVATE_TEXT_SEND_HISTORY_RETRY_DELAYS_MS]) {
      if (delayMs > 0)
        await waitForTextSendHistory(delayMs)
      if (!isCurrentAccountState(mid, requestAccountGeneration, state))
        return false

      await requestFirstPage(talkerId, state.loaded ? 'merge' : 'replace')
      if (!isCurrentAccountState(mid, requestAccountGeneration, state))
        return false
      if (!state.items.some(item => item.localId === localId))
        return true
    }
    return false
  }

  function executeSend(
    talkerId: string,
    localId: string,
  ): Promise<boolean> {
    const activeRequest = sendRequests.get(talkerId)
    if (activeRequest)
      return activeRequest

    const mid = currentMid.value
    const state = states.get(talkerId)
    const optimistic = state?.items.find(item => item.localId === localId)
    const text = optimistic ? getPrivateMessageText(optimistic) : ''
    const csrf = dependencies.getCsrf().trim()
    if (!mid || !state || !optimistic || !text.trim() || !csrf || !dependencies.sendMessage)
      return Promise.resolve(false)

    const requestAccountGeneration = accountGeneration
    optimistic.sendState = 'pending'
    optimistic.serverMsgKey = undefined
    state.lastTextSendOutcome = null
    state.lastTextSendDiagnostic = null
    state.sending = true
    let failureDiagnostic: PrivateTextSendDiagnostic | null = null

    const request = (async () => {
      const response = await dependencies.sendMessage!({
        csrf,
        senderId: mid,
        talkerId,
        text,
      })
      if (asResponse(response)?.code !== 0) {
        failureDiagnostic = createTextSendDiagnostic(response)
        throw new Error('private message send failed')
      }
      if (!isCurrentAccountState(mid, requestAccountGeneration, state))
        return false

      const currentOptimistic = state.items.find(item => item.localId === localId)
      if (!currentOptimistic)
        return false
      currentOptimistic.sendState = 'reconciling'
      currentOptimistic.serverMsgKey = extractSentMessageKey(response) || undefined

      const confirmed = await pullLatestAfterSend(
        talkerId,
        localId,
        mid,
        requestAccountGeneration,
        state,
      )
      if (!isCurrentAccountState(mid, requestAccountGeneration, state))
        return false
      if (!confirmed) {
        const unconfirmed = state.items.find(item => item.localId === localId)
        if (unconfirmed)
          unconfirmed.sendState = 'accepted-but-unconfirmed'
        state.lastTextSendOutcome = currentOptimistic.serverMsgKey
          ? 'protocol-mismatch'
          : 'accepted-but-unconfirmed'
        return false
      }

      state.lastTextSendOutcome = 'confirmed'
      dependencies.markSessionSent?.(talkerId, text, currentOptimistic.timestamp)
      await dependencies.refreshSessions?.().catch(() => {})
      return true
    })().catch(() => {
      if (isCurrentAccountState(mid, requestAccountGeneration, state)) {
        const currentOptimistic = state.items.find(item => item.localId === localId)
        if (currentOptimistic)
          currentOptimistic.sendState = 'failed'
        if (!state.draft)
          state.draft = text
        state.lastTextSendOutcome = 'failed'
        state.lastTextSendDiagnostic = failureDiagnostic ?? createTextSendDiagnostic(null)
      }
      return false
    }).finally(() => {
      if (isCurrentAccountState(mid, requestAccountGeneration, state))
        state.sending = false
      if (sendRequests.get(talkerId) === request)
        sendRequests.delete(talkerId)
    })

    sendRequests.set(talkerId, request)
    return request
  }

  function sendDraft(talkerId: string): Promise<boolean> {
    const activeRequest = sendRequests.get(talkerId)
    if (activeRequest)
      return activeRequest

    const mid = currentMid.value
    const state = getState(talkerId)
    const text = state.draft
    const csrf = dependencies.getCsrf().trim()
    if (
      !mid
      || activeTalkerId.value !== talkerId
      || !text.trim()
      || !csrf
      || !dependencies.sendMessage
    ) {
      return Promise.resolve(false)
    }

    let optimistic: DisplayPrivateMessage
    try {
      optimistic = createOptimisticPrivateTextMessage({
        localId: createLocalId(),
        receiverId: talkerId,
        senderId: mid,
        text,
        timestamp: nowSeconds(),
      })
    }
    catch {
      return Promise.resolve(false)
    }

    state.items = mergePrivateMessages(state.items, [optimistic])
    state.draft = ''
    return executeSend(talkerId, optimistic.localId!)
  }

  function retrySend(talkerId: string, localId: string): Promise<boolean> {
    const activeRequest = sendRequests.get(talkerId)
    if (activeRequest)
      return activeRequest
    const state = states.get(talkerId)
    const message = state?.items.find(item => item.localId === localId)
    if (!message || message.sendState !== 'failed')
      return Promise.resolve(false)
    return executeSend(talkerId, localId)
  }

  function editFailed(talkerId: string, localId: string) {
    const state = states.get(talkerId)
    const message = state?.items.find(item => item.localId === localId)
    if (!state || !message || message.sendState !== 'failed')
      return
    state.draft = getPrivateMessageText(message)
    state.items = state.items.filter(item => item.localId !== localId)
  }

  function deleteFailed(talkerId: string, localId: string) {
    const state = states.get(talkerId)
    const message = state?.items.find(item => item.localId === localId)
    if (!state || !message || message.sendState !== 'failed')
      return
    state.items = state.items.filter(item => item.localId !== localId)
  }

  function executeImageSend(talkerId: string, localId: string): Promise<boolean> {
    const activeRequest = imageRequests.get(talkerId)
    if (activeRequest)
      return activeRequest
    if (sendRequests.has(talkerId))
      return Promise.resolve(false)

    const mid = currentMid.value
    const state = states.get(talkerId)
    const task = imageTasks.get(localId)
    const csrf = dependencies.getCsrf().trim()
    const uploadImage = dependencies.uploadImage
    const sendImageMessage = dependencies.sendImageMessage
    if (
      disposed
      || !mid
      || !state
      || !task
      || activeTalkerId.value !== talkerId
      || !csrf
      || !uploadImage
      || !sendImageMessage
    ) {
      return Promise.resolve(false)
    }

    const requestAccountGeneration = accountGeneration
    const conversationGeneration = state.generation
    const isCurrent = () => (
      !disposed
      && activeTalkerId.value === talkerId
      && isCurrentRequest(mid, requestAccountGeneration, state, conversationGeneration)
      && imageTasks.get(localId) === task
    )
    state.sending = true

    const request = (async () => {
      let failedKind: PrivateImageFailureKind = task.failureKind ?? 'upload-failed'
      try {
        if (task.failureKind !== 'reconcile-failed') {
          if (!task.bytes) {
            updateImageState(state, task, 'preparing')
            task.bytes = await readFileBytes(task.file)
            if (!isCurrent())
              return false
          }

          if (!task.uploaded) {
            failedKind = 'upload-failed'
            updateImageState(state, task, 'uploading')
            const requestId = createUploadRequestId()
            task.uploadRequestId = requestId
            const uploadResponse = await uploadImage({
              bytes: task.bytes,
              csrf,
              fileName: task.file.name,
              mimeType: task.file.type,
              requestId,
            })
            if (task.uploadRequestId === requestId)
              task.uploadRequestId = undefined
            if (!isCurrent())
              return false
            const uploaded = extractUploadedImage(uploadResponse)
            if (!uploaded)
              throw new Error('upload failed')
            task.uploaded = uploaded
          }

          failedKind = 'send-failed'
          updateImageState(state, task, 'sending')
          const sendResponse = await sendImageMessage({
            csrf,
            senderId: mid,
            talkerId,
            uploaded: task.uploaded,
          })
          if (asResponse(sendResponse)?.code !== 0)
            throw new Error('send failed')
          if (!isCurrent())
            return false

          const optimistic = state.items.find(item => item.localId === localId)
          if (!optimistic)
            return false
          optimistic.serverMsgKey = extractSentMessageKey(sendResponse) || undefined
          dependencies.markSessionSent?.(
            talkerId,
            dependencies.getImageSummary?.() ?? '[image]',
            optimistic.timestamp,
          )
          void dependencies.refreshSessions?.().catch(() => {})
        }

        failedKind = 'reconcile-failed'
        updateImageState(state, task, 'reconciling')
        await requestFirstPage(talkerId, state.loaded ? 'merge' : 'replace')
        if (!isCurrent())
          return false
        if (state.items.some(item => item.localId === localId))
          throw new Error('reconcile failed')

        releaseImageTask(task, false)
        return true
      }
      catch {
        if (isCurrent())
          updateImageState(state, task, 'failed', failedKind)
        return false
      }
      finally {
        if (isCurrentAccountState(mid, requestAccountGeneration, state))
          state.sending = false
      }
    })().finally(() => {
      if (imageRequests.get(talkerId) === request)
        imageRequests.delete(talkerId)
    })

    imageRequests.set(talkerId, request)
    return request
  }

  function sendImage(talkerId: string, file: File): Promise<boolean> {
    if (
      disposed
      || !currentMid.value
      || activeTalkerId.value !== talkerId
      || !file.type.startsWith('image/')
      || imageRequests.has(talkerId)
      || sendRequests.has(talkerId)
      || !dependencies.uploadImage
      || !dependencies.sendImageMessage
    ) {
      return Promise.resolve(false)
    }

    const state = getState(talkerId)
    if (state.imageDraft)
      return Promise.resolve(false)

    let objectUrl = ''
    try {
      const localId = createLocalId()
      objectUrl = createObjectUrl(file)
      const optimistic = createOptimisticPrivateImageMessage({
        localId,
        objectUrl,
        receiverId: talkerId,
        senderId: currentMid.value,
        timestamp: nowSeconds(),
      })
      const task: PrivateImageTask = {
        failureKind: null,
        file,
        localId,
        objectUrl,
        talkerId,
      }
      imageTasks.set(localId, task)
      state.items = mergePrivateMessages(state.items, [optimistic])
      state.imageDraft = {
        failureKind: null,
        fileName: file.name,
        localId,
        objectUrl,
        size: file.size,
        status: 'preparing',
      }
      return executeImageSend(talkerId, localId)
    }
    catch {
      if (objectUrl)
        revokeObjectUrl(objectUrl)
      return Promise.resolve(false)
    }
  }

  function retryImage(talkerId: string, localId: string): Promise<boolean> {
    const task = imageTasks.get(localId)
    const state = states.get(talkerId)
    if (
      !task
      || task.talkerId !== talkerId
      || !task.failureKind
      || state?.imageDraft?.localId !== localId
      || state.imageDraft.status !== 'failed'
    ) {
      return Promise.resolve(false)
    }
    return executeImageSend(talkerId, localId)
  }

  function removeImage(talkerId: string, localId: string) {
    const task = imageTasks.get(localId)
    if (!task || task.talkerId !== talkerId)
      return
    releaseImageTask(task, true)
  }

  function invalidateConversation(talkerId: string) {
    const state = states.get(talkerId)
    if (!state)
      return
    state.generation++
    state.loading = false
    state.loadingOlder = false
    state.refreshing = false
    state.failedOperation = null
    cancelConversationImages(talkerId)
    firstPageRequests.delete(talkerId)
    olderRequests.delete(talkerId)
  }

  watch(currentMid, () => {
    for (const task of [...imageTasks.values()])
      releaseImageTask(task, true)
    accountGeneration++
    states.clear()
    firstPageRequests.clear()
    olderRequests.clear()
    ackRequests.clear()
    sendRequests.clear()
    imageRequests.clear()
  }, { flush: 'sync' })

  watch(activeTalkerId, (nextTalkerId, previousTalkerId) => {
    if (previousTalkerId && previousTalkerId !== nextTalkerId)
      invalidateConversation(previousTalkerId)
  }, { flush: 'sync' })

  function dispose() {
    if (disposed)
      return
    disposed = true
    accountGeneration++
    for (const task of [...imageTasks.values()])
      releaseImageTask(task, true)
    imageRequests.clear()
  }

  return {
    states,
    getState,
    loadInitial,
    loadOlder,
    refreshLatest,
    updateViewport,
    acknowledgeIfEligible,
    setDraft,
    sendDraft,
    retrySend,
    sendImage,
    retryImage,
    removeImage,
    editFailed,
    deleteFailed,
    invalidateConversation,
    dispose,
  }
}
