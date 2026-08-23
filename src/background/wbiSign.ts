import md5 from 'md5'

// WBI签名重排映射表
const MIXIN_KEY_ENC_TAB = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52]

export type WbiKeyScope = 'authenticated' | 'anonymous'

// WBI密钥缓存
interface WbiKeys {
  imgKey: string
  subKey: string
  timestamp: number
  scope: WbiKeyScope
  mid: string
}

export interface WbiKeyOptions {
  forceRefresh?: boolean
  mid?: string
  noCookie?: boolean
}

interface WbiCookie {
  name: string
  value: string
}

interface WbiStorageArea {
  get: (key: string) => Promise<Record<string, unknown>>
  set: (values: Record<string, unknown>) => Promise<void>
  remove: (key: string) => Promise<void>
}

export interface WbiRuntimeDependencies {
  fetch: typeof fetch
  getCookies: () => Promise<WbiCookie[]>
  now: () => number
  storage: WbiStorageArea
}

const BILIBILI_API_ORIGIN = 'https://api.bilibili.com'
const NAV_PATH = '/x/web-interface/nav'
const BILI_TICKET_PATH = '/x/web-interface/bili_ticket'
const FEEDBACK_DISLIKE_PATH = '/x/web-interface/feedback/dislike'
export const WBI_KEYS_TTL_MS = 24 * 60 * 60 * 1000
export const WBI_KEYS_STORAGE_KEYS: Record<WbiKeyScope, string> = {
  authenticated: 'wbiKeys.authenticated',
  anonymous: 'wbiKeys.anonymous',
}

/**
 * Parse an API URL only when it points at the exact Bilibili API origin.
 */
export function parseBilibiliApiUrl(url: string): URL | null {
  try {
    const parsedUrl = new URL(url)
    return parsedUrl.origin === BILIBILI_API_ORIGIN ? parsedUrl : null
  }
  catch {
    return null
  }
}

/**
 * Check whether a URL targets the nav endpoint (query parameters are allowed).
 */
export function isBilibiliNavUrl(url: string): boolean {
  return parseBilibiliApiUrl(url)?.pathname === NAV_PATH
}

// 登录态和匿名态的 nav 请求可能返回不同密钥，必须分别缓存。
let authenticatedWbiKeysCache: WbiKeys | null = null
let anonymousWbiKeysCache: WbiKeys | null = null
const invalidatedPersistentScopes = new Set<WbiKeyScope>()
const persistentClearRequests = new Map<WbiKeyScope, Promise<void>>()

// 正在获取密钥的Promise，用于避免并发重复获取
let fetchingKeysPromise: Promise<boolean> | null = null
let fetchingNoCookieKeysPromise: Promise<boolean> | null = null
let fetchingKeysForceRefresh = false
let fetchingNoCookieKeysForceRefresh = false

async function getDefaultBrowserStorage(): Promise<WbiStorageArea> {
  const browser = await import('webextension-polyfill').then(module => module.default)
  return browser.storage.local as WbiStorageArea
}

async function getDefaultBilibiliCookies(): Promise<WbiCookie[]> {
  const browser = await import('webextension-polyfill').then(module => module.default)
  return await browser.cookies.getAll({ domain: '.bilibili.com' })
}

const DEFAULT_WBI_RUNTIME: WbiRuntimeDependencies = {
  fetch: globalThis.fetch.bind(globalThis),
  getCookies: getDefaultBilibiliCookies,
  now: Date.now,
  storage: {
    async get(key) {
      return (await getDefaultBrowserStorage()).get(key)
    },
    async set(values) {
      await (await getDefaultBrowserStorage()).set(values)
    },
    async remove(key) {
      await (await getDefaultBrowserStorage()).remove(key)
    },
  },
}

/**
 * 从URL中提取文件名（不含扩展名）
 */
function extractKeyFromUrl(url: string): string {
  const match = url.match(/\/([^/]+)\.png$/)
  return match ? match[1] : ''
}

/**
 * 生成混合密钥
 */
function generateMixinKey(imgKey: string, subKey: string): string {
  const rawWbiKey = imgKey + subKey
  let mixinKey = ''

  for (let i = 0; i < 32; i++) {
    mixinKey += rawWbiKey[MIXIN_KEY_ENC_TAB[i]]
  }

  return mixinKey
}

