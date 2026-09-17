import { computed, onScopeDispose, ref, watch } from 'vue'

import type { Video } from '~/components/VideoCard/types'
import type { HomeTabState } from '~/composables/useHomeTabState'
import { settings } from '~/logic'
import api from '~/utils/api'
import { parseStatNumber } from '~/utils/dataFormatter'
import { createFavoriteAvatarLoader } from '~/utils/favoriteAvatar'
import { decodeHtmlEntities } from '~/utils/htmlDecode'

import type { FollowingUploader } from './model'

const SUBMISSIONS_PAGE_SIZE = 30
interface Submission {
  aid: number
  bvid: string
  mid: number
  title: string
  description?: string
  pic: string
  author: string
  created: number
  length?: string
  play?: number | string
  video_review?: number
  is_charging_arc?: boolean
  elec_arc_type?: number
}

/** Only the submitted query owns these results; editing the input does not change pagination. */
export function useFollowingVideoSearch(state: HomeTabState, account: () => number | null, uploader: () => number | null, findUploader: (mid: number) => FollowingUploader | undefined) {
  const draft = state.ref('videoSearchInput', '')
  const keyword = state.ref('videoSearchKeyword', '')
  const items = state.ref<Video[]>('videoSearchItems', [])
  const page = state.ref('videoSearchPage', 1)
  const ended = state.ref('videoSearchEnded', false)
  const failed = ref(false)
  const loading = ref(false)
  const active = computed(() => uploader() !== null && Boolean(keyword.value))
  let generation = 0
  let disposed = false
  const faces = createFavoriteAvatarLoader(async (mid) => {
    const result = await api.user.getUserCard({ mid: String(mid) })
    return result?.code === 0 && Number(result.data?.card?.mid) === mid ? result.data.card.face : undefined
  })
  function clear() {
    generation++
    draft.value = keyword.value = ''
    items.value = []
    page.value = 1
    ended.value = failed.value = loading.value = false
  }
  watch([account, uploader], clear, { flush: 'sync' })
  async function load() {
    const mid = uploader()
    const accountId = account()
    if (!active.value || !mid || accountId === null || loading.value || ended.value || !state.isCurrent())
      return
    const version = generation
    const query = keyword.value
    const pn = page.value
    const current = () => !disposed && version === generation && state.isCurrent() && accountId === account() && mid === uploader() && query === keyword.value
    loading.value = true
    failed.value = false
    try {
      const response = await api.user.getUserVideos({ mid: String(mid), keyword: query, pn, ps: SUBMISSIONS_PAGE_SIZE, order: 'pubdate' })
      if (!current())
        return
      const data = response?.data
      if (response?.code !== 0 || data?.is_risk || data?.gaia_res_type || !Array.isArray(data?.list?.vlist)
        || !Number.isFinite(data?.page?.count) || !(data.page.ps > 0)) {
        throw new Error('Invalid uploader submission response')
      }
      const seen = new Set(items.value.map(item => item.id))
      const added: Video[] = []
      for (const row of data.list.vlist as Submission[]) {
        if (!Number.isSafeInteger(row.aid) || row.aid <= 0 || !row.bvid || seen.has(row.aid))
          continue
        seen.add(row.aid)
        if (settings.value.followingFilterChargingVideos && (row.is_charging_arc || row.elec_arc_type === 1))
          continue
        added.push({
          id: row.aid,
          bvid: row.bvid,
          sourceUploaderMid: mid,
          title: decodeHtmlEntities((typeof row.title === 'string' ? row.title : '').replace(/<\/?em\b[^>]*>/gi, '')),
          desc: decodeHtmlEntities(row.description ?? ''),
          cover: row.pic,
          durationStr: row.length,
          author: { mid: row.mid, name: decodeHtmlEntities(typeof row.author === 'string' ? row.author : ''), authorFace: findUploader(row.mid)?.face ?? '' },
          view: parseStatNumber(row.play ?? 0),
          danmaku: row.video_review,
          publishedTimestamp: row.created,
          threePointV2: [],
        })
      }
      const noProgress = data.list.vlist.length > 0 && seen.size === items.value.length
      items.value.push(...added)
      ended.value = data.list.vlist.length === 0 || pn * data.page.ps >= data.page.count
      if (noProgress && !ended.value)
        throw new Error('Uploader submission pagination made no progress')
      page.value = pn + 1
      for (const item of added) {
        const author = Array.isArray(item.author) ? item.author[0] : item.author
        if (author?.mid && !author.authorFace) {
          void faces.load(author.mid).then((face) => {
            if (face && current())
              author.authorFace = face
          })
        }
      }
    }
    catch {
      if (current())
        failed.value = true
    }
    finally {
      if (current())
        loading.value = false
    }
  }
  function submit() {
    generation++
    keyword.value = draft.value.trim()
    items.value = []
    page.value = 1
    ended.value = failed.value = loading.value = false
    return load()
  }
  onScopeDispose(() => {
    disposed = true
    generation++
    faces.dispose()
  })
  return { draft, keyword, items, active, ended, failed, loading, submit, load, clear }
}
