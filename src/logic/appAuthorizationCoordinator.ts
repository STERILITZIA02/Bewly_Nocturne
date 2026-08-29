import { computed, shallowRef } from 'vue'

import type { AppAuthorizationSnapshot } from '~/utils/appAuthTokenPolicy'
import { resolveAppAuthorizationState } from '~/utils/appAuthTokenPolicy'

const snapshot = shallowRef<AppAuthorizationSnapshot>({
  state: 'valid',
  invalidToken: '',
})
const successVersion = shallowRef(0)

export const appAuthorizationState = computed(() => snapshot.value.state)
export const appAuthorizationSuccessVersion = computed(() => successVersion.value)

function applySnapshot(next: AppAuthorizationSnapshot) {
  if (
    next.state === snapshot.value.state
    && next.invalidToken === snapshot.value.invalidToken
  ) {
    return false
  }
  snapshot.value = next
  return true
}

export function reportAppAuthorizationInvalid(accessToken = '') {
  const next = resolveAppAuthorizationState(snapshot.value, {
    type: 'invalid',
    token: accessToken,
  })
  return applySnapshot(next) && next.state === 'invalid'
}

export function requestAppAuthorization(accessToken = '') {
  if (snapshot.value.state === 'authorizing')
    return false

  return applySnapshot(resolveAppAuthorizationState(snapshot.value, {
    type: 'authorize',
    token: accessToken,
  }))
}

export function beginAppAuthorization(accessToken = snapshot.value.invalidToken) {
  applySnapshot(resolveAppAuthorizationState(snapshot.value, {
    type: 'authorize',
    token: accessToken,
  }))
}

export function dismissAppAuthorization(accessToken = snapshot.value.invalidToken) {
  applySnapshot({
    state: 'dismissed',
    invalidToken: accessToken,
  })
}

export function completeAppAuthorization(accessToken: string) {
  applySnapshot(resolveAppAuthorizationState(snapshot.value, {
    type: 'authorized',
    token: accessToken,
  }))
  successVersion.value++
}

export function completeExternalAppAuthorization(accessToken: string) {
  if (!accessToken || accessToken === snapshot.value.invalidToken)
    return false
  const changed = applySnapshot(resolveAppAuthorizationState(snapshot.value, {
    type: 'authorized',
    token: accessToken,
  }))
  if (changed)
    successVersion.value++
  return changed
}

export function synchronizeValidAppAuthorization(accessToken: string) {
  if (
    !accessToken
    || snapshot.value.state === 'authorizing'
    || snapshot.value.state === 'dismissed'
    || (snapshot.value.state === 'invalid' && snapshot.value.invalidToken === accessToken)
  ) {
    return
  }

  applySnapshot(resolveAppAuthorizationState(snapshot.value, {
    type: 'token-valid',
    token: accessToken,
  }))
}
