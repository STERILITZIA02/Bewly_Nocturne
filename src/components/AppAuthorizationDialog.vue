<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Button from '~/components/Button.vue'
import Dialog from '~/components/Dialog.vue'
import SkeletonBlock from '~/components/SkeletonBlock.vue'
import { appAuthTokens } from '~/logic'
import {
  beginAppAuthorization,
  completeAppAuthorization,
  dismissAppAuthorization,
} from '~/logic/appAuthorizationCoordinator'
import { getAppLoginQRCode, hasValidAppAuthTokens, pollAppLoginQRCode, saveAppAuthTokens } from '~/utils/authProvider'

interface DialogExpose {
  close: () => void
}

const AUTHORIZATION_POLL_DELAY = 3_000
const AUTHORIZATION_DEADLINE = 3 * 60_000
const QRCodeVue = defineAsyncComponent({
  loader: () => import('qrcode.vue'),
  loadingComponent: { render: () => h(SkeletonBlock, { width: '150px', height: '150px', radius: 'interactive' }) },
  delay: 0,
})

const { t } = useI18n()
const toast = useToast()
const dialogRef = ref<DialogExpose | null>(null)
const loginQRCodeUrl = ref('')
const qrcodeMsg = ref('')
interface AuthorizationAttempt {
  phase: 'requesting' | 'waiting' | 'scanned' | 'failed' | 'succeeded'
  controller: AbortController
  authGeneration: number
  deadline: number
  authCode: string
  timer?: ReturnType<typeof setTimeout>
}
const authorization = shallowRef<AuthorizationAttempt>()
const lifetime = ref<'active' | 'closing' | 'closed' | 'disposed'>('active')
const authorizationSucceeded = computed(() => authorization.value?.phase === 'succeeded')
const authorizationClosing = computed(() => lifetime.value !== 'active')
const isCurrentAuthorization = (attempt: AuthorizationAttempt) => authorization.value === attempt && lifetime.value === 'active' && !attempt.controller.signal.aborted

function setAuthorizationPhase(attempt: AuthorizationAttempt, phase: AuthorizationAttempt['phase']) {
  attempt.phase = phase
  triggerRef(authorization)
}

function invalidateAuthorization() {
  const attempt = authorization.value
  if (!attempt)
    return
  attempt.controller.abort()
  clearTimeout(attempt.timer)
  attempt.timer = undefined
}

function scheduleAuthorizationPoll(attempt: AuthorizationAttempt) {
  clearTimeout(attempt.timer)
  if (!isCurrentAuthorization(attempt) || !attempt.authCode)
    return

  if (Date.now() >= attempt.deadline) {
    setAuthorizationPhase(attempt, 'failed')
    qrcodeMsg.value = t('common.load_failed')
    return
  }

  attempt.timer = setTimeout(async () => {
    attempt.timer = undefined
    if (!isCurrentAuthorization(attempt))
      return

    try {
      const response = await pollAppLoginQRCode(attempt.authCode, attempt.controller.signal)
      if (!isCurrentAuthorization(attempt))
        return

      qrcodeMsg.value = response?.message || ''
      if (response?.code === 0 && response.data) {
        if (!saveAppAuthTokens(response.data, attempt.authGeneration)) {
          setAuthorizationPhase(attempt, 'failed')
          invalidateAuthorization()
          qrcodeMsg.value = t('common.load_failed')
          return
        }
        setAuthorizationPhase(attempt, 'succeeded')
        invalidateAuthorization()
        toast.success(t('settings.app_authorization_success'))
        dialogRef.value?.close()
        return
      }

      // 86039: waiting for scan; 86090: scanned and awaiting confirmation.
      if (response?.code === 86039 || response?.code === 86090) {
        setAuthorizationPhase(attempt, response.code === 86039 ? 'waiting' : 'scanned')
        scheduleAuthorizationPoll(attempt)
      }
      else {
        setAuthorizationPhase(attempt, 'failed')
      }
    }
    catch (error) {
      if (!isCurrentAuthorization(attempt))
        return
      setAuthorizationPhase(attempt, 'failed')
      qrcodeMsg.value = t('common.load_failed')
      console.error('Failed to poll APP recommendation authorization:', error)
    }
  }, AUTHORIZATION_POLL_DELAY)
}