/**
 * 对参数进行URL编码（符合WBI要求）
 * 注意：根据官方规范，需要先过滤掉 !'()* 字符，然后再进行URL编码
 */
function encodeWbiParam(value: unknown): string {
  // 先过滤掉 !'()* 字符
  const filtered = String(value).replace(/[!'()*]/g, '')
  // 再进行URL编码
  return encodeURIComponent(filtered)
}

function getWbiScope(options: WbiKeyOptions): WbiKeyScope {
  return options.noCookie ? 'anonymous' : 'authenticated'
}

function getMemoryWbiKeys(scope: WbiKeyScope): WbiKeys | null {
  return scope === 'anonymous' ? anonymousWbiKeysCache : authenticatedWbiKeysCache
}

function setMemoryWbiKeys(scope: WbiKeyScope, keys: WbiKeys | null) {
  if (scope === 'anonymous')
    anonymousWbiKeysCache = keys
  else
    authenticatedWbiKeysCache = keys
}

function isWbiKeysValid(keys: WbiKeys, options: WbiKeyOptions, now: number): boolean {
  if (keys.scope !== getWbiScope(options) || now - keys.timestamp > WBI_KEYS_TTL_MS)
    return false
  if (keys.scope === 'authenticated' && options.mid !== undefined && keys.mid !== options.mid)
    return false
  return Boolean(keys.imgKey && keys.subKey)
}

async function persistWbiKeys(keys: WbiKeys, runtime: WbiRuntimeDependencies) {
  await runtime.storage.set({ [WBI_KEYS_STORAGE_KEYS[keys.scope]]: keys })
}

function clearPersistedWbiKeys(scope: WbiKeyScope, runtime: WbiRuntimeDependencies): Promise<void> {
  const existing = persistentClearRequests.get(scope)
  if (existing)
    return existing
  const request = runtime.storage.remove(WBI_KEYS_STORAGE_KEYS[scope])
    .catch(() => {})
    .finally(() => {
      if (persistentClearRequests.get(scope) === request)
        persistentClearRequests.delete(scope)
    })
  persistentClearRequests.set(scope, request)
  return request
}

async function resolveAuthenticatedMid(
  options: WbiKeyOptions,
  runtime: WbiRuntimeDependencies,
): Promise<string> {
  if (options.noCookie)
    return ''
  if (options.mid !== undefined)
    return options.mid.trim()
  const cookies = await runtime.getCookies()
  return cookies.find(cookie => cookie.name === 'DedeUserID')?.value.trim() ?? ''
}

async function storeResolvedWbiKeys(
  imgUrl: string,
  subUrl: string,
  options: WbiKeyOptions,
  mid: string,
  runtime: WbiRuntimeDependencies,
): Promise<boolean> {
  const imgKey = extractKeyFromUrl(imgUrl)
  const subKey = extractKeyFromUrl(subUrl)
  if (!imgKey || !subKey)
    return false

  const scope = getWbiScope(options)
  const keys: WbiKeys = {
    imgKey,
    subKey,
    timestamp: runtime.now(),
    scope,
    mid: scope === 'authenticated' ? mid : '',
  }
  setMemoryWbiKeys(scope, keys)
  invalidatedPersistentScopes.delete(scope)
  await persistentClearRequests.get(scope)
  await persistWbiKeys(keys, runtime).catch(() => {})
  return true
}

/**
 * 存储WBI密钥（从 nav 接口获取）。内存立即可用，持久化异步完成。
 */
export function storeWbiKeys(
  imgUrl: string,
  subUrl: string,
  options: WbiKeyOptions = {},
  runtime: WbiRuntimeDependencies = DEFAULT_WBI_RUNTIME,
): void {
  const imgKey = extractKeyFromUrl(imgUrl)
  const subKey = extractKeyFromUrl(subUrl)
  if (!imgKey || !subKey)
    return
  const scope = getWbiScope(options)
  const keys: WbiKeys = {
    imgKey,
    subKey,
    timestamp: runtime.now(),
    scope,
    mid: scope === 'authenticated' ? options.mid?.trim() ?? '' : '',
  }
  setMemoryWbiKeys(scope, keys)
  invalidatedPersistentScopes.delete(scope)
  void (async () => {
    if (scope === 'authenticated' && !keys.mid)
      keys.mid = await resolveAuthenticatedMid(options, runtime).catch(() => '')
    await persistentClearRequests.get(scope)
    await persistWbiKeys(keys, runtime).catch(() => {})
  })()
}

/**
 * 获取WBI密钥（如果缓存过期则返回null）
 */
export function getWbiKeys(options: WbiKeyOptions = {}, now = Date.now()): WbiKeys | null {
  const scope = getWbiScope(options)
  const keys = getMemoryWbiKeys(scope)
  if (keys && isWbiKeysValid(keys, options, now))
    return keys
  setMemoryWbiKeys(scope, null)
  return null
}

/**
 * 清除 WBI 密钥缓存
 */
export function clearWbiKeys(options: WbiKeyOptions = {}): void {
  const scope = getWbiScope(options)
  setMemoryWbiKeys(scope, null)
  invalidatedPersistentScopes.add(scope)
  void clearPersistedWbiKeys(scope, DEFAULT_WBI_RUNTIME)
}

/** Clear only worker memory while retaining the valid persisted slot. */
export function invalidateWbiMemoryCache(options: WbiKeyOptions = {}): void {
  setMemoryWbiKeys(getWbiScope(options), null)
}

/**
 * 为参数添加WBI签名
 */
export function addWbiSign(params: Record<string, any>, options: WbiKeyOptions = {}): Record<string, any> {
  const keys = getWbiKeys(options)
  if (!keys) {
    // 如果没有密钥，返回原参数
    return params
  }

  // 添加时间戳
  const wts = Math.floor(Date.now() / 1000)
  const signParams: Record<string, unknown> = { ...params, wts }

  // 按键名升序排序
  const sortedKeys = Object.keys(signParams).sort()

  // 构建查询字符串
  const queryParts: string[] = []
  for (const key of sortedKeys) {
    const value = signParams[key]
    // 过滤空值参数：undefined、null、空字符串
    // 保留数字 0 和布尔值 false
    if (value !== undefined && value !== null && value !== '') {
      queryParts.push(`${encodeWbiParam(key)}=${encodeWbiParam(value)}`)
    }
  }

  const queryString = queryParts.join('&')

  // 生成混合密钥
  const mixinKey = generateMixinKey(keys.imgKey, keys.subKey)

  // 计算签名
  const w_rid = md5(queryString + mixinKey)

  return {
    ...signParams,
    w_rid,
  }
}

function parsePersistedWbiKeys(value: unknown): WbiKeys | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null
  const record = value as Partial<WbiKeys>
  if (
    typeof record.imgKey !== 'string'
    || typeof record.subKey !== 'string'
    || typeof record.timestamp !== 'number'
    || !Number.isFinite(record.timestamp)
    || (record.scope !== 'authenticated' && record.scope !== 'anonymous')
    || typeof record.mid !== 'string'
  ) {
    return null
  }
  return record as WbiKeys
}

/**
 * 初始化WBI密钥（从nav接口获取）
 * 应该在扩展启动时调用
 * 使用单例模式避免并发重复获取
 */
export async function initWbiKeys(
  options: WbiKeyOptions = {},
  runtime: WbiRuntimeDependencies = DEFAULT_WBI_RUNTIME,
): Promise<boolean> {
  const noCookie = options.noCookie === true
  const scope = getWbiScope(options)

  // 先使用当前 worker 内存中的有效密钥。
  if (!options.forceRefresh && getWbiKeys(options, runtime.now())) {
    return true
  }

  // 如果正在获取中，等待当前获取完成
  if (noCookie) {
    if (fetchingNoCookieKeysPromise) {
      if (options.forceRefresh && !fetchingNoCookieKeysForceRefresh) {
        await fetchingNoCookieKeysPromise
        return await initWbiKeys(options, runtime)
      }
      return await fetchingNoCookieKeysPromise
    }
  }
  else if (fetchingKeysPromise) {
    if (options.forceRefresh && !fetchingKeysForceRefresh) {
      await fetchingKeysPromise
      return await initWbiKeys(options, runtime)
    }
    return await fetchingKeysPromise
  }

  // 开始新的获取流程
  const fetchPromise = (async () => {
    try {
      await persistentClearRequests.get(scope)
      if (options.forceRefresh) {
        setMemoryWbiKeys(scope, null)
        invalidatedPersistentScopes.add(scope)
        await runtime.storage.remove(WBI_KEYS_STORAGE_KEYS[scope]).catch(() => {})
      }

      const cookies = noCookie ? [] : await runtime.getCookies().catch(() => [])
      const mid = noCookie
        ? ''
        : options.mid?.trim()
          ?? cookies.find(cookie => cookie.name === 'DedeUserID')?.value.trim()
          ?? ''

      // Service Worker 冷启动时先恢复持久缓存，MID 不匹配时不得复用 authenticated slot。
      if (!options.forceRefresh && !invalidatedPersistentScopes.has(scope)) {
        const stored = await runtime.storage.get(WBI_KEYS_STORAGE_KEYS[scope]).catch((): Record<string, unknown> => ({}))
        const persisted = parsePersistedWbiKeys(stored[WBI_KEYS_STORAGE_KEYS[scope]])
        if (persisted && isWbiKeysValid(persisted, { ...options, mid }, runtime.now())) {
          setMemoryWbiKeys(scope, persisted)
          return true
        }
        if (persisted && runtime.now() - persisted.timestamp > WBI_KEYS_TTL_MS)
          await runtime.storage.remove(WBI_KEYS_STORAGE_KEYS[scope]).catch(() => {})
      }

      const cookieStr = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')

      const headers: HeadersInit = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
      }

      // 如果有cookie，添加到请求头
      if (cookieStr) {
        headers.Cookie = cookieStr
      }

      const navResponse = await runtime.fetch('https://api.bilibili.com/x/web-interface/nav', {
        method: 'GET',
        headers,
        credentials: noCookie ? 'omit' : 'include',
      })
      const navData = JSON.parse(await navResponse.text()) as {
        code?: unknown
        data?: { wbi_img?: { img_url?: unknown, sub_url?: unknown } }
      }

      // 无论是否登录，nav接口都应该返回wbi_img
      if ((navData.code === 0 || navData.code === -101) && navData.data?.wbi_img) {
        const { img_url, sub_url } = navData.data.wbi_img
        if (typeof img_url === 'string' && typeof sub_url === 'string')
          return await storeResolvedWbiKeys(img_url, sub_url, options, mid, runtime)
      }
      return false
    }
    catch {
      return false
    }
    finally {
      // 清除获取中的Promise标志
      if (noCookie)
        fetchingNoCookieKeysPromise = null
      else
        fetchingKeysPromise = null
      if (noCookie)
        fetchingNoCookieKeysForceRefresh = false
      else
        fetchingKeysForceRefresh = false
    }
  })()

  if (noCookie) {
    fetchingNoCookieKeysPromise = fetchPromise
    fetchingNoCookieKeysForceRefresh = options.forceRefresh === true
  }
  else {
    fetchingKeysPromise = fetchPromise
    fetchingKeysForceRefresh = options.forceRefresh === true
  }

  return await fetchPromise
}

/**
 * 检查是否需要WBI签名的URL
 */
export function needsWbiSign(url: string): boolean {
  const parsedUrl = parseBilibiliApiUrl(url)
  if (!parsedUrl)
    return false

  const { pathname } = parsedUrl

  // 排除nav接口
  if (pathname === NAV_PATH)
    return false
  // 排除bili_ticket接口
  if (pathname === BILI_TICKET_PATH)
    return false
  // 首页推荐的 web dislike 接口也要求附带 w_rid/wts
  if (pathname === FEEDBACK_DISLIKE_PATH)
    return true

  // WBI签名判断规则：
  // 1. URL中明确包含 /wbi/
  // 2. 匹配 /x/.../v1/、/x/.../v2/、/x/.../v3/ 模式（/.../可以是直接连着的，如/x/v2/）
  if (pathname.includes('/wbi/'))
    return true

  // 匹配版本号路径：/x/任意内容/v1/ 或 /x/任意内容/v2/ 或 /x/任意内容/v3/
  const versionPattern = /\/x\/.*\/v[123]\//
  return versionPattern.test(pathname)
}
