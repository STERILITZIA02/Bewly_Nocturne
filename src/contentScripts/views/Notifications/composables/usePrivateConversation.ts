import type { Ref } from 'vue'
import { nextTick, onBeforeUnmount, ref } from 'vue'

import api from '~/utils/api'
import { getCSRF } from '~/utils/main'

import { ensureBilibiliApiSuccess } from '../notificationApi'
import { dedupeDisplayMessages, toStringId, transformMessagePage } from '../notificationTransforms'
import { validatePrivateMessageImage } from '../privateMessageImage'
import type { ComposerImageUpload, DisplayConversation, DisplayMessage } from '../types'

const ACTIVE_CONVERSATION_SYNC_INTERVAL_MS = 10_000

function sortMessages(messages: DisplayMessage[]): DisplayMessage[] {
  return [...messages].sort((left, right) => {
    if (left.timestamp !== right.timestamp)
      return left.timestamp - right.timestamp
    if (left.seqno.length !== right.seqno.length)
      return left.seqno.length - right.seqno.length
    return left.seqno.localeCompare(right.seqno)
  })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}

function createLocalMessage(
  accountId: string,
  conversation: DisplayConversation,
  messageType: number,
  content: string,
): DisplayMessage {
  const parsedContent = JSON.parse(content) as Record<string, unknown>
  return {
    id: `local:${crypto.randomUUID()}`,
    seqno: '',
    senderId: accountId,
    receiverId: conversation.talkerId,
    timestamp: Math.floor(Date.now() / 1000),
    messageType,
    autoReply: false,
    outgoing: true,
    status: 'sending',
    content: messageType === 1
      ? { kind: 'text', text: String(parsedContent.content || '') }
      : {
          kind: 'image',
          url: String(parsedContent.url || ''),
          width: Number(parsedContent.width) || 0,
          height: Number(parsedContent.height) || 0,
          size: Number(parsedContent.size) || 0,
          imageType: String(parsedContent.imageType || ''),
          alt: '',
        },
  }
}

