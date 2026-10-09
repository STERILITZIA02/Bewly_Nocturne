import type { SearchRequest } from '~/constants/searchApi'
import { buildSearchApiRequest, parseAnonymousSearchRequest } from '~/constants/searchApi'
import { settings } from '~/logic'
import { sendAbortableApiMessage } from '~/utils/messaging'

/** Dedicated no-cookie transport. The background validates and rebuilds the request. */
export function requestAnonymousSearch(request: SearchRequest, signal?: AbortSignal): Promise<any> {
  const normalizedRequest = parseAnonymousSearchRequest(request)
  return sendAbortableApiMessage('anonymousSearch', {
    contentScriptQuery: 'anonymousSearch',
    request: normalizedRequest,
  }, signal)
}

/** Route only explicitly depersonalized searches through the anonymous WBI scope. */
export function requestSearch(request: SearchRequest, signal?: AbortSignal): Promise<any> {
  const normalizedRequest = parseAnonymousSearchRequest(request)
  if (settings.value.depersonalizeSearchResults)
    return requestAnonymousSearch(normalizedRequest, signal)

  const builtRequest = buildSearchApiRequest(normalizedRequest)
  return sendAbortableApiMessage(builtRequest.method, {
    contentScriptQuery: builtRequest.method,
    ...builtRequest.params,
  }, signal)
}
