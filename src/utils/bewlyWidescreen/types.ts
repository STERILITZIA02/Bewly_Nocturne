import type { Data as VideoInfoData } from '~/models/video/videoInfo'
import type { ActionRoll } from '~/utils/bewlyWidescreen/actionRolls'
import type { WidescreenDisplayMode, WidescreenRect, WidescreenZoomFrame } from '~/utils/bewlyWidescreenPolicy'

export type BewlyWidescreenTab = 'overview' | 'comment' | 'danmaku'

export interface MovedNode {
  node: HTMLElement
  placeholder: HTMLElement
  originalParent: Node
}

export interface WidescreenSidebarReadiness {
  overview: boolean
  comment: boolean
  danmaku: boolean
  playlist: boolean
  complete: boolean
}

export interface CommentPrewarmState {
  root: HTMLElement
  styleAttribute: string | null
}

/**
 * One pane ⇄ fill zoom. The player already holds the target layout; the frames
 * map that layout back to where it was painted. Kept so a reversal can start
 * from the exact frame on screen.
 */
export interface WidescreenZoom {
  mode: WidescreenDisplayMode
  layout: WidescreenRect
  /** Video width inside `layout`, unscaled. */
  layoutContentWidth: number
  from: WidescreenZoomFrame
  to: WidescreenZoomFrame
  /** Transform only, so it runs on the compositor through main-thread work. */
  motion: Animation
  /** The clip, which only the main thread can animate. */
  shape: Animation
}

export interface BewlyWidescreenState {
  exit: (options?: ExitBewlyWidescreenOptions) => void
  refreshSidebar: () => void
  hydrateSidebar: () => void
  root: HTMLElement
  backdrop: HTMLElement
  stage: HTMLElement
  playerEl: HTMLElement
  playerSlot: HTMLElement
  playerFrame: HTMLElement
  danmakuDock: HTMLElement
  sidebarEl: HTMLElement
  playlistSlot: HTMLElement
  sidebarTop: HTMLElement
  metadataSlot: HTMLElement
  upSlot: HTMLElement
  toolbarSlot: HTMLElement
  descriptionSlot: HTMLElement
  tagsSlot: HTMLElement
  panels: Record<BewlyWidescreenTab, HTMLElement>
  tabButtons: Record<BewlyWidescreenTab, HTMLButtonElement>
  /** The danmaku panel's view row (danmakuViews.ts) and the Bpx menu items it drives. */
  danmakuViews: HTMLElement
  danmakuViewItems?: HTMLElement[]
  danmakuViewsObserver?: MutationObserver
  playlistToggleButton: HTMLButtonElement
  movedNodes: MovedNode[]
  styleEl: HTMLStyleElement
  activeTab: BewlyWidescreenTab
  /** Card beside the columns, or the video alone filling the window. */
  displayMode: WidescreenDisplayMode
  sidebarPosition: 'left' | 'right'
  resizeObserver?: ResizeObserver
  mutationObserver?: MutationObserver
  playerStateObserver?: MutationObserver
  /** Shallow watch of the anchored player's ancestors for a native re-render. */
  playerAncestryObserver?: MutationObserver
  toolbarMutationObserver?: MutationObserver
  toolbarResizeObserver?: ResizeObserver
  metadataListener?: () => void
  resizeSyncFrame?: number
  lastPlayerResizeSignature?: string
  actionGeometryFrame?: number
  actionGeometryElements?: Set<HTMLElement>
  /** The like / coin / collect / share chips' rolling labels, by chip (actionRolls.ts). */
  actionRolls?: Map<HTMLElement, ActionRoll>
  actionRollEvents?: AbortController
  layoutEventCleanup?: () => void
  settingsWatchCleanup?: Array<() => void>
  sidebarHydrationTimer?: ReturnType<typeof setTimeout>
  /** Waits for a hidden page to show again before hydration resumes. */
  sidebarHydrationResumeCleanup?: () => void
  sidebarHydrationWarningShown?: boolean
  sidebarHydrationTimedOut?: boolean
  /** One native reload per hydration budget for a first comment page that never arrives. */
  commentListReloadRequested?: boolean
  sidebarReadyCleanup?: () => void
  /** Reopens bounded body-wide host discovery after a rebuild or navigation. */
  restartDomDiscovery?: () => void
  idleProgressCleanup?: () => void
  updateIdleProgress?: () => void
  fillToggleButton?: HTMLElement
  fillToggleCleanup?: () => void
  /** Releases the docked comment composer host (see commentComposer.ts). */
  commentComposerCleanup?: () => void
  /** The card ⇄ fill zoom in flight; geometry readers wait for its end. */
  zoom?: WidescreenZoom
  /** The mode whose at-rest styles stay applied until a running zoom settles. */
  heldRestMode?: WidescreenDisplayMode
  activeControlCleanup?: () => void
  descriptionCleanup?: () => void
  playlistToggleCleanup?: () => void
  danmakuActivationTimer?: ReturnType<typeof setTimeout>
  danmakuResizeTimers?: Array<ReturnType<typeof setTimeout>>
  danmakuActivatedSource?: HTMLElement
  danmakuPendingSource?: HTMLElement
  danmakuSemanticsCleanup?: () => void
  danmakuSettingsCleanup?: () => void
  danmakuPopoverPositionSync?: () => void
  danmakuSemanticsSource?: HTMLElement
  danmakuSourceHost?: HTMLElement
  danmakuGlass?: HTMLElement
  auxiliaryControlsElement?: HTMLElement
  controlsLayoutReady: boolean
  measuredControls?: HTMLElement
  controlsLayoutSignature?: string
  controlsLayoutStableSince?: number
  onInitialLayoutReady?: () => void
  initialRevealTimer?: ReturnType<typeof setTimeout>
  highEnergyProgressElement?: HTMLElement
  highEnergyProgressObserver?: MutationObserver
  viewerCountSource?: HTMLElement
  viewerCountObserver?: MutationObserver
  /** The native meta line being cloned, watched for late updates (icons fill in after first paint). */
  metadataSource?: HTMLElement
  metadataObserver?: MutationObserver
  /** Bangumi's moved media block, watched for its follow button's state (videoInfo.ts). */
  followStatusObserver?: MutationObserver
  escapeKeyCleanup?: () => void
  descriptionExpanded: boolean
  playlistCollapsed: boolean
  hydratedTabs: Set<BewlyWidescreenTab>
  initialScrollResetTabs: Set<BewlyWidescreenTab>
  panelScrollFrames: Map<BewlyWidescreenTab, number>
  videoInfoData?: VideoInfoData
  videoInfoIdentity?: string
  playbackHref: string
  navigationPending: false | 'part' | 'video'
  playerControlsActive: boolean
}

export interface ExitBewlyWidescreenOptions {
  userInitiated?: boolean
}
