import { readFile } from 'node:fs/promises'

export const MOMENTS_SOURCE_FILES = [
  '../src/contentScripts/views/Moments/Moments.vue',
  '../src/contentScripts/views/Moments/useMomentDetail.ts',
  '../src/contentScripts/views/Moments/useMomentLayout.ts',
  '../src/contentScripts/views/Moments/useMomentPreviews.ts',
  '../src/contentScripts/views/Moments/useMomentActions.ts',
  '../src/contentScripts/views/Moments/momentAdapter.ts',
  '../src/contentScripts/views/Moments/momentFeedReader.ts',
  '../src/contentScripts/views/Moments/useMomentsFeedCache.ts',
  '../src/utils/momentColumnIndex.ts',
  '../src/utils/mediaResources.ts',
  '../src/utils/previewMediaSession.ts',
] as const

export const FOR_YOU_SOURCE_FILES = [
  '../src/contentScripts/views/Home/components/ForYou.vue',
  '../src/contentScripts/views/Home/useForYouRecommendations.ts',
  '../src/contentScripts/views/Home/useRecommendationFilters.ts',
  '../src/contentScripts/views/Home/useRecommendationHistory.ts',
  '../src/contentScripts/views/Home/useWebRecommendationCursor.ts',
] as const

export const FAVORITES_SOURCE_FILES = [
  '../src/contentScripts/views/Favorites/FavoritesPage.vue',
  '../src/contentScripts/views/Favorites/useFavoritesData.ts',
  '../src/contentScripts/views/Favorites/useFavoriteWrites.ts',
  '../src/contentScripts/views/Favorites/favoriteAdapters.ts',
] as const

export async function readSourceFiles(files: readonly string[]) {
  return (await Promise.all(files.map(file => readFile(new URL(file, import.meta.url), 'utf8')))).join('\n')
}
