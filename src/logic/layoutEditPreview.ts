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
  let active: {
    adapter: LayoutPreviewSettingAdapter
    settingId: string
    before: unknown
    after: unknown
  } | undefined

  function cancel() {
    if (!active)
      return false
    active = undefined
    return true
  }

  return {
    begin(settingId) {
      cancel()
      const adapter = resolveSetting(settingId)
      if (!adapter)
        return false

      const before = clonePreviewValue(adapter.get())
      active = {
        adapter,
        settingId,
        before,
        after: clonePreviewValue(before),
      }
      return true
    },
    update(value) {
      if (!active)
        return false
      active.after = clonePreviewValue(value)
      return true
    },
    commit() {
      if (!active)
        return false

      const transaction = active
      active = undefined
      if (!Object.is(transaction.after, transaction.before))
        transaction.adapter.set(clonePreviewValue(transaction.after))
      return true
    },
    cancel,
    getPreviewValue(settingId) {
      return active?.settingId === settingId
        ? clonePreviewValue(active.after)
        : undefined
    },
    getSnapshot() {
      if (!active)
        return undefined
      return {
        settingId: active.settingId,
        before: clonePreviewValue(active.before),
        after: clonePreviewValue(active.after),
      }
    },
  }
}
