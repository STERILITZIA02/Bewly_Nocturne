import { createLoadingRingElement } from '~/utils/loadingRing'

const PREFIX = 'bewly-widescreen-loading-skeleton'

function createElement(className: string, ...children: Element[]) {
  const element = document.createElement('div')
  element.className = className
  element.append(...children)
  return element
}

function createBlock(className: string) {
  const block = document.createElement('span')
  block.className = className
  block.setAttribute('data-bew-skeleton', '')
  return block
}

function createLoadingSkeletonBlock(modifier: string) {
  return createBlock(`${PREFIX}-block ${modifier}`)
}

function repeat(count: number, create: () => Element) {
  return Array.from({ length: count }, create)
}

/**
 * The recommendations' two-column video cards (styles: cardLayout.ts,
 * playbackRecommendationSkeleton), shared by the loading overlay and the
 * overview panel while its list loads.
 */
export function createRecommendationSkeleton(count = 6) {
  const block = 'bewly-widescreen-skeleton-recommendations'
  const grid = createElement(block, createBlock(`${block}__heading`))
  grid.setAttribute('aria-hidden', 'true')
  for (let index = 0; index < count; index++) {
    grid.append(createElement(
      `${block}__card`,
      createBlock(`${block}__cover`),
      createBlock(`${block}__line`),
      createBlock(`${block}__line ${block}__line--short`),
      createBlock(`${block}__caption`),
    ))
  }
  return grid
}

/** A floating glass control of the Bewly header: a circle or a capsule of icon slots. */
function createTopBarControl(slots: number, modifier = '') {
  return createElement(
    `${PREFIX}-top-bar-control ${modifier}`.trim(),
    ...repeat(slots, () => createElement(`${PREFIX}-top-bar-slot`, createLoadingSkeletonBlock(`${PREFIX}-icon`))),
  )
}

/** Logo, search and history navigation on the left; the page group over the video's top-right corner. */
function createTopBarSkeleton() {
  return createElement(
    `${PREFIX}-top-bar`,
    createElement(
      `${PREFIX}-top-bar-start`,
      createTopBarControl(1, `${PREFIX}-top-bar-control--logo`),
      createTopBarControl(1),
      createTopBarControl(2),
    ),
    createTopBarControl(4, `${PREFIX}-top-bar-tools`),
  )
}

/** The floating control card: progress, the player's controls, then the app and danmaku controls. */
function createControlsSkeleton() {
  const circle = () => createLoadingSkeletonBlock(`${PREFIX}-circle`)
  const label = () => createLoadingSkeletonBlock(`${PREFIX}-control-label`)
  const qualityLabel = createLoadingSkeletonBlock(`${PREFIX}-control-label ${PREFIX}-control-label--wide`)
  const playerControls = createElement(
    `${PREFIX}-player-controls`,
    ...repeat(3, circle),
    createLoadingSkeletonBlock(`${PREFIX}-time`),
    createElement(`${PREFIX}-spacer`),
    // Listen, audio, then quality, speed and subtitles, then the icon buttons.
    ...repeat(2, circle),
    qualityLabel,
    ...repeat(2, label),
    ...repeat(5, circle),
  )
  const danmakuControls = createElement(
    `${PREFIX}-danmaku-controls`,
    // The app's controls, a divider, the two danmaku toggles.
    ...repeat(4, circle),
    createElement(`${PREFIX}-divider`),
    ...repeat(2, circle),
    createElement(`${PREFIX}-input`, createLoadingSkeletonBlock(`${PREFIX}-input-field`), createLoadingSkeletonBlock(`${PREFIX}-send`)),
  )
  return createElement(
    `${PREFIX}-controls`,
    createLoadingSkeletonBlock(`${PREFIX}-progress`),
    playerControls,
    danmakuControls,
  )
}

function createTabsSkeleton() {
  return createElement(
    `${PREFIX}-tabs`,
    ...repeat(3, () => createElement(
      `${PREFIX}-tab`,
      createLoadingSkeletonBlock(`${PREFIX}-tab-icon`),
      createLoadingSkeletonBlock(`${PREFIX}-tab-label`),
    )),
  )
}

function line(modifier = '') {
  return createLoadingSkeletonBlock(`${PREFIX}-line ${modifier}`.trim())
}

/** The title and the card's fold chevron at its top-right corner. */
function createInfoHead(lines: number) {
  return createElement(
    `${PREFIX}-info-head`,
    createElement(`${PREFIX}-title`, ...repeat(lines, () => line(`${PREFIX}-line--title`))),
    createLoadingSkeletonBlock(`${PREFIX}-toggle`),
  )
}

/** Five equal action pills (and bangumi's square "more"). */
function createActionsSkeleton(more: boolean) {
  const actions = createElement(`${PREFIX}-actions`, ...repeat(more ? 6 : 5, () => createLoadingSkeletonBlock(`${PREFIX}-action`)))
  actions.toggleAttribute('data-more', more)
  return actions
}

/** A video: title, meta line, uploader with charge and follow, actions, description and tags. */
function createVideoInfoCard() {
  const owner = createElement(
    `${PREFIX}-owner`,
    createLoadingSkeletonBlock(`${PREFIX}-avatar`),
    line(`${PREFIX}-line--owner`),
    line(`${PREFIX}-line--owner-sign`),
    createLoadingSkeletonBlock(`${PREFIX}-owner-action`),
    createLoadingSkeletonBlock(`${PREFIX}-owner-action ${PREFIX}-owner-action--wide`),
  )
  return createElement(
    `${PREFIX}-sidebar-top`,
    createInfoHead(2),
    line(`${PREFIX}-line--meta`),
    owner,
    createActionsSkeleton(false),
    createElement(`${PREFIX}-description`, line(), line(`${PREFIX}-line--description-short`)),
    createElement(`${PREFIX}-tags`, ...repeat(4, () => createLoadingSkeletonBlock(`${PREFIX}-tag`))),
  )
}

/** A bangumi episode: its title, the poster beside the series, rating and buttons, then the actions. */
function createPgcInfoCard() {
  const media = createElement(
    `${PREFIX}-media`,
    createLoadingSkeletonBlock(`${PREFIX}-poster`),
    createElement(
      `${PREFIX}-media-info`,
      line(`${PREFIX}-line--series`),
      line(`${PREFIX}-line--meta`),
      line(),
      line(`${PREFIX}-line--description-short`),
      createElement(
        `${PREFIX}-media-buttons`,
        createLoadingSkeletonBlock(`${PREFIX}-owner-action`),
        createLoadingSkeletonBlock(`${PREFIX}-owner-action ${PREFIX}-owner-action--wide`),
      ),
    ),
  )
  return createElement(`${PREFIX}-sidebar-top`, createInfoHead(1), media, createActionsSkeleton(true))
}

export function createWidescreenLoadingSkeleton(pageKind: 'video' | 'pgc') {
  const ring = createLoadingRingElement()
  ring.classList.add(`${PREFIX}-player-mark`)
  const player = createElement(`${PREFIX}-player`, ring, createControlsSkeleton())

  // The column: its tabs, the info card, then the recommendations.
  const info = createElement(`${PREFIX}-info`, pageKind === 'pgc' ? createPgcInfoCard() : createVideoInfoCard())
  const sidebar = createElement(`${PREFIX}-sidebar`)
  sidebar.append(createTabsSkeleton(), info, createRecommendationSkeleton())

  const stage = createElement(`${PREFIX}-stage`)
  stage.setAttribute('aria-hidden', 'true')
  stage.append(player, sidebar, createTopBarSkeleton())
  return stage
}
