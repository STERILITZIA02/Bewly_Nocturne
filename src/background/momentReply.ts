import browser from 'webextension-polyfill'

import type { MomentReplyDraft } from '~/utils/momentReply'
import { buildMomentReplyForm, isMomentReplyImage } from '~/utils/momentReply'

import { addWbiSign, initWbiKeys } from './wbiSign'

interface ReplyIdentity { accountId: string, csrf: string }
type ReplyRequest = ReplyIdentity & MomentReplyDraft
interface ImageRequest extends ReplyIdentity { base64: string, mimeType: string, fileName: string }
interface DeleteRequest extends ReplyIdentity { oid: string, type: number, rpid: string }

export async function ownsAccount(identity: ReplyIdentity) {
  const cookies = await browser.cookies.getAll({ url: 'https://www.bilibili.com/' })
  return Boolean(identity.accountId && identity.csrf
    && cookies.find(cookie => cookie.name === 'DedeUserID')?.value === identity.accountId
    && cookies.find(cookie => cookie.name === 'bili_jct')?.value === identity.csrf)
}

const failed = (uncertain = false) => ({ code: -1, message: '', bewlyReplyUncertain: uncertain })

export async function submitMomentReply(request: Partial<ReplyRequest> & { contentScriptQuery?: string } = {}) {
  let dispatched = false
  try {
    const identity = { accountId: request.accountId ?? '', csrf: request.csrf ?? '' }
    const body = buildMomentReplyForm({ oid: request.oid ?? '', type: request.type ?? 0, message: request.message ?? '', root: request.root, parent: request.parent, mentions: request.mentions ?? {}, pictures: request.pictures ?? [], syncToDynamic: request.syncToDynamic === true }, identity.csrf)
    if (!await ownsAccount(identity))
      return { code: -101, message: '' }
    const options = { mid: identity.accountId }
    if (!await initWbiKeys(options))
      return failed()
    const query = addWbiSign({}, options)
    if (!query.w_rid || !await ownsAccount(identity))
      return failed()
    const url = new URL('https://api.bilibili.com/x/v2/reply/add')
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, String(value))
    dispatched = true
    // A public write is never retried automatically after an ambiguous outcome.
    const response = await fetch(url, { method: 'POST', credentials: 'include', body, signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'Referer': 'https://t.bilibili.com/' } })
    if (!response.ok)
      return failed(true)
    const result = await response.json()
    return typeof result?.code === 'number' ? result : failed(true)
  }
  catch { return failed(dispatched) }
}

export async function uploadMomentReplyImage(request: Partial<ImageRequest> & { contentScriptQuery?: string } = {}) {
  try {
    const identity = { accountId: request.accountId ?? '', csrf: request.csrf ?? '' }
    const mimeType = request.mimeType ?? ''
    if (typeof request.base64 !== 'string' || request.base64.length > 28 * 1024 * 1024 || !await ownsAccount(identity))
      return failed()
    const binary = atob(request.base64)
    if (!isMomentReplyImage({ type: mimeType, size: binary.length }))
      return failed()
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    const body = new FormData()
    body.set('file_up', new Blob([bytes], { type: mimeType }), request.fileName ?? 'comment.png')
    body.set('biz', 'new_dyn')
    body.set('category', 'daily')
    body.set('csrf', identity.csrf)
    if (!await ownsAccount(identity))
      return failed()
    const response = await fetch('https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs', { method: 'POST', credentials: 'include', body, signal: AbortSignal.timeout(30000), headers: { Referer: 'https://t.bilibili.com/' } })
    if (!response.ok)
      return failed()
    return await response.json()
  }
  catch { return failed() }
}

const COMMENT_ID_PATTERN = /^[1-9]\d*$/
const DELETED_COMMENT_CODES = new Set([12022])

export async function deleteMomentReply(request: Partial<DeleteRequest> & { contentScriptQuery?: string } = {}) {
  let dispatched = false
  try {
    const identity = { accountId: request.accountId ?? '', csrf: request.csrf ?? '' }
    const oid = String(request.oid ?? '')
    const rpid = String(request.rpid ?? '')
    const type = Number(request.type)
    if (!COMMENT_ID_PATTERN.test(oid) || !COMMENT_ID_PATTERN.test(rpid) || !Number.isSafeInteger(type) || type <= 0)
      return failed()
    if (!await ownsAccount(identity))
      return { code: -101, message: '' }
    const body = new URLSearchParams({ oid, type: String(type), rpid, csrf: identity.csrf })
    dispatched = true
    const response = await fetch('https://api.bilibili.com/x/v2/reply/del', { method: 'POST', credentials: 'include', body, signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'Referer': 'https://t.bilibili.com/' } })
    if (!response.ok)
      return failed(true)
    const result = await response.json()
    if (typeof result?.code !== 'number')
      return failed(true)
    return DELETED_COMMENT_CODES.has(result.code) ? { ...result, code: 0, bewlyReplyAlreadyDeleted: true } : result
  }
  catch { return failed(dispatched) }
}
