/** Run on raw storage/import data, before defaults hide whether the new key exists. */
export function migrateSidebarCoverSetting(raw: Record<string, unknown>): Record<string, unknown> {
  if (!Object.hasOwn(raw, 'enableFavoriteCoverBlur'))
    return raw
  const { enableFavoriteCoverBlur, ...next } = raw
  if (!Object.hasOwn(raw, 'enableSidebarCoverBlur') && typeof enableFavoriteCoverBlur === 'boolean')
    next.enableSidebarCoverBlur = enableFavoriteCoverBlur
  return next
}
