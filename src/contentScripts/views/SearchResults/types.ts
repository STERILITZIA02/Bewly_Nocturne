import type { SearchScope } from '~/utils/searchUrl'

export type { SearchVideoFilters as VideoSearchFilters } from '~/utils/searchUrl'
export type SearchCategory = SearchScope

export interface SearchCategoryOption {
  value: SearchCategory
  label: string
  icon: string
}

export type LiveSubCategory = 'all' | 'live_room' | 'live_user'

export interface UserSearchFilters {
  order: string
  userType: number
}

export interface LiveSearchFilters {
  subCategory: LiveSubCategory
  roomOrder: string
  userOrder: string
}
