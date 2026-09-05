import type { PrivateMessageTransportErrorKind, UploadedPrivateImage } from '~/background/privateMessage/types'

import type { DisplayPrivateMessage as ServerPrivateMessage } from '../privateMessage'
import type { DisplayPrivateMessage } from './privateMessageTransactions'

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

export interface PrivateImageDraftState {
  failureKind: PrivateImageFailureKind | null
  fileName: string
  localId: string
  objectUrl: string
  size: number
  status: 'ready' | 'preparing' | 'uploading' | 'sending' | 'reconciling' | 'failed'
}

export interface PrivateConversationWriteState {
  talkerId: string
  items: DisplayPrivateMessage[]
  generation: number
  draft: string
  sending: boolean
  imageDraft: PrivateImageDraftState | null
  lastTextSendOutcome: PrivateTextSendOutcome
  lastTextSendDiagnostic: PrivateTextSendDiagnostic | null
  lastAccessedAt: number
}

export interface PrivateMessageWritesDependencies {
  getMaxCachedConversations?: () => number
  refreshHistory: (talkerId: string) => Promise<void>
  getCsrf: () => string
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

export interface PrivateMessageWritesController {
  states: Map<string, PrivateConversationWriteState>
  getState: (talkerId: string) => PrivateConversationWriteState
  reconcileHistory: (talkerId: string, incoming: ServerPrivateMessage[]) => void
  setDraft: (talkerId: string, text: string) => void
  sendDraft: (talkerId: string) => Promise<boolean>
  retrySend: (talkerId: string, localId: string) => Promise<boolean>
  selectImage: (talkerId: string, file: File) => boolean
  sendImage: (talkerId: string) => Promise<boolean>
  retryImage: (talkerId: string, localId: string) => Promise<boolean>
  removeImage: (talkerId: string, localId: string) => void
  releaseImages: (talkerId?: string) => void
  editFailed: (talkerId: string, localId: string) => void
  deleteFailed: (talkerId: string, localId: string) => void
  invalidateConversation: (talkerId: string) => void
  enforceCacheLimits: () => void
  release: () => void
  dispose: () => void
}
