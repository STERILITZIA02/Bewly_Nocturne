import type { DisplayMoment, DisplayRichTextSegment } from '~/components/MomentCard/types'
import { formatCount } from '~/components/MomentCard/utils'
import type { DataItem } from '~/models/moment/moment'
import { classifyMomentAdditional, resolveMomentVoteStatus } from '~/utils/momentAdditionalPolicy'
import { resolveMomentTextSources } from '~/utils/momentDescription'
import { normalizeMomentRemoteUrl as httpsUrl } from '~/utils/momentUrl'

/** API-to-display normalization is independent of feed paging and DOM/layout ownership. */
export function createMomentAdapter(
  t: (key: string, values?: Record<string, string | number>) => string,
  resolveMomentForwardCount: (id: string, value: unknown) => number,
) {
  function normalizeRichTextJumpUrl(url = '') {
    if (!url)
      return ''

    try {
      const normalized = new URL(url.startsWith('//') ? `https:${url}` : url, 'https://www.bilibili.com')
      return normalized.protocol === 'http:' || normalized.protocol === 'https:'
        ? httpsUrl(normalized.toString())
        : ''
    }
    catch {
      return ''
    }
  }

  function parseLiveInfo(content?: string) {
    if (!content)
      return null

    try {
      return JSON.parse(content).live_play_info || null
    }
    catch {
      return null
    }
  }

  function extractImageUrl(image: any) {
    if (!image)
      return ''
    if (typeof image === 'string')
      return image
    return image.src || image.url || image.img_src || image.live_cover || ''
  }

  function extractImageRatio(image: any): number | null {
    if (!image || typeof image !== 'object')
      return null
    const dimension = image.dimension || image.size || image
    let width = Number(dimension.width || dimension.w || image.img_width || 0)
    let height = Number(dimension.height || dimension.h || image.img_height || 0)
    const rotation = Math.abs(Number(dimension.rotate || image.rotate || 0)) % 180
    if (rotation === 90)
      [width, height] = [height, width]
    const ratio = width > 0 && height > 0 ? width / height : 0
    return Number.isFinite(ratio) && ratio > 0 ? ratio : null
  }

  function pickText(...values: any[]) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim())
        return value.trim()
      if (value && typeof value === 'object') {
        const nested = value.text || value.summary || value.content
        if (typeof nested === 'string' && nested.trim())
          return nested.trim()
      }
    }
    return ''
  }

  function normalizeDescText(desc: any) {
    if (!desc)
      return ''
    if (typeof desc === 'string')
      return desc.trim()
    return pickText(desc.text, desc)
  }

  function extractRichTextSegments(...nodeLists: any[]): DisplayRichTextSegment[] {
    const nodes = nodeLists.find(value => Array.isArray(value) && value.length)
    if (!nodes)
      return []

    return nodes.flatMap((node: any) => {
      const text = typeof node?.text === 'string'
        ? node.text
        : typeof node?.orig_text === 'string'
          ? node.orig_text
          : ''
      const emoji = node?.emoji
      const imageUrl = httpsUrl(emoji?.webp_url || emoji?.gif_url || emoji?.icon_url || '')
      if (node?.type === 'RICH_TEXT_NODE_TYPE_EMOJI' && imageUrl) {
        return [{
          type: 'emoji' as const,
          text: text || emoji?.text || t('moments.emoji'),
          imageUrl,
          size: Number(emoji?.size || 1),
        }]
      }

      const isSupportedLink = node?.type === 'RICH_TEXT_NODE_TYPE_TOPIC'
        || node?.type === 'RICH_TEXT_NODE_TYPE_WEB'
        || node?.type === 'RICH_TEXT_NODE_TYPE_VOTE'
      const url = isSupportedLink ? normalizeRichTextJumpUrl(node?.jump_url) : ''
      if (text && url)
        return [{ type: 'link' as const, text, url }]

      return text ? [{ type: 'text' as const, text }] : []
    })
  }

  function extractBlockedInfo(blocked: any) {
    if (!blocked || typeof blocked !== 'object')
      return null
    const hint = pickText(blocked.hint_message, blocked.title, blocked.desc)
    const button = blocked.button || {}
    return {
      hint,
      cover: httpsUrl(blocked.bg_img?.img_day || blocked.bg_img?.img_dark || blocked.icon?.img_day || blocked.icon?.img_dark || ''),
      buttonText: pickText(button.text, t('moments.unlock_with_charge')),
      buttonUrl: button.jump_url || '',
    }
  }

  function getAdditionalActionText(button: any, isReservation = false) {
    if (!button || typeof button !== 'object')
      return t('moments.view')

    // 只有真正的预约卡才能把 button.type 1/2 解释为预约状态。
    if (isReservation && (Number(button.type) === 1 || Number(button.type) === 2)) {
      return Number(button.status) === 2
        ? pickText(button.check?.text, t('moment_card.reserved'))
        : pickText(button.uncheck?.text, t('moment_card.reserve'))
    }

    return pickText(button.jump_style?.text, button.text, t('moments.view'))
  }

  function getMomentContent(item: any) {
    const dynamic = item.modules?.module_dynamic || {}
    const major = dynamic.major || {}
    const author = item.modules?.module_author || {}
    const basic = item.basic || {}
    const iconBadge = author.icon_badge || {}
    const isChargeExclusive = Boolean(
      basic.is_only_fans
      || iconBadge.text === '充电专属'
      || major?.type === 'MAJOR_TYPE_BLOCKED'
      || major?.blocked
      || major?.upower_common,
    )

    const drawItems = major.draw?.items || []
    const opusImageItems = major.opus?.pics || major.opus?.images || []
    const articleCovers = major.article?.covers || []
    const imageEntries = [...drawItems, ...opusImageItems, ...articleCovers]
      .map((image) => {
        const url = httpsUrl(extractImageUrl(image))
        return url ? { url, ratio: extractImageRatio(image) } : null
      })
      .filter((entry): entry is { url: string, ratio: number | null } => Boolean(entry))
      .filter((entry, index, list) => list.findIndex(item => item.url === entry.url) === index)
    const images = imageEntries.map(entry => entry.url)
    const imageRatios = imageEntries.map(entry => entry.ratio)

    const live = parseLiveInfo(major.live_rcmd?.content) || major.live || null
    // ugc_season：合集订阅更新，字段形态接近 archive（bvid/aid/cover/jump_url）
    const ugcSeason = major.ugc_season || null
    const cover = live?.cover
      || major.archive?.cover
      || ugcSeason?.cover
      || major.pgc?.cover
      || major.opus?.cover
      || major.common?.cover
      || major.music?.cover
      || major.upower_common?.cover
    const archive = major.archive || ugcSeason || major.pgc || {}
    const opus = major.opus || {}
    const article = major.article || {}
    const common = major.common || major.upower_common || {}
    const isUgcSeason = item.type === 'DYNAMIC_TYPE_UGC_SEASON'
      || major?.type === 'MAJOR_TYPE_UGC_SEASON'
      || Boolean(ugcSeason)
    const isPgc = item.type === 'DYNAMIC_TYPE_PGC_UNION' || Boolean(major.pgc)
    const isRegularVideo = !isUgcSeason && (
      item.type === 'DYNAMIC_TYPE_AV'
      || Boolean(major.archive)
      || isPgc
    )
    const isVideo = isRegularVideo || isUgcSeason
    const blocked = extractBlockedInfo(major.blocked)
    const additional = dynamic.additional || {}
    const additionalCard = additional.common
      || additional.vote
      || additional.reserve
      || additional.ugc
      || additional.goods
      || additional.match
      || additional.upower_lottery
      || {}
    const liveArea = pickText(live?.area_name, live?.desc_first)
    const livePopularity = live?.online
      ? t('moments.live_popularity', { count: formatCount(Number(live.online)) })
      : pickText(live?.desc_second)

    const chargeBadge = pickText(iconBadge.text, isChargeExclusive ? t('moments.charge_exclusive') : '')
    const chargeCover = httpsUrl(iconBadge.render_img || iconBadge.icon || blocked?.cover || '')
    const chargeHint = pickText(
      blocked?.hint,
      isChargeExclusive ? t('moments.charge_unlock_hint') : '',
    )

    const {
      descInherited,
      text: resolvedText,
    } = resolveMomentTextSources({
      archiveText: pickText(archive.desc),
      articleText: pickText(article.desc),
      commonText: pickText(common.desc),
      dynamicText: normalizeDescText(dynamic.desc),
      isVideo,
      opusText: pickText(
        opus.summary?.text,
        typeof opus.summary === 'string' ? opus.summary : '',
      ),
    })
    let text = resolvedText
    // 视频继承简介只保留纯文本元数据；不能把简介节点冒充用户正文。
    const richText = descInherited
      ? []
      : extractRichTextSegments(
          opus.summary?.rich_text_nodes,
          isVideo ? undefined : dynamic.desc?.rich_text_nodes,
        )

    // 充电未解锁：列表往往无 desc/major，用提示文案顶上
    if (!text && isChargeExclusive)
      text = chargeHint || t('moments.charge_exclusive_moment')

    const additionalKind = classifyMomentAdditional(additional.type)
    const isVoteAdditional = additionalKind === 'vote'
    let additionalView = additional.type
      ? {
          title: pickText(additionalCard.head_text, additionalCard.title, additionalCard.desc?.text),
          desc: pickText(
            typeof additionalCard.desc1 === 'string' ? additionalCard.desc1 : additionalCard.desc1?.text,
            typeof additionalCard.desc2 === 'string' ? additionalCard.desc2 : additionalCard.desc2?.text,
            additionalCard.desc,
          ),
          cover: httpsUrl(additionalCard.cover || additionalCard.icon || ''),
          action: getAdditionalActionText(
            additionalCard.button,
            additionalKind === 'reservation',
          ),
          url: httpsUrl(additionalCard.jump_url || additionalCard.button?.jump_url || ''),
          isUpRecommendation: additional.type === 'ADDITIONAL_TYPE_UP_RCMD'
            || pickText(additionalCard.head_text, additionalCard.title) === 'UP主的推荐',
          isVideoReservation: additionalKind === 'reservation'
            && Number(additionalCard.button?.type) === 1,
          isLiveReservation: additionalKind === 'reservation'
            && Number(additionalCard.button?.type) === 2,
          isVote: isVoteAdditional,
          voteId: isVoteAdditional ? String(additionalCard.vote_id || '') : '',
          voteEndTime: isVoteAdditional ? Number(additionalCard.end_time) || 0 : 0,
          reservationId: additionalKind === 'reservation'
            ? String(additionalCard.rid || '')
            : '',
          reservationTotal: Math.max(0, Number(additionalCard.reserve_total) || 0),
          isReserved: additionalKind === 'reservation'
            && Number(additionalCard.button?.status) === 2,
        }
      : undefined

    if (isVoteAdditional && additionalView) {
      const voteStatus = resolveMomentVoteStatus(additionalView.voteEndTime, Date.now() / 1000)
      const status = voteStatus === 'ended'
        ? t('moments.vote_ended')
        : voteStatus === 'ongoing'
          ? t('moments.vote_ongoing')
          : t('moments.vote_status_unknown')
      additionalView.desc = [additionalView.desc, status].filter(Boolean).join(' · ')
    }

    // 未解锁充电：构造充电卡片附加区（列表没有 additional 时）
    if (!additionalView && isChargeExclusive && (blocked?.buttonUrl || chargeBadge)) {
      additionalView = {
        title: chargeBadge || t('moments.charge_exclusive'),
        desc: chargeHint,
        // 充电档位区不展示小图标
        cover: '',
        action: blocked?.buttonText || t('moments.go_charge'),
        url: blocked?.buttonUrl || '',
        isUpRecommendation: false,
        isVideoReservation: false,
        isLiveReservation: false,
        isVote: false,
        voteId: '',
        voteEndTime: 0,
        reservationId: '',
        reservationTotal: 0,
        isReserved: false,
      }
    }

    // 图文：DRAW / 带图 opus，不含视频、合集、直播与专栏
    const isArticleMajor = item.type === 'DYNAMIC_TYPE_ARTICLE'
      || major?.type === 'MAJOR_TYPE_ARTICLE'
      || Number(basic?.comment_type) === 12
    const isDraw = !isRegularVideo && !isUgcSeason && !live && !isArticleMajor && (
      item.type === 'DYNAMIC_TYPE_DRAW'
      || major?.type === 'MAJOR_TYPE_DRAW'
      || drawItems.length > 0
      || opusImageItems.length > 0
    )

    return {
      title: pickText(live?.title, opus.title, archive.title, article.title, common.title),
      text,
      descInherited,
      richText,
      images: [...images, ...(cover ? [httpsUrl(cover)] : [])].filter(Boolean).filter((url: string, index: number, list: string[]) => list.indexOf(url) === index),
      imageRatios: [
        ...imageRatios,
        ...(cover && !images.includes(httpsUrl(cover)) ? [null] : []),
      ],
      isVideo,
      isRegularVideo,
      isUgcSeason,
      isDraw,
      isPgc,
      isLive: Boolean(live),
      isChargeExclusive,
      chargeBadge,
      chargeHint,
      chargeCover,
      roomId: live?.room_id ? Number(live.room_id) : undefined,
      duration: archive.duration_text || '',
      aid: archive.aid || undefined,
      bvid: archive.bvid || undefined,
      epid: major.pgc?.epid || undefined,
      videoUrl: archive.jump_url ? httpsUrl(archive.jump_url.startsWith('//') ? `https:${archive.jump_url}` : archive.jump_url) : undefined,
      videoPlay: pickText(archive.stat?.play),
      videoDanmaku: pickText(archive.stat?.danmaku),
      mediaMeta: live
        ? liveArea
        : (isChargeExclusive ? (chargeBadge || t('moments.charge_exclusive')) : (archive.duration_text || article.label || '')),
      liveArea,
      livePopularity,
      additional: additionalView,
    }
  }

  function collectVideoPublicationTimes(items: DataItem[]) {
    return items.flatMap((item) => {
      const raw = item as any
      if (raw.type === 'DYNAMIC_TYPE_FORWARD')
        return []

      const author = raw.modules?.module_author
      const major = raw.modules?.module_dynamic?.major
      const archive = major?.archive || major?.ugc_season
      const time = Number(author?.pub_ts || 0) * 1000
      if (!archive || time <= 0)
        return []

      const mids = new Set<number | string>()
      if (author?.mid)
        mids.add(author.mid)
      if (Array.isArray(archive.coop_info)) {
        archive.coop_info.forEach((coop: any) => {
          if (coop?.mid)
            mids.add(coop.mid)
        })
      }

      return Array.from(mids, mid => ({ mid, time }))
    })
  }

  function mapMoment(item: DataItem): DisplayMoment {
    const raw = item as any
    const author = raw.modules?.module_author || {}
    const dynamic = raw.modules?.module_dynamic || {}
    const isForward = raw.type === 'DYNAMIC_TYPE_FORWARD' && raw.orig
    const contentRaw = isForward ? raw.orig : raw
    const content = getMomentContent(contentRaw)
    // 转发内嵌视频：archive / 合集订阅 ugc_season 均可作为摘要来源
    const forwardedMajor = isForward
      ? contentRaw.modules?.module_dynamic?.major
      : undefined
    const forwardedArchive = forwardedMajor?.archive || forwardedMajor?.ugc_season
    // 转发时作者侧也可能挂充电角标
    const selfContent = isForward ? getMomentContent(raw) : content
    const forwardedAuthor = contentRaw.modules?.module_author || {}
    const id = raw.id_str || raw.id || `${author.mid}-${author.pub_ts}`
    const text = isForward
      ? (normalizeDescText(dynamic.desc) || t('moments.forwarded_moment'))
      : content.text
    const richText = isForward
      ? extractRichTextSegments(dynamic.desc?.rich_text_nodes)
      : content.richText
    const additional = content.additional || selfContent.additional
    const isChargeExclusive = content.isChargeExclusive || selfContent.isChargeExclusive
    const commentInteraction = raw.modules?.module_interaction?.items?.find(
      (interaction: any) => Number(interaction?.type) === 1,
    )?.desc
    const hotCommentText = normalizeDescText(commentInteraction)
    const hotCommentRichText = extractRichTextSegments(commentInteraction?.rich_text_nodes)
    const rawForwardedJumpUrl = String(
      contentRaw.modules?.module_dynamic?.major?.opus?.jump_url
      || contentRaw.modules?.module_dynamic?.major?.jump_url
      || '',
    )
    const forwardedJumpUrl = httpsUrl(
      rawForwardedJumpUrl.startsWith('//') ? `https:${rawForwardedJumpUrl}` : rawForwardedJumpUrl,
    )
    const forwardedJumpId = forwardedJumpUrl.match(/\/(?:opus|t)\/(\d+)/)?.[1] || ''
    const forwardedId = isForward
      ? String(contentRaw.id_str || contentRaw.id || forwardedJumpId || contentRaw.basic?.comment_id_str || '')
      : ''
    const forwardedUrl = forwardedJumpUrl || (forwardedId
      ? `https://www.bilibili.com/opus/${forwardedId}`
      : '')
    const forwardedIsArticle = Boolean(isForward && (
      contentRaw.type === 'DYNAMIC_TYPE_ARTICLE'
      || Number(contentRaw.basic?.comment_type) === 12
      || contentRaw.modules?.module_dynamic?.major?.type === 'MAJOR_TYPE_ARTICLE'
    ))

    return {
      id,
      author: {
        mid: String(author.mid || ''),
        name: author.name || t('moments.bilibili_user'),
        face: httpsUrl(author.face || ''),
      },
      publishedAt: Number(author.pub_ts || 0),
      title: content.title,
      text,
      descInherited: isForward ? false : content.descInherited,
      richText,
      // 转发卡片只展示原动态摘要，不能把原动态图片提升为外层卡片媒体。
      images: isForward || (isChargeExclusive && !content.isVideo) ? [] : content.images,
      imageRatios: isForward || (isChargeExclusive && !content.isVideo) ? [] : content.imageRatios,
      time: author.pub_time || '',
      likeCount: Number(raw.modules?.module_stat?.like?.count || 0),
      isLiked: raw.modules?.module_stat?.like?.status === true
        || Number(raw.modules?.module_stat?.like?.status) === 1,
      isLikeDisabled: Boolean(
        raw.modules?.module_stat?.like?.forbidden
        || raw.modules?.module_stat?.like?.disabled,
      ),
      commentCount: Number(raw.modules?.module_stat?.comment?.count || 0),
      forwardCount: resolveMomentForwardCount(id, raw.modules?.module_stat?.forward?.count),
      commentId: raw.basic?.comment_id_str ? String(raw.basic.comment_id_str) : undefined,
      commentType: Number(raw.basic?.comment_type) || undefined,
      hotComment: hotCommentText || hotCommentRichText.length
        ? {
            text: hotCommentText,
            richText: hotCommentRichText,
          }
        : undefined,
      url: `https://www.bilibili.com/opus/${id}`,
      // 转发视频仍然是“转发动态”；原视频由卡片内的独立视频摘要展示。
      isVideo: !isForward && content.isVideo,
      isRegularVideo: !isForward && content.isRegularVideo,
      isUgcSeason: !isForward && content.isUgcSeason,
      isDraw: !isForward && content.isDraw,
      isPgc: content.isPgc,
      isLive: content.isLive,
      isForward,
      isArticle: raw.type === 'DYNAMIC_TYPE_ARTICLE'
        || contentRaw.type === 'DYNAMIC_TYPE_ARTICLE'
        || Number(raw.basic?.comment_type) === 12
        || Number(contentRaw.basic?.comment_type) === 12
        || raw.modules?.module_dynamic?.major?.type === 'MAJOR_TYPE_ARTICLE'
        || contentRaw.modules?.module_dynamic?.major?.type === 'MAJOR_TYPE_ARTICLE',
      isUpRecommendation: Boolean(additional?.isUpRecommendation),
      isVideoReservation: Boolean(additional?.isVideoReservation),
      isLiveReservation: Boolean(additional?.isLiveReservation),
      isChargeExclusive,
      chargeBadge: content.chargeBadge || selfContent.chargeBadge,
      chargeHint: content.chargeHint || selfContent.chargeHint,
      chargeCover: content.chargeCover || selfContent.chargeCover,
      mediaMeta: content.mediaMeta,
      liveArea: content.liveArea,
      livePopularity: content.livePopularity,
      roomId: content.roomId,
      duration: content.duration,
      videoPlay: content.videoPlay,
      videoDanmaku: content.videoDanmaku,
      aid: content.aid,
      bvid: content.bvid,
      videoUrl: content.videoUrl,
      additional,
      forward: isForward
        ? {
            id: forwardedId,
            url: forwardedUrl,
            authorMid: String(forwardedAuthor.mid || ''),
            isArticle: forwardedIsArticle,
            author: forwardedAuthor.name || t('moments.original_author'),
            title: content.title,
            text: content.text,
            fallback: content.isChargeExclusive
              ? (content.chargeBadge || t('moments.charge_exclusive_moment'))
              : content.isLive
                ? t('moments.live_moment')
                : content.isVideo
                  ? t('moments.video_moment')
                  : content.images.length
                    ? t('moments.image_moment')
                    : content.text
                      ? t('moments.text_moment')
                      : t('moments.original_moment'),
            // 转发动态的原图只放在嵌套卡片中，避免被提升成外层动态媒体。
            images: !content.isVideo && !content.isLive && !content.isChargeExclusive
              ? content.images
              : [],
            imageRatios: !content.isVideo && !content.isLive && !content.isChargeExclusive
              ? content.imageRatios
              : [],
            video: forwardedArchive
              ? {
                  title: pickText(forwardedArchive.title, content.title),
                  cover: httpsUrl(forwardedArchive.cover || content.images[0] || ''),
                  duration: pickText(forwardedArchive.duration_text, content.duration),
                  play: pickText(forwardedArchive.stat?.play, content.videoPlay),
                  danmaku: pickText(forwardedArchive.stat?.danmaku, content.videoDanmaku),
                  url: content.videoUrl
                    || (content.bvid
                      ? `https://www.bilibili.com/video/${content.bvid}`
                      : content.aid
                        ? `https://www.bilibili.com/video/av${content.aid}`
                        : ''),
                  aid: content.aid,
                  bvid: content.bvid,
                }
              : undefined,
          }
        : undefined,
    }
  }
  return { mapMoment, collectVideoPublicationTimes }
}
