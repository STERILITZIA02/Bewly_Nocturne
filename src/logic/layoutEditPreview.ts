export interface LayoutPreviewSettingAdapter<T = unknown> {
  get: () => T
  set: (value: T) => void
}

export interface LayoutPreviewSnapshot<T = unknown> {
  settingId: string
  before: T
  after: T
}

export interface LayoutPreviewController {
  begin: (settingId: string) => boolean
  update: (value: unknown) => boolean
  commit: () => boolean
  cancel: () => boolean
  getPreviewValue: (settingId: string) => unknown
  getSnapshot: () => LayoutPreviewSnapshot | undefined
  getSnapshots: () => LayoutPreviewSnapshot[]
}

function clonePreviewValue<T>(value: T): T {
  if (typeof value !== 'object' || value == null)
    return value

  try {
    return structuredClone(value)
  }
  catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

export function createLayoutPreviewController(
  resolveSetting: (settingId: string) => LayoutPreviewSettingAdapter | undefined,
): LayoutPreviewController {
  const previews = new Map<string, {
    adapter: LayoutPreviewSettingAdapter
    settingId: string
    before: unknown
    after: unknown
  }>()
  let active: string | undefined

  function cancel() {
    if (!previews.size)
      return false
    previews.clear()
    active = undefined
    return true
  }

  return {
    begin(settingId) {
      if (previews.has(settingId)) {
        active = settingId
        return true
      }
      const adapter = resolveSetting(settingId)
      if (!adapter)
        return false

      const before = clonePreviewValue(adapter.get())
      previews.set(settingId, {
        adapter,
        settingId,
        before,
        after: clonePreviewValue(before),
      })
      active = settingId
      return true
    },
    update(value) {
      const preview = active && previews.get(active)
      if (!preview)
        return false
      preview.after = clonePreviewValue(value)
      return true
    },
    commit() {
      if (!previews.size)
        return false
      const transactions = [...previews.values()]
      previews.clear()
      active = undefined
      for (const transaction of transactions) {
        if (!Object.is(transaction.after, transaction.before))
          transaction.adapter.set(clonePreviewValue(transaction.after))
      }
      return true
    },
    cancel,
    getPreviewValue(settingId) {
      return clonePreviewValue(previews.get(settingId)?.after)
    },
    getSnapshot() {
      const preview = active && previews.get(active)
      if (!preview)
        return undefined
      return {
        settingId: preview.settingId,
        before: clonePreviewValue(preview.before),
        after: clonePreviewValue(preview.after),
      }
    },
    getSnapshots() {
      return [...previews.values()].map(({ settingId, before, after }) => ({ settingId, before: clonePreviewValue(before), after: clonePreviewValue(after) }))
    },
  }
}
