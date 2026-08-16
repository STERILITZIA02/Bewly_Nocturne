<script setup lang="ts">
import { getExtensionAssetUrl } from '~/utils/messaging'

const imgURL = getExtensionAssetUrl('/assets/loading.gif')
</script>

<template>
  <div
    w="full"
    min-h="46px"
    p="y-8"
    flex="~"
    justify="center"
    items="center"
  >
    <img
      v-if="imgURL"
      :src="imgURL"
      alt="loading"
      w="46px"
      h="46px"
      m="r-2"
    >
    {{ $t('common.loading') }}
  </div>
</template>
