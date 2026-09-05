/**
 * Private-message write controller for confirmed text and image Composer transactions.
 */
import type { Ref } from 'vue'
import { reactive, watch } from 'vue'

import type {
  UploadedPrivateImage,
} from '~/background/privateMessage/types'

import type { DisplayPrivateMessage as ServerPrivateMessage } from '../privateMessage'
import { asResponse } from '../privateMessageResponse'
import type { DisplayPrivateMessage } from './privateMessageTransactions'
import {
  createOptimisticPrivateImageMessage,
  createOptimisticPrivateTextMessage,
  getPrivateMessageText,
  mergePrivateMessages,
  reconcileOptimisticPrivateMessages,
} from './privateMessageTransactions'
import { createTextSendDiagnostic, extractSentMessageKey, extractUploadedImage } from './privateMessageWriteResponse'
import type { PrivateConversationWriteState, PrivateImageDraftState, PrivateImageFailureKind, PrivateMessageWritesController, PrivateMessageWritesDependencies, PrivateTextSendDiagnostic } from './privateMessageWriteTypes'

export const PRIVATE_TEXT_SEND_HISTORY_RETRY_DELAYS_MS = [250, 750, 1500] as const

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

function createConversationState(talkerId: string): PrivateConversationWriteState {
  return reactive({
    talkerId,
    items: [],
    generation: 0,
    draft: '',
    sending: false,
    imageDraft: null,
    lastTextSendOutcome: null,
    lastTextSendDiagnostic: null,
    lastAccessedAt: 0,
  })
}

