export const BILIBILI_LOGIN_INVALID_CODES = [-101, -658] as const
export const BILIBILI_RISK_CONTROL_CODES = [-352, -412, -509, -799] as const

function normalizeCode(code: unknown): number | undefined {
  if (typeof code === 'number' && Number.isFinite(code))
    return code

  if (typeof code === 'string' && code.trim()) {
    const parsedCode = Number(code)
    if (Number.isFinite(parsedCode))
      return parsedCode
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasRiskVoucher(value: unknown): boolean {
  if (!isRecord(value))
    return false

  const voucher = value.v_voucher
  return typeof voucher === 'string' ? voucher.trim().length > 0 : Boolean(voucher)
}

export function isBilibiliLoginInvalidCode(code: unknown): boolean {
  const normalizedCode = normalizeCode(code)
  return normalizedCode !== undefined
    && BILIBILI_LOGIN_INVALID_CODES.includes(normalizedCode as typeof BILIBILI_LOGIN_INVALID_CODES[number])
}

export function isBilibiliRiskControl(value: unknown): boolean {
  if (!isRecord(value))
    return false

  if (value.isRiskControl === true || value.name === 'ApiRiskControlError')
    return true

  const code = normalizeCode(value.code)
  if (code !== undefined && BILIBILI_RISK_CONTROL_CODES.includes(code as typeof BILIBILI_RISK_CONTROL_CODES[number]))
    return true

  return hasRiskVoucher(value.data)
}
