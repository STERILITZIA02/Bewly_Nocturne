interface HistoryRow { view_at: number, history: { oid: number, business: string } }

/** Fixtures carry the same cursor contract as /history/cursor, including its empty tail. */
export function historyResponse<T extends HistoryRow>(list: T[]) {
  const last = list.at(-1)
  return { code: 0, data: { list, cursor: { max: last?.history.oid ?? 0, view_at: last?.view_at ?? 0, business: last?.history.business ?? '', ps: 20 } } }
}

export function historySearchResponse<T>(list: T[], pn: number, hasMore: boolean) {
  return { code: 0, data: { list, has_more: hasMore, page: { pn, ps: 20, total: hasMore ? (pn + 1) * 20 : (pn - 1) * 20 + list.length } } }
}
