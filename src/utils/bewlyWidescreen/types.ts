import type { Data as VideoInfoData } from '~/models/video/videoInfo'

export type BewlyWidescreenTab = 'comment' | 'danmaku' | 'playlist'

export type BewlyWidescreenSidebarLayout = 'compact' | 'expanded'

export interface MovedNode {
  node: HTMLElement
  placeholder: HTMLElement
  originalParent: Node
}

export interface WidescreenSidebarReadiness {
  top: boolean
  comment: boolean
  danmaku: boolean
  playlist: boolean
  complete: boolean
}

export interface CommentPrewarmState {
  root: HTMLElement
  styleAttribute: string | null
}

export interface BewlyWidescreenState {
  exit: (options?: ExitBewlyWidescreenOptions) => void
  refreshSidebar: () => void
  hydrateSidebar: () => void
  root: HTMLElement
  stage: HTMLElement
  playerEl: HTMLElement
  playerSlot: HTMLElement
  playerFrame: HTMLElement
  danmakuDock: HTMLElement
  sidebarEl: HTMLElement
  sidebarTop: HTMLElement
  metadataSlot: HTMLElement
  upSlot: HTMLElement
  toolbarSlot: HTMLElement
  descriptionSlot: HTMLElement
  tagsSlot: HTMLElement
  panels: Record<BewlyWidescreenTab, HTMLElement>
  tabButtons: Record<BewlyWidescreenTab, HTMLButtonElement>
  playlistToggleButton: HTMLButtonElement
  sidebarResizer: HTMLDivElement
  sidebarToggleButton: HTMLButtonElement
  movedNodes: MovedNode[]
  styleEl: HTMLStyleElement
  activeTab: BewlyWidescreenTab
  sidebarLayout: BewlyWidescreenSidebarLayout
  sidebarPosition: 'left' | 'right'
  resizeObserver?: ResizeObserver
  mutationObserver?: MutationObserver
  playerStateObserver?: MutationObserver
  toolbarMutationObserver?: MutationObserver
  toolbarResizeObserver?: ResizeObserver
  themeObserver?: MutationObserver
  metadataListener?: () => void
  resizeSyncFrame?: number
  actionGeometryFrame?: number
  actionGeometryElements?: Set<HTMLElement>
  layoutEventCleanup?: () => void
  settingsWatchCleanup?: Array<() => void>
  sidebarHydrationTimer?: ReturnType<typeof setTimeout>
  sidebarHydrationWarningShown?: boolean
  sidebarHydrationTimedOut?: boolean
  commentReadyCleanup?: () => void
  sidebarEdgeRevealSuppressionTimer?: ReturnType<typeof setTimeout>
  sidebarInteractionCleanup?: () => void
  sidebarToggleAutoHideCleanup?: () => void
  activeControlCleanup?: () => void
  descriptionCleanup?: () => void
  playlistToggleCleanup?: () => void
  danmakuActivationTimer?: ReturnType<typeof setTimeout>
  danmakuResizeTimers?: Array<ReturnType<typeof setTimeout>>
  danmakuActivatedSource?: HTMLElement
  danmakuPendingSource?: HTMLElement
  danmakuSemanticsCleanup?: () => void
  danmakuSettingsCleanup?: () => void
  danmakuSemanticsSource?: HTMLElement
  danmakuSourceHost?: HTMLElement
  danmakuGlass?: HTMLElement
  controlsGlassAppliedHeight?: number
  highEnergyProgressElement?: HTMLElement
  highEnergyProgressObserver?: MutationObserver
  escapeKeyCleanup?: () => void
  colorProbe?: HTMLSpanElement
  descriptionExpanded: boolean
  playlistCollapsed: boolean
  hydratedTabs: Set<BewlyWidescreenTab>
  initialScrollResetTabs: Set<BewlyWidescreenTab>
  panelScrollFrames: Map<BewlyWidescreenTab, number>
  videoInfoData?: VideoInfoData
  videoInfoIdentity?: string
  navigationPending: boolean
  bottomControlsHovered: boolean
  playerPointerInside: boolean
}

export interface ExitBewlyWidescreenOptions {
  userInitiated?: boolean
}
