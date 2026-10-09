import type { API_COLLECTION } from '~/background/messageListeners/api'
import type { CANCELLABLE_API_FUNCTIONS } from '~/constants/apiRequest'
import { sendAbortableApiMessage, sendMessage } from '~/utils/messaging'

export interface ApiRequestOptions { signal?: AbortSignal }

type CamelCase<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}`
  ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
  : Lowercase<S>

type APIParams<T> = T extends { params: infer Params } ? Params : unknown
type APIBody<T> = T extends { body: infer Body } ? Body : unknown
type ClientMethod<T, Name> = T extends (...args: infer Args) => infer Result
  ? Name extends typeof CANCELLABLE_API_FUNCTIONS[number] ? (options?: Args[0], request?: ApiRequestOptions) => Result : T
  : T extends { _fetch: infer Fetch }
    ? Fetch extends { method: infer Method extends string }
      ? Lowercase<Method> extends 'get' ? (options?: Partial<APIParams<T>>, request?: ApiRequestOptions) => Promise<any> : (options?: Partial<APIParams<T> & APIBody<Fetch>>) => Promise<any>
      : never
    : never

type APIFunction<T = typeof API_COLLECTION> = {
  [K in keyof T as CamelCase<string & K>]: {
    [P in keyof T[K]]: ClientMethod<T[K][P], P>
  }
}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export interface APIClient extends APIFunction<typeof API_COLLECTION> {

}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export class APIClient {
  private readonly cache = new Map<string | symbol, any>()

  constructor() {
    // @ts-expect-error ignore
    return new Proxy({}, {
      get: (_, namespace) => { // namespace
        if (this.cache.has(namespace)) {
          return this.cache.get(namespace)
        }
        else {
          const api = new Proxy({}, {
            get(_, p) {
              return (options?: object, request?: ApiRequestOptions) => {
                const message: Record<string, any> = {
                  ...options,
                  contentScriptQuery: p as string,
                }

                return request?.signal
                  ? sendAbortableApiMessage(p as string, message, request.signal)
                  : sendMessage(p as string, message)
              }
            },
          })
          this.cache.set(namespace, api)
          return api
        }
      },
    })
  }
}

const api = new APIClient()

export default api
