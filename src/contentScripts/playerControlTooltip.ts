const PLAYER_TOOLTIP_CLASS = 'bewly-player-tooltip'

export function createPlayerControlTooltip(label: string): HTMLSpanElement {
  const tooltip = document.createElement('span')
  tooltip.className = PLAYER_TOOLTIP_CLASS
  tooltip.setAttribute('aria-hidden', 'true')
  tooltip.textContent = label
  return tooltip
}

export function updatePlayerControlTooltip(control: HTMLElement, label: string): void {
  const tooltip = control.querySelector<HTMLElement>(`.${PLAYER_TOOLTIP_CLASS}`)
  if (tooltip && tooltip.textContent !== label)
    tooltip.textContent = label
}
