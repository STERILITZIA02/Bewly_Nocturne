import { ownsAccount } from './momentReply'

interface OperationIdentity { accountId: string, csrf: string }
interface RemoveRequest extends OperationIdentity { momentId: string, params: { dyn_id_str: string, dyn_type: number, rid_str: string } }
interface ReportRequest extends OperationIdentity { momentId: string, accusedMid: string, reasonType: number, reasonDesc: string }

const MOMENT_ID_PATTERN = /^[1-9]\d*$/
const REPORT_REASON_TYPES = new Set([0, 1, 3, 4, 5, 8, 9, 10, 12, 13])
const REPORT_DESC_LIMIT = 60
const failed = (uncertain = false) => ({ code: -1, message: '', bewlyOperationUncertain: uncertain })

async function postJson(url: URL, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', 'Referer': 'https://t.bilibili.com/' },
  })
  if (!response.ok)
    return failed(true)
  const result = await response.json()
  return typeof result?.code === 'number' ? result : failed(true)
}

export async function removeMoment(request: Partial<RemoveRequest> & { contentScriptQuery?: string } = {}) {
  let dispatched = false
  try {
    const identity = { accountId: request.accountId ?? '', csrf: request.csrf ?? '' }
    const momentId = String(request.momentId ?? '')
    const params = request.params
    if (!MOMENT_ID_PATTERN.test(momentId) || !params || params.dyn_id_str !== momentId
      || !Number.isSafeInteger(params.dyn_type) || params.dyn_type <= 0 || !/^\d+$/.test(String(params.rid_str))) {
      return failed()
    }
    if (!await ownsAccount(identity))
      return { code: -101, message: '' }
    const url = new URL('https://api.bilibili.com/x/dynamic/feed/operate/remove')
    url.searchParams.set('platform', 'web')
    url.searchParams.set('csrf', identity.csrf)
    dispatched = true
    return await postJson(url, { dyn_id_str: momentId, dyn_type: params.dyn_type, rid_str: String(params.rid_str) })
  }
  catch { return failed(dispatched) }
}

export async function reportMoment(request: Partial<ReportRequest> & { contentScriptQuery?: string } = {}) {
  let dispatched = false
  try {
    const identity = { accountId: request.accountId ?? '', csrf: request.csrf ?? '' }
    const momentId = String(request.momentId ?? '')
    const accusedMid = String(request.accusedMid ?? '')
    const reasonType = Number(request.reasonType)
    const reasonDesc = String(request.reasonDesc ?? '').trim()
    if (!MOMENT_ID_PATTERN.test(momentId) || !MOMENT_ID_PATTERN.test(accusedMid) || !Number.isSafeInteger(Number(accusedMid)) || !REPORT_REASON_TYPES.has(reasonType)
      || (reasonType === 0 && !reasonDesc) || [...reasonDesc].length > REPORT_DESC_LIMIT || accusedMid === identity.accountId) {
      return failed()
    }
    if (!await ownsAccount(identity))
      return { code: -101, message: '' }
    const url = new URL('https://api.bilibili.com/x/dynamic/feed/dynamic_report/add')
    url.searchParams.set('csrf', identity.csrf)
    dispatched = true
    return await postJson(url, {
      accused_uid: Number(accusedMid),
      dynamic_id: momentId,
      reason_type: reasonType,
      reason_desc: reasonType === 0 ? reasonDesc : null,
    })
  }
  catch { return failed(dispatched) }
}
