import { ACTION_ROLL_CLASS } from '~/utils/bewlyWidescreen/constants'
import { t } from '~/utils/bewlyWidescreen/labels'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'
import { getMotionDuration } from '~/utils/motionTiming'
import { prefersReducedMotion } from '~/utils/reducedMotion'
import { springTiming } from '~/utils/spring'

const FACE_CLASS = `${ACTION_ROLL_CLASS}__face`

/**
 * Each chip's native count, and the action its click takes, on video and
 * bangumi pages; a chip already used (liked, coined, collected) names that
 * state instead. Bilibili's video share chip swaps its own count for
 * "点击复制" while it or its popover is hovered (the site is Chinese only);
 * that text is never the count.
 */
const CHIPS = [
  { chip: '.video-like', info: '.video-like-info', label: 'widescreen.action_like', doneLabel: 'widescreen.action_liked' },
  { chip: '.video-coin', info: '.video-coin-info', label: 'widescreen.action_coin', doneLabel: 'widescreen.action_coined' },
  { chip: '.video-fav', info: '.video-fav-info', label: 'widescreen.action_favorite', doneLabel: 'widescreen.action_favorited' },
  { chip: '.video-share-wrap', info: '.video-share-info', label: 'widescreen.action_copy_link', nativeHoverText: '点击复制' },
  // Bangumi's toolbar; its share label holds the count over "copy link".
  { chip: '.toolbar-left > .like', info: '.info-text', label: 'widescreen.action_like', doneLabel: 'widescreen.action_liked' },
  { chip: '.toolbar-left > .coin', info: '.info-text', label: 'widescreen.action_coin', doneLabel: 'widescreen.action_coined' },
  { chip: '.toolbar-left > .favorite', info: '.info-text', label: 'widescreen.action_favorite', doneLabel: 'widescreen.action_favorited' },
  { chip: '.toolbar-left > .share', info: '.info-text', count: '.flow-text-1', label: 'widescreen.action_copy_link' },
] as const

/** Bilibili's used-chip classes (video and bangumi). */
const DONE_CHIP_SELECTOR = '.on, .liked, .collected'

type ChipKind = typeof CHIPS[number]

export interface ActionRoll {
  kind: ChipKind
  chip: HTMLElement
  roller: HTMLElement
  count: string
  hovered: boolean
}

/*
 * The like, coin, collect and share chips show their count; on hover the
 * count rolls up and out while the action's name (or, once used, its state:
 * 已点赞) rolls in from below, like a wheel, and rolls back down when the
 * pointer leaves (user-specified). A state that changes under the pointer
 * rolls to its new name (syncActionRolls on the chip's class change). One
 * line of text is shown at a time: Bilibili's own label stays in the DOM, as
 * the count's source, but is hidden (layout.ts). The chip's width springs to
 * the new text, taking the room from the row's other chips.
 */

function readCount(roll: ActionRoll) {
  const info = roll.chip.querySelector(roll.kind.info)
  const source = info && 'count' in roll.kind ? info.querySelector(roll.kind.count) : info
  // Two children: Bilibili's share label is mid-swap.
  if (!source || source.childElementCount > 1)
    return
  const text = source.textContent?.trim() ?? ''
  if ('nativeHoverText' in roll.kind && text === roll.kind.nativeHoverText)
    return
  roll.count = text
}

function getHoverLabel({ kind, chip }: ActionRoll) {
  return t('doneLabel' in kind && chip.matches(DONE_CHIP_SELECTOR) ? kind.doneLabel : kind.label)
}

function show(roll: ActionRoll, up: boolean) {
  const text = roll.hovered ? getHoverLabel(roll) : roll.count
  const { roller } = roll
  const current = roller.lastElementChild as HTMLElement | null
  if (current?.textContent === text)
    return

  // Reads first, then writes: one layout for the new text's width.
  const { width: from, height } = roller.getBoundingClientRect()
  const face = document.createElement('span')
  face.className = FACE_CLASS
  face.textContent = text
  roller.append(face)
  const to = face.getBoundingClientRect().width
  const animate = current && !prefersReducedMotion()
  const seconds = getMotionDuration(getComputedStyle(roller), '--bew-duration-normal') / 1000
  // The shown text leaves from where it is drawn now, if it was still rolling in.
  const leaving = animate ? getComputedStyle(current) : undefined
  const leaveFrom = leaving && { translate: leaving.translate === 'none' ? '0 0' : leaving.translate, opacity: leaving.opacity }

  roller.getAnimations().forEach(animation => animation.cancel())
  roller.style.width = `${to}px`
  if (!current || !leaveFrom) {
    while (roller.firstElementChild !== face)
      roller.firstElementChild?.remove()
    return
  }

  const { duration, easing } = springTiming(seconds, height)
  current.getAnimations().forEach(animation => animation.cancel())
  current.setAttribute('aria-hidden', 'true')
  const shift = up ? -100 : 100
  current.animate([leaveFrom, { translate: `0 ${shift}%`, opacity: 0 }], { duration, easing, fill: 'forwards' })
    .onfinish = () => current.remove()
  face.animate([{ translate: `0 ${-shift}%`, opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration, easing })
  if (Math.abs(to - from) >= 0.5)
    roller.animate([{ width: `${from}px` }, { width: `${to}px` }], springTiming(seconds, Math.abs(to - from)))
}

function createRoll(currentState: BewlyWidescreenState, kind: ChipKind, chip: HTMLElement, info: Element): ActionRoll {
  const roller = document.createElement('span')
  roller.className = ACTION_ROLL_CLASS
  info.after(roller)
  const roll: ActionRoll = { kind, chip, roller, count: '', hovered: false }
  const hover = (hovered: boolean) => (event: PointerEvent) => {
    if (event.pointerType === 'touch')
      return
    roll.hovered = hovered
    if (!hovered)
      readCount(roll)
    show(roll, hovered)
  }
  currentState.actionRollEvents ??= new AbortController()
  const { signal } = currentState.actionRollEvents
  chip.addEventListener('pointerenter', hover(true), { signal })
  chip.addEventListener('pointerleave', hover(false), { signal })
  return roll
}

/** Gives each chip its roller, and rolls a count that Bilibili changed. */
export function syncActionRolls(currentState: BewlyWidescreenState) {
  const rolls = currentState.actionRolls ??= new Map()
  for (const [chip, roll] of rolls) {
    if (!chip.isConnected || !roll.roller.isConnected) {
      roll.roller.remove()
      rolls.delete(chip)
    }
  }
  for (const kind of CHIPS) {
    const chip = currentState.toolbarSlot.querySelector<HTMLElement>(kind.chip)
    const info = chip?.querySelector(kind.info)
    if (!chip || !info)
      continue
    let roll = rolls.get(chip)
    if (!roll) {
      roll = createRoll(currentState, kind, chip, info)
      rolls.set(chip, roll)
    }
    readCount(roll)
    show(roll, true)
  }
}

/** The rollers' own changes: their text faces, or a roller put in place. */
export function isActionRollMutation(record: MutationRecord) {
  const target = record.target instanceof Element ? record.target : record.target.parentElement
  if (target?.closest(`.${ACTION_ROLL_CLASS}`))
    return true
  const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)]
  return nodes.length > 0 && nodes.every(node => node instanceof Element && node.classList.contains(ACTION_ROLL_CLASS))
}

export function clearActionRolls(currentState: BewlyWidescreenState) {
  currentState.actionRollEvents?.abort()
  currentState.actionRollEvents = undefined
  currentState.actionRolls?.forEach(roll => roll.roller.remove())
  currentState.actionRolls = undefined
}
