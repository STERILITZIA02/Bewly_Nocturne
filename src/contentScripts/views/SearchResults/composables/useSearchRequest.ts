import { onScopeDispose, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { SearchRequest } from '~/constants/searchApi'
import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { resolveAuthenticatedAccountId } from '~/utils/accountScope'
import { requestSearch } from '~/utils/searchRequest'

import type { SearchCategory } from '../types'

export interface SearchRequestState<T = any> {
  isLoading: boolean
  error: string
  results: T
  totalResults: number
  totalPages: number
  context: string
}

/**
 * 搜索请求的通用 composable
 * 管理搜索状态、错误处理和请求取消
 */
export function useSearchRequest<T = any>(category: SearchCategory) {
  const { t } = useI18n()
  const topBarStore = useTopBarStore()
  const isLoading = ref(false)
  const error = ref('')
  const results = ref<T | null>(null)
  const totalResults = ref(0)
  const totalPages = ref(0)
  const context = ref('')
  const lastResponse = ref<any>(null)

  // 请求令牌，用于取消过期的请求
  let activeRequestToken: symbol | null = null
  let disposed = false

  function getRequestScope(): string {
    if (settings.value.depersonalizeSearchResults)
      return 'anonymous'

    const accountId = resolveAuthenticatedAccountId(
      topBarStore.isLogin,
      topBarStore.userInfo.mid,
    )
    return accountId === null
      ? (topBarStore.isLogin ? 'profile-unavailable' : 'logged-out')
      : `account:${accountId}`
  }

  /**
   * 执行搜索请求
   * @param request 类型化搜索请求
   * @returns 搜索是否成功
   */
  async function search(request: SearchRequest): Promise<boolean> {
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
    const requestScope = getRequestScope()
    activeRequestToken = requestToken

    try {
      const response = await requestSearch(request)

      // 检查请求是否已过期
      if (disposed || activeRequestToken !== requestToken || getRequestScope() !== requestScope)
        return false

      if (!response || response.code !== 0) {
        error.value = t('search.errors.failed')
        return false
      }

      // 保存响应数据供外部使用
      lastResponse.value = response

      return true
    }
    catch (err) {
      if (disposed || activeRequestToken !== requestToken || getRequestScope() !== requestScope)
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
    totalResults.value = 0
    totalPages.value = 0
    context.value = ''
    error.value = ''
    lastResponse.value = null
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
    totalResults,
    totalPages,
    context,
    lastResponse,
    search,
    reset,
  }
}
