import { selectors } from '~/utils/bewlyWidescreen/constants'
import { t } from '~/utils/bewlyWidescreen/labels'
import { findFirst } from '~/utils/bewlyWidescreen/nativeDom'
import type { BewlyWidescreenState } from '~/utils/bewlyWidescreen/types'

export function syncDescription(currentState: BewlyWidescreenState) {
  const { descriptionSlot } = currentState
  const description = findFirst(selectors.description, descriptionSlot)
  if (!description) {
    descriptionSlot.classList.add('is-empty')
    const toggleButton = descriptionSlot.querySelector<HTMLButtonElement>('.bewly-widescreen-description-toggle')
    if (toggleButton && !toggleButton.hidden)
      toggleButton.hidden = true
    return
  }

  const basicDescription = description.querySelector<HTMLElement>('.basic-desc-info') || description
  let toggleButton = descriptionSlot.querySelector<HTMLButtonElement>('.bewly-widescreen-description-toggle')

  if (!toggleButton) {
    toggleButton = document.createElement('button')
    toggleButton.type = 'button'
    toggleButton.className = 'bewly-widescreen-description-toggle'

    const onToggle = () => {
      currentState.descriptionExpanded = !currentState.descriptionExpanded
      syncDescription(currentState)
    }

    toggleButton.addEventListener('click', onToggle)
    descriptionSlot.appendChild(toggleButton)
    currentState.descriptionCleanup = () => {
      toggleButton?.removeEventListener('click', onToggle)
      toggleButton?.remove()
      descriptionSlot.classList.remove('is-collapsed', 'is-expanded', 'is-empty')
    }
  }

  descriptionSlot.classList.remove('is-collapsed', 'is-expanded')
  const lineHeight = Number.parseFloat(getComputedStyle(basicDescription).lineHeight) || 20
  const subtitleList = description.querySelector<HTMLElement>('.subtitle-maker-list')
  const descriptionText = basicDescription.textContent?.replace(/\s+/g, ' ').trim() || ''
  const hasDescription = !!descriptionText && !/^[-–—]+$/.test(descriptionText)
  const hasSubtitle = !!subtitleList?.childElementCount
  const hasContent = hasDescription || hasSubtitle
  const canExpand = hasContent && (basicDescription.scrollHeight > lineHeight * 2 + 1
    || hasSubtitle)

  if (!hasContent || !canExpand)
    currentState.descriptionExpanded = false

  descriptionSlot.classList.toggle('is-empty', !hasContent)
  const shouldHideToggle = !hasContent || !canExpand
  if (toggleButton.hidden !== shouldHideToggle)
    toggleButton.hidden = shouldHideToggle
  const nextLabel = currentState.descriptionExpanded ? t('widescreen.collapse') : t('widescreen.expand_more')
  if (toggleButton.textContent !== nextLabel)
    toggleButton.textContent = nextLabel
  const ariaExpanded = String(canExpand && currentState.descriptionExpanded)
  if (toggleButton.getAttribute('aria-expanded') !== ariaExpanded)
    toggleButton.setAttribute('aria-expanded', ariaExpanded)
  descriptionSlot.classList.toggle('is-collapsed', canExpand && !currentState.descriptionExpanded)
  descriptionSlot.classList.toggle('is-expanded', canExpand && currentState.descriptionExpanded)
}
