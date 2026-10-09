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
  let readController: AbortController | undefined
  const createFaces = () => createFavoriteAvatarLoader(async (mid, signal) => {
    const result = await api.user.getUserCard({ mid: String(mid) }, { signal })
    return result?.code === 0 && Number(result.data?.card?.mid) === mid ? result.data.card.face : undefined
  })
  let faces = createFaces()
  function cancelReads() {
    readController?.abort()
    readController = undefined
    loading.value = false
    faces.dispose()
    faces = createFaces()
  }
  function clear() {
    generation++
    cancelReads()
    draft.value = keyword.value = ''
    items.value = []
    page.value = 1
    ended.value = failed.value = loading.value = false
  }
  watch([account, uploader], clear, { flush: 'sync' })
  function enrichAuthors(entries: Video[]) {
    const version = generation
    const accountId = account()
    const mid = uploader()
    const query = keyword.value
    if (!active.value || accountId === null || !state.isCurrent())
      return
    for (const item of entries) {
      const author = Array.isArray(item.author) ? item.author[0] : item.author
      if (!author?.mid || author.authorFace)
        continue
      const knownFace = findUploader(author.mid)?.face
      if (knownFace) {
        author.authorFace = knownFace
        continue
      }
      void faces.load(author.mid).then((face) => {
        if (face && !disposed && version === generation && state.isCurrent()
          && accountId === account() && mid === uploader() && query === keyword.value) {
          author.authorFace = face
        }
      })
    }
  }
  async function load() {
    const mid = uploader()
    const accountId = account()
    if (!active.value || !mid || accountId === null || loading.value || ended.value || !state.isCurrent())
      return
    const version = generation
    const query = keyword.value
    const pn = page.value
    const current = () => !disposed && version === generation && state.isCurrent() && accountId === account() && mid === uploader() && query === keyword.value
    const controller = new AbortController()
    readController = controller
    loading.value = true
    failed.value = false
    try {
      const response = await api.user.getUserVideos({ mid: String(mid), keyword: query, pn, ps: SUBMISSIONS_PAGE_SIZE, order: 'pubdate' }, { signal: controller.signal })
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
      // Read through the reactive list; mutating the raw inserted objects would
      // leave mounted cards unchanged until some unrelated render.
      if (added.length)
        enrichAuthors(items.value.slice(-added.length))
    }
    catch {
      if (current() && !controller.signal.aborted)
        failed.value = true
    }
    finally {
      if (current())
        loading.value = false
      if (readController === controller)
        readController = undefined
    }
  }
  function submit() {
    generation++
    cancelReads()
    keyword.value = draft.value.trim()
    items.value = []
    page.value = 1
    ended.value = failed.value = loading.value = false
    return load()
  }
  if (state.restored)
    enrichAuthors(items.value)
  onScopeDispose(() => {
    disposed = true
    generation++
    readController?.abort()
    faces.dispose()
  })
  return { draft, keyword, items, active, ended, failed, loading, submit, load, clear }
}