export function usePrivateConversation(accountId: Ref<string | null>) {
  const conversation = ref<DisplayConversation | null>(null)
  const messages = ref<DisplayMessage[]>([])
  const loading = ref(false)
  const loadingOlder = ref(false)
  const sending = ref(false)
  const uploading = ref(false)
  const noMore = ref(false)
  const error = ref('')
  const minSeqno = ref('')
  const maxSeqno = ref('')
  const generation = ref(0)
  const lastAcknowledgedSeqno = ref('')
  const drafts = new Map<string, string>()
  const retractingMessageIds = new Set<string>()
  let syncTimer: ReturnType<typeof setTimeout> | undefined
  let acknowledgement: Promise<boolean> | undefined
  let sendRun = 0
  let uploadRun = 0
  let syncEnabled = false
  let conversationAccountId: string | null = null

  function isCurrent(requestGeneration: number, account: string, conversationKey: string) {
    return generation.value === requestGeneration
      && accountId.value === account
      && conversationAccountId === account
      && conversation.value?.key === conversationKey
  }

  function stopSync() {
    syncEnabled = false
    if (syncTimer !== undefined)
      clearTimeout(syncTimer)
    syncTimer = undefined
  }

  function reset() {
    generation.value += 1
    sendRun += 1
    uploadRun += 1
    stopSync()
    conversation.value = null
    conversationAccountId = null
    messages.value = []
    loading.value = false
    loadingOlder.value = false
    sending.value = false
    uploading.value = false
    noMore.value = false
    error.value = ''
    minSeqno.value = ''
    maxSeqno.value = ''
    lastAcknowledgedSeqno.value = ''
    acknowledgement = undefined
    drafts.clear()
    retractingMessageIds.clear()
  }

  async function requestHistory(loadOlder: boolean) {
    const account = accountId.value
    const current = conversation.value
    if (!account || !current || conversationAccountId !== account || loading.value || loadingOlder.value || (loadOlder && noMore.value))
      return
    const requestGeneration = generation.value
    const conversationKey = current.key
    if (loadOlder)
      loadingOlder.value = true
    else
      loading.value = true
    error.value = ''
    try {
      const response = await api.notification.getSessionHistory({
        size: 20,
        session_type: current.sessionType,
        talker_id: current.talkerId,
        end_seqno: loadOlder ? minSeqno.value : undefined,
      })
      if (!isCurrent(requestGeneration, account, conversationKey))
        return
      ensureBilibiliApiSuccess(response)
      const page = transformMessagePage(response, account)
      messages.value = sortMessages(dedupeDisplayMessages(
        loadOlder ? [...page.items, ...messages.value] : page.items,
      ))
      minSeqno.value = page.minSeqno || minSeqno.value
      maxSeqno.value = page.maxSeqno || maxSeqno.value
      noMore.value = !page.hasMore
    }
    catch (caught) {
      if (isCurrent(requestGeneration, account, conversationKey))
        error.value = caught instanceof Error ? caught.message : String(caught)
    }
    finally {
      if (isCurrent(requestGeneration, account, conversationKey)) {
        loading.value = false
        loadingOlder.value = false
      }
    }
  }

  async function select(nextConversation: DisplayConversation | null) {
    const nextAccount = nextConversation ? accountId.value : null
    if (conversation.value?.key === nextConversation?.key && conversationAccountId === nextAccount) {
      if (nextConversation && nextAccount && !document.hidden)
        startSync()
      return
    }
    generation.value += 1
    sendRun += 1
    uploadRun += 1
    stopSync()
    conversation.value = nextConversation
    conversationAccountId = nextAccount
    messages.value = []
    noMore.value = false
    error.value = ''
    minSeqno.value = ''
    maxSeqno.value = ''
    lastAcknowledgedSeqno.value = ''
    acknowledgement = undefined
    loading.value = false
    loadingOlder.value = false
    sending.value = false
    uploading.value = false
    if (nextConversation) {
      const selectionGeneration = generation.value
      await requestHistory(false)
      if (generation.value === selectionGeneration && conversation.value?.key === nextConversation.key)
        startSync()
    }
  }

  async function refresh() {
    if (!conversation.value || loading.value || loadingOlder.value)
      return
    generation.value += 1
    sendRun += 1
    uploadRun += 1
    sending.value = false
    uploading.value = false
    await requestHistory(false)
  }

  async function loadOlder() {
    await requestHistory(true)
  }

  async function syncCurrentConversation() {
    const account = accountId.value
    const current = conversation.value
    const requestGeneration = generation.value
    if (!account || !current || conversationAccountId !== account || document.hidden)
      return
    try {
      const response = await api.notification.getSessionHistory({
        size: 20,
        session_type: current.sessionType,
        talker_id: current.talkerId,
        begin_seqno: maxSeqno.value || undefined,
      })
      if (!isCurrent(requestGeneration, account, current.key))
        return
      ensureBilibiliApiSuccess(response)
      const page = transformMessagePage(response, account)
      messages.value = sortMessages(dedupeDisplayMessages([...messages.value, ...page.items]))
      minSeqno.value ||= page.minSeqno
      maxSeqno.value = page.maxSeqno || maxSeqno.value
    }
    catch {
      // Background refresh must not replace a usable conversation with an error panel.
    }
  }

  function scheduleSync() {
    if (!syncEnabled)
      return
    if (syncTimer !== undefined)
      clearTimeout(syncTimer)
    syncTimer = setTimeout(async () => {
      await syncCurrentConversation()
      if (syncEnabled && conversation.value && accountId.value)
        scheduleSync()
    }, ACTIVE_CONVERSATION_SYNC_INTERVAL_MS)
  }

  function startSync() {
    const account = accountId.value
    if (!account || !conversation.value || conversationAccountId !== account || document.hidden)
      return
    syncEnabled = true
    scheduleSync()
  }

  function getDraft(conversationKey: string) {
    return drafts.get(conversationKey) || ''
  }

  function setDraft(conversationKey: string, value: string) {
    if (value)
      drafts.set(conversationKey, value)
    else
      drafts.delete(conversationKey)
  }

  async function sendContent(messageType: number, content: string, existing?: DisplayMessage) {
    const account = accountId.value
    const current = conversation.value
    if (!account || !current || conversationAccountId !== account || sending.value)
      return
    const requestGeneration = generation.value
    const conversationKey = current.key
    const local = existing || createLocalMessage(account, current, messageType, content)
    const localId = local.id
    if (!existing)
      messages.value = [...messages.value, local]
    const patchLocalMessage = (patch: Partial<DisplayMessage>) => {
      const target = messages.value.find(message => message.id === localId)
      if (target)
        Object.assign(target, patch)
    }
    patchLocalMessage({ status: 'sending' })
    const currentSendRun = ++sendRun
    sending.value = true
    try {
      await nextTick()
      if (!isCurrent(requestGeneration, account, conversationKey))
        return
      const response = await api.notification.sendPrivateMessage({
        sender_uid: account,
        receiver_type: current.sessionType === '2' ? 2 : 1,
        receiver_id: current.talkerId,
        msg_type: messageType,
        content,
        new_face_version: 1,
        csrf: getCSRF(),
      })
      if (!isCurrent(requestGeneration, account, conversationKey))
        return
      const success = ensureBilibiliApiSuccess(response)
      patchLocalMessage({
        id: toStringId((success.data as Record<string, unknown> | undefined)?.msg_key) || localId,
        status: 'sent',
      })
    }
    catch (caught) {
      if (isCurrent(requestGeneration, account, conversationKey)) {
        patchLocalMessage({ status: 'failed' })
        error.value = caught instanceof Error ? caught.message : String(caught)
      }
    }
    finally {
      if (currentSendRun === sendRun)
        sending.value = false
    }
  }

  async function sendText(text: string) {
    const normalized = text.trim()
    if (!normalized)
      return
    await sendContent(1, JSON.stringify({ content: normalized }))
  }

  async function uploadImage(
    file: File,
    requestGeneration: number,
    account: string,
    conversationKey: string,
  ): Promise<ComposerImageUpload | null> {
    if (validatePrivateMessageImage(file))
      return null
    const dataUrl = await fileToDataUrl(file)
    if (!isCurrent(requestGeneration, account, conversationKey))
      return null
    const response = await api.notification.uploadPrivateMessageImage({
      dataUrl,
      fileName: file.name,
      mimeType: file.type,
      csrf: getCSRF(),
    })
    if (!isCurrent(requestGeneration, account, conversationKey))
      return null
    const success = ensureBilibiliApiSuccess<Record<string, unknown>>(response)
    const data = success.data || {}
    return {
      url: String(data.image_url || ''),
      width: Number(data.image_width) || 0,
      height: Number(data.image_height) || 0,
      size: Number(data.img_size) || file.size,
      imageType: file.type.split('/')[1] || 'image',
    }
  }

  async function sendImage(file: File) {
    if (uploading.value)
      return
    const account = accountId.value
    const current = conversation.value
    if (!account || !current || conversationAccountId !== account)
      return
    const requestGeneration = generation.value
    const conversationKey = current.key
    const currentUploadRun = ++uploadRun
    uploading.value = true
    try {
      const image = await uploadImage(file, requestGeneration, account, conversationKey)
      if (!image || !isCurrent(requestGeneration, account, conversationKey))
        return
      await sendContent(2, JSON.stringify({ ...image, original: 1 }))
    }
    catch (caught) {
      if (isCurrent(requestGeneration, account, conversationKey))
        error.value = caught instanceof Error ? caught.message : String(caught)
    }
    finally {
      if (currentUploadRun === uploadRun)
        uploading.value = false
    }
  }

  async function retry(message: DisplayMessage) {
    if (message.status !== 'failed')
      return
    if (message.content.kind === 'text') {
      await sendContent(1, JSON.stringify({ content: message.content.text }), message)
    }
    else if (message.content.kind === 'image') {
      await sendContent(2, JSON.stringify({
        url: message.content.url,
        width: message.content.width,
        height: message.content.height,
        size: message.content.size,
        imageType: message.content.imageType,
        original: 1,
      }), message)
    }
  }

  async function retract(message: DisplayMessage) {
    const account = accountId.value
    const current = conversation.value
    if (!account || !current || conversationAccountId !== account || !message.outgoing || message.status !== 'sent' || message.content.kind === 'withdrawn' || retractingMessageIds.has(message.id))
      return
    if (Date.now() / 1000 - message.timestamp > 120)
      return
    const requestGeneration = generation.value
    const conversationKey = current.key
    retractingMessageIds.add(message.id)
    try {
      const response = await api.notification.sendPrivateMessage({
        sender_uid: account,
        receiver_type: current.sessionType === '2' ? 2 : 1,
        receiver_id: current.talkerId,
        msg_type: 5,
        content: message.id,
        new_face_version: 1,
        canal_token: current.canalToken || undefined,
        csrf: getCSRF(),
      })
      ensureBilibiliApiSuccess(response)
      if (!isCurrent(requestGeneration, account, conversationKey))
        return
      message.messageType = 5
      message.content = { kind: 'withdrawn' }
    }
    finally {
      retractingMessageIds.delete(message.id)
    }
  }

  async function acknowledge(): Promise<boolean> {
    const account = accountId.value
    const current = conversation.value
    const seqno = maxSeqno.value
    if (!account || !current || conversationAccountId !== account || !seqno || document.hidden)
      return false
    if (seqno === lastAcknowledgedSeqno.value) {
      current.unreadCount = 0
      return true
    }
    if (acknowledgement)
      return await acknowledgement

    const requestGeneration = generation.value
    const key = current.key
    const request = (async () => {
      const response = await api.notification.updateSessionAck({
        talker_id: current.talkerId,
        session_type: current.sessionType,
        ack_seqno: seqno,
        csrf: getCSRF(),
      })
      ensureBilibiliApiSuccess(response)
      if (isCurrent(requestGeneration, account, key)) {
        lastAcknowledgedSeqno.value = seqno
        current.unreadCount = 0
        return true
      }
      return false
    })()
    acknowledgement = request
    try {
      return await request
    }
    finally {
      if (acknowledgement === request)
        acknowledgement = undefined
    }
  }

  onBeforeUnmount(stopSync)

  return {
    conversation,
    messages,
    loading,
    loadingOlder,
    sending,
    uploading,
    noMore,
    error,
    reset,
    select,
    refresh,
    loadOlder,
    startSync,
    stopSync,
    getDraft,
    setDraft,
    sendText,
    sendImage,
    retry,
    retract,
    acknowledge,
  }
}
