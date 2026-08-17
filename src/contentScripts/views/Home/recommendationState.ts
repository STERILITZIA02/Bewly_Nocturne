export type RecommendationDataState
  = | 'idle'
    | 'loading'
    | 'success'
    | 'empty'
    | 'filtered-empty'
    | 'risk-control'
    | 'request-error'

export interface RecommendationSuccessStateInput {
  apiItemCount: number
  displayedItemCount: number
  filterCandidateCount: number
  filterKeptCount: number
  filtersActive: boolean
}

export function resolveRecommendationSuccessState(
  input: RecommendationSuccessStateInput,
): Extract<RecommendationDataState, 'success' | 'empty' | 'filtered-empty'> {
  if (input.displayedItemCount > 0)
    return 'success'

  if (
    input.filtersActive
    && input.apiItemCount > 0
    && input.filterCandidateCount > 0
    && input.filterKeptCount === 0
  ) {
    return 'filtered-empty'
  }

  return 'empty'
}
