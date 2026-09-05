import type { Ref } from 'vue'
import { computed, onScopeDispose, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { SearchRequest } from '~/constants/searchApi'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
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
  let disposed = false
  let contextInvalidated = false

  function getRequestScope(): string {
    const accountId = resolveAuthenticatedAccountId(
      topBarStore.isLogin,
      topBarStore.userInfo.mid,
    )
    const account = accountId === null
      ? (topBarStore.isLogin ? 'profile-unavailable' : 'logged-out')
      : `account:${accountId}`
    return `${settings.value.depersonalizeSearchResults ? 'anonymous' : 'personalized'}:${account}`
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

    if (!request.keyword.trim()) {
      activeRequestToken = null
      isLoading.value = false
      error.value = ''
      results.value = null
      return false
    }

    isLoading.value = true
    error.value = ''

    const requestToken = Symbol('search-request')
    const scope = getRequestScope()
    activeRequestToken = requestToken
    const isCurrent = () => !disposed && activeRequestToken === requestToken && getRequestScope() === scope

    try {
      const response = await requestSearch(request)

      // 检查请求是否已过期
      if (!isCurrent())
        return false

      if (!response || response.code !== 0) {
        error.value = t('search.errors.failed')
        return false
      }

      const processed = await processResponse(response, isCurrent)
      return processed && isCurrent()
    }
    catch (err) {
      // Even a superseded request can prove that this entire extension world is stale.
      if (isExtensionContextInvalidatedError(err)) {
        contextInvalidated = true
        activeRequestToken = null
        isLoading.value = false
        error.value = ''
        return false
      }
      if (!isCurrent())
        return false
      console.error(`Search error for ${category}:`, err)
      error.value = t('search.errors.exception')
      return false
    }
    finally {
      if (activeRequestToken === requestToken)
        isLoading.value = false
    }
  }

  /**
   * 重置搜索状态
   */
  function reset() {
    isLoading.value = false
    results.value = null
    error.value = ''
    activeRequestToken = null
  }

  onScopeDispose(() => {
    disposed = true
    activeRequestToken = null
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
