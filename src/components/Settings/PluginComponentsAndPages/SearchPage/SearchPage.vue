<script lang="ts" setup>
import Button from '~/components/Button.vue'
import Radio from '~/components/Radio.vue'
import { clearAllSearchHistory } from '~/components/SearchBar/searchHistoryProvider'
import Tooltip from '~/components/Tooltip.vue'
import { useBewlyApp } from '~/composables/useAppProvider'
import { SEARCH_BAR_CHARACTERS } from '~/constants/imgs'
import { settings } from '~/logic'
import { shouldUsePluginSearchResultsPage } from '~/utils/searchNavigation'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsSegmentedControl from '../../components/SettingsSegmentedControl.vue'
import LinkOpening from '../../Navigation/LinkOpening.vue'

const showStandaloneSearchPage = computed({
  get: () => !settings.value.useSearchPageModeOnHomePage,
  set: (showStandalone: boolean) => {
    settings.value.useSearchPageModeOnHomePage = !showStandalone
  },
})
const { openSettingsAt } = useBewlyApp()
const effectiveResults = computed(shouldUsePluginSearchResultsPage)

function changeSearchBarFocusCharacter(url: string) {
  settings.value.searchPageSearchBarFocusCharacter = url
}

async function clearSearchHistory() {
  await clearAllSearchHistory()
}
</script>

<template>
  <div>
    <SettingsItemGroup data-setting-id="settings.group_search_page_mode" :title="$t('settings.group_search_page_mode')">
      <SettingsItem
        setting-id="settings.show_standalone_search_page" :title="$t('settings.show_standalone_search_page')"
        :desc="$t('settings.show_standalone_search_page_desc')"
        right-width="auto"
      >
        <Radio v-model="showStandaloneSearchPage" />
      </SettingsItem>
    </SettingsItemGroup>
    <LinkOpening scope="search" />
    <SettingsItemGroup data-setting-id="settings.group_logo" :title="$t('settings.group_logo')">
      <SettingsItem setting-id="settings.logo_color" :title="$t('settings.logo_color')" right-width="auto">
        <SettingsSegmentedControl
          v-model="settings.searchPageLogoColor"
          :label="$t('settings.logo_color')"
          :options="[
            { value: 'themeColor', label: $t('settings.logo_color_opt.theme_color') },
            { value: 'white', label: $t('settings.logo_color_opt.white') },
          ]"
        />
      </SettingsItem>

      <SettingsItem setting-id="settings.logo_visibility" :title="$t('settings.logo_visibility')" right-width="auto">
        <Radio v-model="settings.searchPageShowLogo" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.group_search_bar" :title="$t('settings.group_search_bar')">
      <SettingsItem setting-id="search.bar.recommendation" :title="$t('settings.show_search_recommendation')" :desc="$t('settings.show_search_recommendation_desc')" right-width="auto">
        <Radio v-model="settings.showSearchRecommendation" />
      </SettingsItem>

      <SettingsItem setting-id="settings.enable_search_history" :title="$t('settings.enable_search_history')" :desc="$t('settings.enable_search_history_desc')" right-width="auto">
        <Radio v-model="settings.enableSearchHistory" />
      </SettingsItem>

      <SettingsItem setting-id="search_bar.clear_history" :title="$t('search_bar.clear_history')" right-width="auto">
        <Button type="secondary" @click="clearSearchHistory">
          {{ $t('search_bar.clear_history') }}
        </Button>
      </SettingsItem>

      <SettingsItem setting-id="settings.choose_search_bar_focused_character" :title="$t('settings.choose_search_bar_focused_character')">
        <template #bottom>
          <div grid="~ xl:cols-8 lg:cols-6 cols-5 gap-4">
            <button
              type="button"
              :aria-label="$t('settings.no_search_character')"
              :aria-pressed="settings.searchPageSearchBarFocusCharacter === ''"
              class="bew-settings-option--lift"
              aspect-square bg="$bew-fill-1" rounded="$bew-thumb-radius" overflow-hidden
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
                aspect-square bg="$bew-fill-1" rounded="$bew-thumb-radius" overflow-hidden
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

    <SettingsItemGroup data-setting-id="settings.group_hot_search" :title="$t('settings.group_hot_search')">
      <SettingsItem setting-id="settings.show_hot_search_in_search_page" :title="$t('settings.show_hot_search_in_search_page')" right-width="auto">
        <template #desc>
          <span>{{ $t('settings.show_hot_search_in_search_page_desc') }}</span>
        </template>
        <Radio v-model="settings.showHotSearchInTopBar" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.group_search_results" :title="$t('settings.group_search_results')">
      <SettingsItem setting-id="settings.use_plugin_search_results_page" :title="$t('settings.use_plugin_search_results_page')" right-width="auto">
        <template #desc>
          <span>{{ $t('settings.use_plugin_search_results_page_desc') }}</span>
          <p role="status">
            {{ $t(effectiveResults ? 'settings.search_results_effective_bewly' : settings.usePluginSearchResultsPage ? 'settings.search_results_controlled_by_mode' : 'settings.search_results_effective_bilibili') }}
          </p>
          <Button v-if="settings.usePluginSearchResultsPage && !effectiveResults" type="tertiary" @click="openSettingsAt({ category: 'bewly-pages', page: 'page-modes' })">
            {{ $t('settings.page_mode') }}
          </Button>
        </template>
        <Radio v-model="settings.usePluginSearchResultsPage" />
      </SettingsItem>

      <SettingsItem setting-id="settings.depersonalize_search_results" :title="$t('settings.depersonalize_search_results')" right-width="auto">
        <template #desc>
          <span>{{ $t('settings.depersonalize_search_results_desc') }}</span>
        </template>
        <Radio v-model="settings.depersonalizeSearchResults" />
      </SettingsItem>
      <SettingsItem setting-id="settings.show_search_identity_switcher" :title="$t('settings.show_search_identity_switcher')" :desc="$t('settings.show_search_identity_switcher_desc')" right-width="auto">
        <Radio v-model="settings.showSearchIdentitySwitcher" />
      </SettingsItem>

      <SettingsItem setting-id="settings.search_results_pagination_mode" :title="$t('settings.search_results_pagination_mode')" right-width="auto">
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
  --uno: "border-$bew-focus-ring-color";
}
</style>