export function useExperimentalPrivateMessageWrites(
  currentMid: Ref<string>,
  activeTalkerId: Ref<string>,
  dependencies: PrivateMessageWritesDependencies,
): PrivateMessageWritesController {
  const states = reactive(new Map<string, PrivateConversationWriteState>())
  const sendRequests = new Map<string, Promise<boolean>>()
  const imageRequests = new Map<string, Promise<boolean>>()
  const imageTasks = new Map<string, PrivateImageTask>()
  let accountGeneration = 0
  let disposed = false
  let accessOrder = 0

  function evictCachedConversations(protectedTalkerId?: string) {
    const limit = Math.max(1, Math.trunc(dependencies.getMaxCachedConversations?.() ?? 8))
    while (states.size > limit) {
      const candidate = [...states.values()]
        .filter(state => state.talkerId !== activeTalkerId.value
          && state.talkerId !== protectedTalkerId
          && !sendRequests.has(state.talkerId)
          && !imageRequests.has(state.talkerId)
          && !state.draft && !state.imageDraft
          && !state.items.some(item => item.localId))
        .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt)[0]
      if (!candidate)
        return
      invalidateConversation(candidate.talkerId)
      candidate.items = []
      states.delete(candidate.talkerId)
    }
  }

  function enforceCacheLimits() {
    evictCachedConversations()
  }

  function getState(talkerId: string): PrivateConversationWriteState {
    if (disposed)
      return createConversationState(talkerId)
    let state = states.get(talkerId)
    if (!state) {
      state = createConversationState(talkerId)
      states.set(talkerId, state)
    }
    state.lastAccessedAt = ++accessOrder
    evictCachedConversations(talkerId)
    return state
  }

  function isCurrentRequest(
    mid: string,
    requestAccountGeneration: number,
    state: PrivateConversationWriteState,
    conversationGeneration: number,
  ): boolean {
    return (
      !disposed && mid === currentMid.value
      && requestAccountGeneration === accountGeneration
      && conversationGeneration === state.generation
      && states.get(state.talkerId) === state
    )
  }

  function isCurrentAccountState(
    mid: string,
    requestAccountGeneration: number,
    state: PrivateConversationWriteState,
  ): boolean {
    return (
      !disposed && mid === currentMid.value
      && requestAccountGeneration === accountGeneration
      && states.get(state.talkerId) === state
    )
  }

  function reconcileHistory(talkerId: string, incoming: ServerPrivateMessage[]) {
    const state = states.get(talkerId)
    if (!state || disposed || state.items.length === 0)
      return
    let candidates = mergePrivateMessages(incoming, state.items)
    for (const item of state.items) {
      if (!item.localId || (item.sendState !== 'reconciling' && item.sendState !== 'accepted-but-unconfirmed'))
        continue
      const result = reconcileOptimisticPrivateMessages(candidates, item.localId)
      candidates = result.items
      if (result.reconciled)
        state.lastTextSendOutcome = 'confirmed'
    }
    // Confirmed history belongs to the reader. The writer only retains user work.
    state.items = candidates.filter(item => item.localId)
  }

  function setDraft(talkerId: string, text: string) {
    getState(talkerId).draft = text
    evictCachedConversations()
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
    state: PrivateConversationWriteState,
    task: PrivateImageTask,
    status: PrivateImageDraftState['status'],
    failureKind: PrivateImageFailureKind | null = null,
  ) {
    const message = state.items.find(item => item.localId === task.localId)
    if (message && status !== 'ready')
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
    const state = states.get(talkerId)
    if (state && !sendRequests.has(talkerId))
      state.sending = false
  }

  function releaseImages(talkerId?: string) {
    if (talkerId) {
      cancelConversationImages(talkerId)
      return
    }
    for (const task of [...imageTasks.values()])
      releaseImageTask(task, true)
    imageRequests.clear()
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
    state: PrivateConversationWriteState,
  ): Promise<boolean> {
    if (!isCurrentAccountState(mid, requestAccountGeneration, state))
      return false

    for (const delayMs of [0, ...PRIVATE_TEXT_SEND_HISTORY_RETRY_DELAYS_MS]) {
      if (delayMs > 0)
        await waitForTextSendHistory(delayMs)
      if (!isCurrentAccountState(mid, requestAccountGeneration, state))
        return false

      await dependencies.refreshHistory(talkerId)
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
      if (sendRequests.get(talkerId) === request) {
        sendRequests.delete(talkerId)
        evictCachedConversations()
      }
    })

    sendRequests.set(talkerId, request)
    return request
  }

  function sendDraft(talkerId: string): Promise<boolean> {
    if (disposed)
      return Promise.resolve(false)
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
    evictCachedConversations()
  }

  function deleteFailed(talkerId: string, localId: string) {
    const state = states.get(talkerId)
    const message = state?.items.find(item => item.localId === localId)
    if (!state || !message || message.sendState !== 'failed')
      return
    state.items = state.items.filter(item => item.localId !== localId)
    evictCachedConversations()
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
            const optimistic = state.items.find(item => item.localId === localId)
            if (optimistic)
              optimistic.serverMediaUrl = uploaded.url
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
        }

        failedKind = 'reconcile-failed'
        updateImageState(state, task, 'reconciling')
        await dependencies.refreshHistory(talkerId)
        if (!isCurrent())
          return false
        if (state.items.some(item => item.localId === localId))
          throw new Error('reconcile failed')

        await dependencies.refreshSessions?.().catch(() => {})
        if (!isCurrent())
          return false
        releaseImageTask(task, false)
        return true
      }
      catch {
        if (isCurrent())
          updateImageState(state, task, 'failed', failedKind)
        return false
      }
    })().finally(() => {
      if (imageRequests.get(talkerId) === request) {
        if (isCurrentAccountState(mid, requestAccountGeneration, state))
          state.sending = false
        imageRequests.delete(talkerId)
        evictCachedConversations()
      }
    })

    imageRequests.set(talkerId, request)
    return request
  }

  function selectImage(talkerId: string, file: File): boolean {
    if (
      disposed
      || !currentMid.value
      || activeTalkerId.value !== talkerId
      || !file.type.startsWith('image/')
      || file.size <= 0
      || imageRequests.has(talkerId)
      || sendRequests.has(talkerId)
      || !dependencies.uploadImage
      || !dependencies.sendImageMessage
    ) {
      return false
    }

    const state = getState(talkerId)
    if (state.imageDraft)
      return false

    let objectUrl = ''
    try {
      const localId = createLocalId()
      objectUrl = createObjectUrl(file)
      imageTasks.set(localId, {
        failureKind: null,
        file,
        localId,
        objectUrl,
        talkerId,
      })
      state.imageDraft = {
        failureKind: null,
        fileName: file.name,
        localId,
        objectUrl,
        size: file.size,
        status: 'ready',
      }
      return true
    }
    catch {
      if (objectUrl)
        revokeObjectUrl(objectUrl)
      return false
    }
  }

  function sendImage(talkerId: string): Promise<boolean> {
    if (imageRequests.has(talkerId) || sendRequests.has(talkerId))
      return Promise.resolve(false)
    const state = states.get(talkerId)
    const draft = state?.imageDraft
    const task = draft ? imageTasks.get(draft.localId) : undefined
    if (
      disposed
      || !state
      || !draft
      || draft.status !== 'ready'
      || !task
      || task.talkerId !== talkerId
      || activeTalkerId.value !== talkerId
      || !currentMid.value
      || !dependencies.getCsrf().trim()
      || !dependencies.uploadImage
      || !dependencies.sendImageMessage
    ) {
      return Promise.resolve(false)
    }

    try {
      const optimistic = createOptimisticPrivateImageMessage({
        localId: task.localId,
        objectUrl: task.objectUrl,
        receiverId: talkerId,
        senderId: currentMid.value,
        timestamp: nowSeconds(),
      })
      state.items = mergePrivateMessages(state.items, [optimistic])
      return executeImageSend(talkerId, task.localId)
    }
    catch {
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
    cancelConversationImages(talkerId)
  }

  function release() {
    accountGeneration++
    for (const task of [...imageTasks.values()])
      releaseImageTask(task, true)
    for (const state of states.values()) {
      state.generation++
      state.items = []
      state.draft = ''
      state.sending = false
    }
    states.clear()
    sendRequests.clear()
    imageRequests.clear()
  }

  watch(currentMid, release, { flush: 'sync' })

  watch(activeTalkerId, (nextTalkerId, previousTalkerId) => {
    if (previousTalkerId && previousTalkerId !== nextTalkerId)
      invalidateConversation(previousTalkerId)
    evictCachedConversations()
  }, { flush: 'sync' })

  function dispose() {
    if (disposed)
      return
    disposed = true
    release()
  }

  return {
    states,
    getState,
    reconcileHistory,
    setDraft,
    sendDraft,
    retrySend,
    selectImage,
    sendImage,
    retryImage,
    removeImage,
    releaseImages,
    editFailed,
    deleteFailed,
    invalidateConversation,
    enforceCacheLimits,
    release,
    dispose,
  }
}
