<script setup lang="ts">
import QRCodeVue from 'qrcode.vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import { appAuthTokens, settings } from '~/logic'
import {
  beginAppAuthorization,
  completeAppAuthorization,
  dismissAppAuthorization,
} from '~/logic/appAuthorizationCoordinator'
import { getTVLoginQRCode, hasValidAppAuthTokens, pollTVLoginQRCode, saveAppAuthTokens } from '~/utils/authProvider'

interface DialogExpose {
  close: () => void
}

const AUTHORIZATION_POLL_DELAY = 3_000
const AUTHORIZATION_DEADLINE = 3 * 60_000

const { t } = useI18n()
const toast = useToast()
const dialogRef = ref<DialogExpose | null>(null)
const loginQRCodeUrl = ref('')
const authCode = ref('')
const qrcodeMsg = ref('')
let authorizationTimer: ReturnType<typeof setTimeout> | undefined
let authorizationGeneration = 0
let authorizationDeadline = 0
let authorizationSucceeded = false
let authorizationClosing = false

function clearAuthorizationTimer() {
  if (authorizationTimer != null)
    clearTimeout(authorizationTimer)
  authorizationTimer = undefined
}

function invalidateAuthorization() {
  authorizationGeneration++
  clearAuthorizationTimer()
}

function scheduleAuthorizationPoll(generation: number, expectedAuthCode: string) {
  clearAuthorizationTimer()
  if (
    generation !== authorizationGeneration
    || expectedAuthCode !== authCode.value
    || !expectedAuthCode
  ) {
    return
  }

  if (Date.now() >= authorizationDeadline) {
    qrcodeMsg.value = t('common.load_failed')
    return
  }

  authorizationTimer = setTimeout(async () => {
    authorizationTimer = undefined
    if (generation !== authorizationGeneration || expectedAuthCode !== authCode.value)
      return

    try {
      const response = await pollTVLoginQRCode(expectedAuthCode)
      if (generation !== authorizationGeneration || expectedAuthCode !== authCode.value)
        return

      qrcodeMsg.value = response?.message || ''
      if (response?.code === 0 && response.data) {
        saveAppAuthTokens(response.data)
        authorizationSucceeded = true
        invalidateAuthorization()
        toast.success(t('settings.app_authorization_success'))
        dialogRef.value?.close()
        return
      }

      // 86039: waiting for scan; 86090: scanned and awaiting confirmation.
      if (response?.code === 86039 || response?.code === 86090)
        scheduleAuthorizationPoll(generation, expectedAuthCode)
    }
    catch (error) {
      if (generation !== authorizationGeneration)
        return
      qrcodeMsg.value = t('common.load_failed')
      console.error('Failed to poll APP recommendation authorization:', error)
    }
  }, AUTHORIZATION_POLL_DELAY)
}

async function startAuthorization() {
  if (authorizationClosing || authorizationSucceeded || settings.value.recommendationMode !== 'app')
    return

  invalidateAuthorization()
  const generation = authorizationGeneration
  beginAppAuthorization(appAuthTokens.value.accessToken)
  authorizationSucceeded = false
  loginQRCodeUrl.value = ''
  authCode.value = ''
  qrcodeMsg.value = ''
  authorizationDeadline = Date.now() + AUTHORIZATION_DEADLINE

  try {
    const response = await getTVLoginQRCode()
    if (generation !== authorizationGeneration)
      return
    if (response?.code !== 0 || !response.data?.url || !response.data?.auth_code) {
      qrcodeMsg.value = response?.message || t('common.load_failed')
      return
    }

    loginQRCodeUrl.value = response.data.url
    authCode.value = response.data.auth_code
    scheduleAuthorizationPoll(generation, response.data.auth_code)
  }
  catch (error) {
    if (generation !== authorizationGeneration)
      return
    qrcodeMsg.value = t('common.load_failed')
    console.error('Failed to start APP recommendation authorization:', error)
  }
}

function handleBeforeClose() {
  authorizationClosing = true
  invalidateAuthorization()
}

function handleClosed() {
  invalidateAuthorization()
  if (authorizationSucceeded && appAuthTokens.value.accessToken)
    completeAppAuthorization(appAuthTokens.value.accessToken)
  else
    dismissAppAuthorization()
}

watch(() => settings.value.recommendationMode, (mode) => {
  if (mode !== 'app')
    dialogRef.value?.close()
}, { immediate: true })

watch(() => [
  appAuthTokens.value.accessToken,
  appAuthTokens.value.refreshToken,
  appAuthTokens.value.accessTokenExpiresAt,
  appAuthTokens.value.refreshTokenExpiresAt,
], () => {
  if (!authorizationClosing && hasValidAppAuthTokens()) {
    authorizationSucceeded = true
    dialogRef.value?.close()
  }
})

onMounted(() => {
  if (settings.value.recommendationMode === 'app')
    void startAuthorization()
})

onBeforeUnmount(invalidateAuthorization)
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
          <div i-svg-spinners:ring-resize />
        </div>
      </div>

      <p>{{ qrcodeMsg }}</p>

      <Button type="secondary" :disabled="authorizationSucceeded || authorizationClosing" @click="startAuthorization">
        {{ $t('common.operation.refresh') }}
      </Button>
    </div>
  </Dialog>
</template>
