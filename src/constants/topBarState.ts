import type { UnReadDm, UnReadMessage } from '~/components/TopBar/types'

export interface TopBarSharedState {
  unReadMessage: UnReadMessage
  unReadDm: UnReadDm
  newMomentsCount: number
  hasBCoinToReceive: boolean
  bCoinAlreadyReceived: boolean
  vipExpAlreadyReceived: boolean
  bCoinNextReceiveAt?: number | null
  vipExpNextReceiveAt?: number | null
}

export type TopBarSharedResource = 'unread' | 'moments' | 'rewards'
export const TOP_BAR_RESOURCE_FIELDS = {
  unread: ['unReadMessage', 'unReadDm'],
  moments: ['newMomentsCount'],
  rewards: ['hasBCoinToReceive', 'bCoinAlreadyReceived', 'vipExpAlreadyReceived', 'bCoinNextReceiveAt', 'vipExpNextReceiveAt'],
} as const satisfies Record<TopBarSharedResource, readonly (keyof TopBarSharedState)[]>

export interface TopBarStateClaim {
  accountId: number
  maxAge: number
  force?: boolean
  resource: TopBarSharedResource
}

export interface TopBarRefreshClaim {
  shouldRefresh: boolean
  snapshot?: Partial<TopBarSharedState>
  refreshId?: number
  version: number
}

export interface TopBarStatePublish {
  accountId: number
  snapshot: Partial<TopBarSharedState>
  refreshId: number
  resource: TopBarSharedResource
  version: number
}

export interface TopBarStateRelease {
  accountId: number
  refreshId: number
  resource: TopBarSharedResource
}

export interface TopBarStateInvalidate {
  accountId: number
  resource: TopBarSharedResource
  version?: number
}

export interface TopBarFavoritesChanged {
  accountId: number
}

export const TOP_BAR_STATE_MESSAGE = {
  CLAIM_REFRESH: 'topBarState:claimRefresh',
  PUBLISH: 'topBarState:publish',
  RELEASE_REFRESH: 'topBarState:releaseRefresh',
  INVALIDATE: 'topBarState:invalidate',
  INVALIDATED: 'topBarState:invalidated',
  FAVORITES_CHANGED: 'topBarState:favoritesChanged',
  UPDATED: 'topBarState:updated',
  LOGIN_STATE_CHANGED: 'topBarState:loginStateChanged',
} as const
