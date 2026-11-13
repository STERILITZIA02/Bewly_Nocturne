import api from './api'
import { getListenLoudness, getListenSources } from './listenPlayback'
import type { NativePlaybackUnit } from './videoMetadataBridge'

export async function readListenSources(unit: NativePlaybackUnit, canPlay: (type: string) => string, signal: AbortSignal) {
  const response = unit.episodeId
    ? await api.anime.getEpisodeAudio({ ep_id: unit.episodeId, cid: unit.cid }, { signal })
    : await api.video.getVideoPreview({ bvid: unit.bvid, avid: unit.bvid ? undefined : unit.aid, cid: unit.cid, fnval: 16, voice_balance: 1 }, { signal })
  signal.throwIfAborted()
  if (response?.code !== 0)
    throw new Error('Play URL unavailable')
  return { sources: getListenSources(response, canPlay), loudness: getListenLoudness(response) }
}
