<script lang="ts" setup>
import Button from '~/components/Button.vue'
import { clearAllSearchHistory } from '~/components/SearchBar/searchHistoryProvider'
import { SEARCH_BAR_CHARACTERS } from '~/constants/imgs'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsSegmentedControl from '../../components/SettingsSegmentedControl.vue'

function changeSearchBarFocusCharacter(url: string) {
  settings.value.searchPageSearchBarFocusCharacter = url
}

async function clearSearchHistory() {
  await clearAllSearchHistory()
}
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_logo')">
      <SettingsItem :title="$t('settings.logo_color')" right-width="auto">
        <SettingsSegmentedControl
          v-model="settings.searchPageLogoColor"
          :label="$t('settings.logo_color')"
          :options="[
            { value: 'themeColor', label: $t('settings.logo_color_opt.theme_color') },
            { value: 'white', label: $t('settings.logo_color_opt.white') },
          ]"
        />
      </SettingsItem>

      <SettingsItem :title="$t('settings.enable_logo_glowing_effect')" right-width="auto">
        <Radio v-model="settings.searchPageLogoGlow" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.logo_visibility')" right-width="auto">
        <Radio v-model="settings.searchPageShowLogo" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_search_bar')">
      <SettingsItem :title="$t('settings.show_search_recommendation')" :desc="$t('settings.show_search_recommendation_desc')" right-width="auto">
        <Radio v-model="settings.showSearchRecommendation" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.enable_search_history')" :desc="$t('settings.enable_search_history_desc')" right-width="auto">
        <Radio v-model="settings.enableSearchHistory" />
      </SettingsItem>

      <SettingsItem :title="$t('search_bar.clear_history')" right-width="auto">
        <Button type="secondary" @click="clearSearchHistory">
          {{ $t('search_bar.clear_history') }}
        </Button>
      </SettingsItem>

      <SettingsItem setting-id="search.focus.disable" :title="$t('settings.disable_search_focus_effect')" :desc="$t('settings.disable_search_focus_effect_desc')" right-width="auto">
        <Radio v-model="settings.disableSearchFocusEffect" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.choose_search_bar_focused_character')">
        <template #bottom>
          <div grid="~ xl:cols-8 lg:cols-6 cols-5 gap-4">
            <button
              type="button"
              :aria-label="$t('settings.no_search_character')"
              :aria-pressed="settings.searchPageSearchBarFocusCharacter === ''"
              class="bew-settings-option--lift"
              aspect-square bg="$bew-fill-1" rounded="$bew-radius" overflow-hidden
              un-border="4 transparent" cursor-pointer
              grid place-items-center
              :class="{ 'selected-character': settings.searchPageSearchBarFocusCharacter === '' }"
              @click="changeSearchBarFocusCharacter('')"
            >
              <div i-tabler:photo-off text="size-$bew-icon-size-xl $bew-text-3" />
            </button>
            <Tooltip v-for="item in SEARCH_BAR_CHARACTERS" :key="item.url" placement="top" :content="item.name" aspect-square>
              <button
                type="button"
                :aria-label="item.name"
                :aria-pressed="settings.searchPageSearchBarFocusCharacter === item.url"
                class="bew-settings-option--lift"
                aspect-square bg="$bew-fill-1" rounded="$bew-radius" overflow-hidden
                un-border="4 transparent" w-full
                :class="{ 'selected-character': settings.searchPageSearchBarFocusCharacter === item.url }"
                @click="changeSearchBarFocusCharacter(item.url)"
              >
                <img
                  :src="item.url" alt="" loading="lazy"
                  w-full h-full object-contain
                >
              </button>
            </Tooltip>
          </div>
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_hot_search')">
      <SettingsItem :title="$t('settings.show_hot_search_in_search_page')" right-width="auto">
        <template #desc>
          <span>{{ $t('settings.show_hot_search_in_search_page_desc') }}</span>
        </template>
        <Radio v-model="settings.showHotSearchInTopBar" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_search_results')">
      <SettingsItem :title="$t('settings.use_plugin_search_results_page')" right-width="auto">
        <template #desc>
          <span>{{ $t('settings.use_plugin_search_results_page_desc') }}</span>
        </template>
        <Radio v-model="settings.usePluginSearchResultsPage" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.depersonalize_search_results')" right-width="auto">
        <template #desc>
          <span>{{ $t('settings.depersonalize_search_results_desc') }}</span>
        </template>
        <Radio v-model="settings.depersonalizeSearchResults" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.search_results_pagination_mode')" right-width="auto">
        <template #desc>
          <span>{{ $t('settings.search_results_pagination_mode_desc') }}</span>
        </template>
        <SettingsSegmentedControl
          v-model="settings.searchResultsPaginationMode"
          :label="$t('settings.search_results_pagination_mode')"
          :options="[
            { value: 'scroll', label: $t('settings.search_results_pagination_mode_opt.scroll') },
            { value: 'pagination', label: $t('settings.search_results_pagination_mode_opt.pagination') },
          ]"
        />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style scoped lang="scss">
.selected-character {
  --uno: "border-$bew-theme-foreground";
}
</style>
