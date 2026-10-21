import { createDanmakuSenderComparator, DANMAKU_SENDER_ORDER_BUTTON_CLASS, DANMAKU_SENDER_ORDER_CLASS, isNativeDanmakuList } from '~/utils/danmakuSenderOrder'

const FUNCTION_ROW_SUFFIX = '-dm-function'

/**
 * Bpx sorts its danmaku list in place from a header click (`order()` calls
 * `allDm.sort`) and then refreshes the long list, but the list instance is
 * private. Sorting by sender therefore clicks the send-time header while that
 * one danmaku-array sort uses the sender comparator. The clicks leave that
 * column reversed, so a later native header click still starts ascending.
 */
export function sortNativeDanmakuListBySender(functionRow: Element | null | undefined) {
  const base = Array.from(functionRow?.classList ?? []).find(name => name.endsWith(FUNCTION_ROW_SUFFIX))
  const carrier = functionRow?.querySelector<HTMLElement>('[data-action="date"]')
  if (!functionRow || !base || !carrier)
    return false
  const prefix = base.slice(0, -FUNCTION_ROW_SUFFIX.length)
  const rotateClass = `${prefix}-order-rotate`
  const carrierClass = `${prefix}-order-date`
  // A second click on the active sender order reverses it.
  const positive = !(functionRow.classList.contains(DANMAKU_SENDER_ORDER_CLASS) && !functionRow.classList.contains(rotateClass))

  let sorted = false
  const nativeSort = Array.prototype.sort
  // eslint-disable-next-line no-extend-native -- restored before this function returns; see above.
  Array.prototype.sort = function (this: unknown[], comparator?: (a: unknown, b: unknown) => number) {
    if (!isNativeDanmakuList(this))
      return Reflect.apply(nativeSort, this, [comparator])
    sorted = true
    return Reflect.apply(nativeSort, this, [createDanmakuSenderComparator(this, positive)])
  } as typeof nativeSort
  try {
    let clicks = 0
    do {
      carrier.click()
      clicks++
    } while (clicks < 2 && !(functionRow.classList.contains(carrierClass) && functionRow.classList.contains(rotateClass)))
  }
  finally {
    // eslint-disable-next-line no-extend-native -- restores the original.
    Array.prototype.sort = nativeSort
  }
  if (!sorted)
    return false
  functionRow.className = [base, DANMAKU_SENDER_ORDER_CLASS, ...(positive ? [] : [rotateClass])].join(' ')
  return true
}

/** The header that holds the playback page's sender button. */
export function sortPlaybackDanmakuListBySender() {
  return sortNativeDanmakuListBySender(document.querySelector(`.${DANMAKU_SENDER_ORDER_BUTTON_CLASS}`)?.parentElement)
}