async function startAuthorization() {
  if (authorizationClosing.value || authorizationSucceeded.value)
    return

  invalidateAuthorization()
  beginAppAuthorization(appAuthTokens.value.accessToken)
  const attempt: AuthorizationAttempt = {
    phase: 'requesting',
    controller: new AbortController(),
    authGeneration: appAuthTokens.value.generation,
    deadline: Date.now() + AUTHORIZATION_DEADLINE,
    authCode: '',
  }
  authorization.value = attempt
  loginQRCodeUrl.value = ''
  qrcodeMsg.value = ''

  try {
    const response = await getAppLoginQRCode(attempt.controller.signal)
    if (!isCurrentAuthorization(attempt))
      return
    if (response?.code !== 0 || !response.data?.url || !response.data?.auth_code) {
      setAuthorizationPhase(attempt, 'failed')
      qrcodeMsg.value = response?.message || t('common.load_failed')
      return
    }

    loginQRCodeUrl.value = response.data.url
    attempt.authCode = response.data.auth_code
    setAuthorizationPhase(attempt, 'waiting')
    scheduleAuthorizationPoll(attempt)
  }
  catch (error) {
    if (!isCurrentAuthorization(attempt))
      return
    setAuthorizationPhase(attempt, 'failed')
    qrcodeMsg.value = t('common.load_failed')
    console.error('Failed to start APP recommendation authorization:', error)
  }
}

function handleBeforeClose() {
  lifetime.value = 'closing'
  invalidateAuthorization()
}

function handleClosed() {
  lifetime.value = 'closed'
  invalidateAuthorization()
  if (authorizationSucceeded.value && appAuthTokens.value.accessToken)
    completeAppAuthorization(appAuthTokens.value.accessToken)
  else
    dismissAppAuthorization()
}

watch(() => [
  appAuthTokens.value.accessToken,
  appAuthTokens.value.refreshToken,
  appAuthTokens.value.accessTokenExpiresAt,
  appAuthTokens.value.refreshTokenExpiresAt,
], () => {
  if (!authorizationClosing.value && hasValidAppAuthTokens()) {
    if (authorization.value)
      setAuthorizationPhase(authorization.value, 'succeeded')
    invalidateAuthorization()
    dialogRef.value?.close()
  }
})

onMounted(() => {
  void startAuthorization()
})

onBeforeUnmount(() => {
  lifetime.value = 'disposed'
  invalidateAuthorization()
})
</script>

<template>
  <Dialog
    ref="dialogRef"
    width="50%"
    max-width="800px"
    append-to-bewly-body
    :show-footer="false"

    :title="$t('settings.authorize_app')"
    center
    layer="critical-dialog"
    @before-close="handleBeforeClose"
    @close="handleClosed"
  >
    <div flex="~ col gap-4 items-center">
      <div>
        <p mb-2 text-center>
          {{ $t('settings.scan_qrcode_desc') }}
        </p>
        <p text="$bew-text-2 sm">
          {{ $t('settings.authorize_app_desc') }}
        </p>
      </div>

      <div bg-white border="white 4">
        <QRCodeVue v-if="loginQRCodeUrl" :value="loginQRCodeUrl" :size="150" />
        <div v-else w-150px h-150px grid="~ place-items-center">
          <SkeletonBlock width="150px" height="150px" radius="interactive" />
        </div>
      </div>

      <p>{{ qrcodeMsg }}</p>

      <Button type="secondary" :disabled="authorizationSucceeded || authorizationClosing" @click="startAuthorization">
        {{ $t('common.operation.refresh') }}
      </Button>
    </div>
  </Dialog>
</template>
