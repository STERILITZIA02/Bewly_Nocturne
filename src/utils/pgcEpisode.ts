import api from '~/utils/api'

export interface PgcEpisodeVideoIds {
  aid: number
  bvid?: string
  hasNextEpisode?: boolean
}

// Public ID metadata is cheap to reload; a long-lived tab must not retain every
// episode it has ever visited. This bounds cache retention, not server results.
export const PGC_EPISODE_CACHE_LIMIT = 256
const episodeVideoIds = new Map<number, PgcEpisodeVideoIds>()
const episodeVideoIdRequests = new Map<number, Promise<PgcEpisodeVideoIds | undefined>>()

export function findPgcEpisodeVideoIds(result: any, epid: number): PgcEpisodeVideoIds | undefined {
  const groups = [
    ...(Array.isArray(result?.episodes) ? [result.episodes] : []),
    ...(Array.isArray(result?.section)
      ? result.section.map((section: any) => Array.isArray(section?.episodes) ? section.episodes : [])
      : []),
  ]
  for (const episodes of groups) {
    const index = episodes.findIndex((episode: any) => Number(episode?.id ?? episode?.ep_id) === epid)
    if (index < 0)
      continue
    const episode = episodes[index]
    const aid = Number(episode?.aid)
    if (Number.isSafeInteger(aid) && aid > 0)
      return { aid, bvid: typeof episode?.bvid === 'string' && episode.bvid ? episode.bvid : undefined, hasNextEpisode: index < episodes.length - 1 }
  }
}

export async function resolvePgcEpisodeVideoIds(epid: number): Promise<PgcEpisodeVideoIds | undefined> {
  if (!Number.isSafeInteger(epid) || epid <= 0)
    return undefined
  const cached = episodeVideoIds.get(epid)
  if (cached) {
    episodeVideoIds.delete(epid)
    episodeVideoIds.set(epid, cached)
    return cached
  }

  const pending = episodeVideoIdRequests.get(epid)
  if (pending)
    return pending

  const request = api.anime.getAnimeDetail({ ep_id: epid })
    .then((response) => {
      if (response.code !== 0)
        return undefined

      const ids = findPgcEpisodeVideoIds(response.result ?? response.data, epid)
      if (!ids)
        return undefined
      episodeVideoIds.set(epid, ids)
      while (episodeVideoIds.size > PGC_EPISODE_CACHE_LIMIT)
        episodeVideoIds.delete(episodeVideoIds.keys().next().value!)
      return ids
    })
    .catch(() => undefined)
    .finally(() => episodeVideoIdRequests.delete(epid))

  episodeVideoIdRequests.set(epid, request)
  return request
}
