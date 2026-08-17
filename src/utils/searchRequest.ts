import type { SearchRequest } from '~/constants/searchApi'
import { buildSearchApiRequest, parseAnonymousSearchRequest } from '~/constants/searchApi'
import { settings } from '~/logic'
import { sendMessage } from '~/utils/messaging'

/** Dedicated no-cookie transport. The background validates and rebuilds the request. */
export function requestAnonymousSearch(request: SearchRequest): Promise<any> {
  const normalizedRequest = parseAnonymousSearchRequest(request)
  return sendMessage('anonymousSearch', {
    contentScriptQuery: 'anonymousSearch',
    request: normalizedRequest,
  })
}

/** Route only explicitly depersonalized searches through the anonymous WBI scope. */
export function requestSearch(request: SearchRequest): Promise<any> {
  const normalizedRequest = parseAnonymousSearchRequest(request)
  if (settings.value.depersonalizeSearchResults)
    return requestAnonymousSearch(normalizedRequest)

  const builtRequest = buildSearchApiRequest(normalizedRequest)
  return sendMessage(builtRequest.method, {
    contentScriptQuery: builtRequest.method,
    ...builtRequest.params,
  })
}
