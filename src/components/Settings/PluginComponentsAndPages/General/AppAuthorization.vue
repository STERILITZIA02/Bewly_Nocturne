<script setup lang="ts">
import Button from '~/components/Button.vue'
import { appAuthTokens } from '~/logic'
import { appAuthorizationState, dismissAppAuthorization, requestAppAuthorization } from '~/logic/appAuthorizationCoordinator'
import { hasValidAppAuthTokens, revokeAccessKey } from '~/utils/authProvider'

import SettingsItem from '../../components/SettingsItem.vue'

const hasUsableAuthorization = computed(() => appAuthorizationState.value === 'valid' && hasValidAppAuthTokens())
function revoke() {
  revokeAccessKey()
  dismissAppAuthorization('')
}
</script>

<template>
  <SettingsItem setting-id="account.appAuthorization" :title="$t('settings.authorize_app')" :desc="$t('settings.authorize_app_desc')" right-width="auto">
    <div class="authorization-actions">
      <span role="status">{{ $t(hasUsableAuthorization ? 'settings.app_authorized' : 'settings.app_not_authorized') }}</span>
      <a v-if="appAuthTokens.mid" :href="`https://space.bilibili.com/${appAuthTokens.mid}`" target="_blank">UID {{ appAuthTokens.mid }}</a>
      <Button v-if="!hasUsableAuthorization" @click="requestAppAuthorization(appAuthTokens.accessToken)">
        {{ $t('settings.btn.authorize') }}
      </Button>
      <Button v-if="appAuthTokens.accessToken" type="secondary" @click="revoke">
        {{ $t('settings.btn.revoke') }}
      </Button>
    </div>
  </SettingsItem>
</template>

<style scoped lang="scss">
.authorization-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bew-space-3);
  color: var(--bew-text-2);
}
</style>
