import browser from 'webextension-polyfill'

import type { AppClientEndpoint, AppClientErrorKind, AppClientRequest, AppClientResponse } from '~/constants/appClient'
import { APP_CLIENT_PORT, APP_CLIENT_REQUEST_TIMEOUT_MS } from '~/constants/appClient'

export class AppClientError extends Error {
  readonly kind: AppClientErrorKind
  readonly dispatched: boolean
  readonly status?: number

  constructor(kind: AppClientErrorKind, message: string, dispatched: boolean, status?: number) {
    super(message)
    this.name = 'AppClientError'
    this.kind = kind
    this.dispatched = dispatched
    this.status = status
  }
}

export interface AppClientCallOptions {
  mid?: number | null
  signal?: AbortSignal
  timeoutMs?: number
}

function isResponse(value: unknown): value is AppClientResponse {
  if (!value || typeof value !== 'object' || typeof (value as { ok?: unknown }).ok !== 'boolean')
    return false
  const response = value as AppClientResponse
  return response.ok || (typeof response.error?.kind === 'string' && typeof response.error.message === 'string')
}

export function callAppClient(endpoint: AppClientEndpoint, params: AppClientRequest['params'], options: AppClientCallOptions = {}): Promise<AppClientResponse> {
  const deadline = Date.now() + (options.timeoutMs ?? APP_CLIENT_REQUEST_TIMEOUT_MS)
  return new Promise((resolve) => {
    let settled = false
    let posted = false
    let port: browser.Runtime.Port | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (response: AppClientResponse) => {
      if (settled)
        return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      if (port) {
        port.onMessage.removeListener(receive)
        port.onDisconnect.removeListener(disconnected)
        try {
          port.disconnect()
        }
        catch {}
      }
      resolve(response)
    }
    const fail = (kind: AppClientErrorKind, message: string) => finish({ ok: false, error: { kind, message, dispatched: posted } })
    function abort() {
      fail('aborted', 'APP client request cancelled')
    }
    function receive(value: unknown) {
      if (isResponse(value))
        finish(value)
      else
        fail('invalid', 'Invalid APP client response')
    }
    function disconnected() {
      fail('network', 'APP client port closed before a response was received')
    }
    if (options.signal?.aborted) {
      abort()
      return
    }
    options.signal?.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => fail('timeout', 'APP client request timed out'), Math.max(0, deadline - Date.now()))
    try {
      port = browser.runtime.connect({ name: APP_CLIENT_PORT })
      port.onMessage.addListener(receive)
      port.onDisconnect.addListener(disconnected)
      posted = true
      port.postMessage({ endpoint, params, mid: options.mid ?? null, deadline } satisfies AppClientRequest)
    }
    catch (error) {
      posted = false
      fail('network', error instanceof Error ? error.message : String(error))
    }
  })
}

export async function requestAppClientData<T = any>(endpoint: AppClientEndpoint, params: AppClientRequest['params'], options: AppClientCallOptions = {}): Promise<T> {
  const response = await callAppClient(endpoint, params, options)
  if (response.ok)
    return response.data as T
  throw new AppClientError(response.error.kind, response.error.message, response.error.dispatched, response.error.status)
}

export function isUncertainAppClientFailure(error: unknown): boolean {
  return error instanceof AppClientError && error.dispatched
}
