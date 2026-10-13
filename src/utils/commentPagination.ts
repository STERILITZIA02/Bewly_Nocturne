/**
 * A successful empty page ends pagination even when moderation leaves a stale
 * count. Only count describes root pages; acount includes nested replies.
 */
export function resolveCommentPagination(data: Record<string, unknown>, itemCount: number, requestedPage: number, requestedSize: number) {
  const page = data.page && typeof data.page === 'object' ? data.page as Record<string, unknown> : {}
  const cursor = data.cursor && typeof data.cursor === 'object' ? data.cursor as Record<string, unknown> : {}
  const positive = (value: unknown, fallback: number) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback
  const pageNumber = positive(page.num, requestedPage)
  const pageSize = positive(page.size, requestedSize)
  const count = typeof page.count === 'number' && Number.isSafeInteger(page.count) && page.count >= 0 ? page.count : undefined
  const end = cursor.is_end
  const hasMore = itemCount > 0 && (end === true || end === 1
    ? false
    : end === false || end === 0
      ? true
      : count !== undefined ? pageNumber * pageSize < count : itemCount >= pageSize)
  return { hasMore, nextPage: pageNumber + 1 }
}
