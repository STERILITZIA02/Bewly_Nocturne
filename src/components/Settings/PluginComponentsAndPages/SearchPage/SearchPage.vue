<script lang="ts" setup>
import Button from '~/components/Button.vue'
import { clearAllSearchHistory } from '~/components/SearchBar/searchHistoryProvider'
import { SEARCH_BAR_CHARACTERS } from '~/constants/imgs'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

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
        <div w="220px" flex rounded="$bew-radius" bg="$bew-fill-1" p-1>
          <div
            class="search-page-choice-option"
            flex="1 ~" items-center justify-center py-1 cursor-pointer
            text-center rounded="$bew-radius"
            :style="{
              background: settings.searchPageLogoColor === 'themeColor' || !settings.searchPageLogoColor ? 'var(--bew-theme-color)' : '',
              color: settings.searchPageLogoColor === 'themeColor' || !settings.searchPageLogoColor ? 'var(--bew-on-theme-color)' : '',
            }"
            @click="settings.searchPageLogoColor = 'themeColor'"
          >
            {{ $t('settings.logo_color_opt.theme_color') }}
          </div>
          <div
            class="search-page-choice-option"
            flex="1 ~" items-center justify-center py-1 cursor-pointer
            text-center rounded="$bew-radius"
            :style="{
              background: settings.searchPageLogoColor === 'white' ? 'var(--bew-theme-color)' : '',
              color: settings.searchPageLogoColor === 'white' ? 'var(--bew-on-theme-color)' : '',
            }"
            @click="settings.searchPageLogoColor = 'white'"
          >
            {{ $t('settings.logo_color_opt.white') }}
          </div>
        </div>
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
            <picture
              class="bew-settings-option--lift"
              aspect-square bg="$bew-fill-1" rounded="$bew-radius" overflow-hidden
              un-border="4 transparent" cursor-pointer
              grid place-items-center
              :class="{ 'selected-character': settings.searchPageSearchBarFocusCharacter === '' }"
              @click="changeSearchBarFocusCharacter('')"
            >
              <div i-tabler:photo-off text="size-$bew-icon-size-xl $bew-text-3" />
            </picture>
            <Tooltip v-for="item in SEARCH_BAR_CHARACTERS" :key="item.url" placement="top" :content="item.name" aspect-square>
              <picture
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
              </picture>
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
        <div w="220px" flex rounded="$bew-radius" bg="$bew-fill-1" p-1>
          <div
            class="search-page-choice-option"
            flex="1 ~" items-center justify-center py-1 cursor-pointer
            text-center rounded="$bew-radius"
            :style="{
              background: settings.searchResultsPaginationMode === 'scroll' ? 'var(--bew-theme-color)' : '',
              color: settings.searchResultsPaginationMode === 'scroll' ? 'var(--bew-on-theme-color)' : '',
            }"
            @click="settings.searchResultsPaginationMode = 'scroll'"
          >
            {{ $t('settings.search_results_pagination_mode_opt.scroll') }}
          </div>
          <div
            class="search-page-choice-option"
            flex="1 ~" items-center justify-center py-1 cursor-pointer
            text-center rounded="$bew-radius"
            :style="{
              background: settings.searchResultsPaginationMode === 'pagination' ? 'var(--bew-theme-color)' : '',
              color: settings.searchResultsPaginationMode === 'pagination' ? 'var(--bew-on-theme-color)' : '',
            }"
            @click="settings.searchResultsPaginationMode = 'pagination'"
          >
            {{ $t('settings.search_results_pagination_mode_opt.pagination') }}
          </div>
        </div>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style scoped lang="scss">
.search-page-choice-option {
  transition:
    filter var(--bew-duration-normal) var(--bew-ease-standard),
    box-shadow var(--bew-duration-normal) var(--bew-ease-standard);
}

.search-page-choice-option:hover {
  filter: brightness(1.08);
  box-shadow: inset 0 0 0 1px var(--bew-border-color);
}

.selected-character {
  --uno: "border-$bew-theme-color-60";
}
</style>
