export interface SearchRecommendationItem {
  seid: string
  id: number
  type: number
  show_name: string
  name: string
  goto_type: number
  goto_value: string
  url: string
}

export interface SearchRecommendationResponse {
  code: number
  message?: string
  data?: SearchRecommendationItem
}
