import type { Ref } from 'vue'
import { computed, onScopeDispose, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { SearchRequest } from '~/constants/searchApi'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { waitWithSignal } from '~/utils/abort'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import { getUserID } from '~/utils/main'
import { isExtensionContextInvalidatedError } from '~/utils/messaging'
import { requestSearch } from '~/utils/searchRequest'

import type { SearchCategory } from '../types'

/**
 * 搜索请求的通用 composable
 * 管理搜索状态、错误处理和请求取消
 */
export function useSearchRequest<T = any>(category: SearchCategory) {
  const { t } = useI18n()
  const topBarStore = useTopBarStore()
  const isLoading = ref(false)
  const error = ref('')
  // Search responses contain plain data; keep deep reactivity and the caller's data type.
  const results = ref<T | null>(null) as Ref<T | null>

  // 请求令牌，用于取消过期的请求
  let activeRequestToken: symbol | null = null
  let activeController: AbortController | null = null
  let disposed = false
  let contextInvalidated = false

  function cancelActiveRequest() {
    activeRequestToken = null
    activeController?.abort()
    activeController = null
  }

  function getRequestScope(): string {
    const accountId = resolveAuthenticatedAccountId(
      topBarStore.isLogin,
      topBarStore.userInfo.mid,
    )
    const account = accountId === null
      ? (topBarStore.isLogin ? 'profile-unavailable' : 'logged-out')
      : `account:${accountId}`
    return `${settings.value.depersonalizeSearchResults ? 'anonymous' : 'personalized'}:${account}:cookie:${getUserID() ?? 'guest'}`
  }
  const requestScope = computed(getRequestScope)

  /**
   * 执行搜索请求
   * @param request 类型化搜索请求
   * @returns 搜索是否成功
   */
  async function search(
    request: SearchRequest,
    processResponse: (response: any, isCurrent: () => boolean) => boolean | Promise<boolean>,
  ): Promise<boolean> {
    if (disposed || contextInvalidated)
      return false

    cancelActiveRequest()
    if (!request.keyword.trim()) {
      isLoading.value = false
      error.value = ''
      results.value = null
      return false
    }

    isLoading.value = true
    error.value = ''

    const requestToken = Symbol('search-request')
    const controller = new AbortController()
    activeController = controller
    const scope = getRequestScope()
    activeRequestToken = requestToken
    const isCurrent = () => !disposed && activeRequestToken === requestToken && getRequestScope() === scope

    try {
      const response = await requestSearch(request, controller.signal)

      // 检查请求是否已过期
      if (!isCurrent())
        return false

      if (!response || response.code !== 0) {
        error.value = t(response?.code === -412 ? 'search.errors.risk_control' : 'search.errors.failed')
        return false
      }

      const processed = await waitWithSignal(Promise.resolve(processResponse(response, isCurrent)), controller.signal)
      return processed && isCurrent()
    }
    catch (err) {
      // Even a superseded request can prove that this entire extension world is stale.
      if (isExtensionContextInvalidatedError(err)) {
        contextInvalidated = true
        cancelActiveRequest()
        isLoading.value = false
        error.value = ''
        return false
      }
      if (!isCurrent())
        return false
      const failure = (err && typeof err === 'object' ? err : {}) as { name?: string, isRiskControl?: boolean }
      if (controller.signal.aborted || failure.name === 'AbortError')
        return false
      console.error(`Search error for ${category}:`, err)
      error.value = t(failure.name === 'TimeoutError'
        ? 'search.errors.timeout'
        : failure.isRiskControl ? 'search.errors.risk_control' : 'search.errors.exception')
      return false
    }
    finally {
      if (activeRequestToken === requestToken) {
        isLoading.value = false
        activeController = null
      }
    }
  }

  /**
   * 重置搜索状态
   */
  function reset() {
    isLoading.value = false
    results.value = null
    error.value = ''
    cancelActiveRequest()
  }

  onScopeDispose(() => {
    disposed = true
    cancelActiveRequest()
    isLoading.value = false
  })

  return {
    isLoading,
    error,
    results,
    requestScope,
    search,
    reset,
  }
}
