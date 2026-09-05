import { applyVideoTimeFilter, dedupeByKey } from './utils/searchHelpers'

export function mergeSections(previous: any, incoming: any, options: { appendVideoOnly?: boolean } = {}) {
  const prevSections = Array.isArray(previous?.result) ? previous.result : []
  const incomingSections = Array.isArray(incoming?.result) ? incoming.result : []
  const sectionMap = new Map<string, any>()

  prevSections.forEach((section: any) => {
    const data = Array.isArray(section?.data)
      ? dedupeSectionItems(section.result_type, [...section.data])
      : section.data
    sectionMap.set(section.result_type, { ...section, data })
  })

  incomingSections.forEach((section: any) => {
    if (options.appendVideoOnly && section?.result_type !== 'video')
      return

    const data = Array.isArray(section?.data) ? [...section.data] : []
    if (sectionMap.has(section.result_type)) {
      const existing = sectionMap.get(section.result_type)
      const merged = Array.isArray(existing?.data) ? [...existing.data, ...data] : data
      sectionMap.set(section.result_type, {
        ...existing,
        ...section,
        data: dedupeSectionItems(section.result_type, merged),
      })
    }
    else {
      sectionMap.set(section.result_type, {
        ...section,
        data: dedupeSectionItems(section.result_type, data),
      })
    }
  })

  const resultSections = Array.from(sectionMap.values()).map((section: any) => {
    if (section?.result_type === 'video' && Array.isArray(section.data)) {
      return { ...section, data: applyVideoTimeFilter(section.data) }
    }
    return section
  })

  return { ...previous, ...incoming, result: resultSections }
}

function dedupeSectionItems(type: string, items: any[]): any[] {
  return dedupeByKey(items, item => getSectionItemKey(type, item))
}

function getSectionItemKey(type: string, item: any): string {
  switch (type) {
    case 'video':
      return String(item?.aid ?? item?.id ?? item?.bvid ?? JSON.stringify(item))
    case 'media_bangumi':
    case 'media_ft':
      return String(item?.season_id ?? item?.media_id ?? item?.id ?? JSON.stringify(item))
    case 'bili_user':
      return String(item?.mid ?? JSON.stringify(item))
    case 'article':
      return String(item?.id ?? JSON.stringify(item))
    case 'live_room':
      return String(item?.roomid ?? item?.id ?? JSON.stringify(item))
    default:
      return String(item?.id ?? item?.aid ?? item?.bvid ?? item?.mid ?? JSON.stringify(item))
  }
}
