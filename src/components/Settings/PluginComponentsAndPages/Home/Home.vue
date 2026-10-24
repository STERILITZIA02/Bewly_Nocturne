<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import draggable from 'vuedraggable'

import Button from '~/components/Button.vue'
import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { gridLayout, settings } from '~/logic'
import { getRecommendationModeOption, getRecommendationModeOptions, selectRecommendationMode } from '~/logic/recommendationMode'
import type { GridLayoutType, RecommendationModeOption } from '~/logic/storage'
import { useMainStore } from '~/stores/mainStore'
import { normalizeImportedFilterRules } from '~/utils/filterRules'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsSegmentedControl from '../../components/SettingsSegmentedControl.vue'
import FilterByTitleTable from './components/FilterByTitleTable.vue'
import FilterByUserTable from './components/FilterByUserTable.vue'

const mainStore = useMainStore()
const { t } = useI18n()
const toast = useToast()

const recommendationModeOptions = computed(() => getRecommendationModeOptions(t))
const recommendationModeOption = computed({ get: getRecommendationModeOption, set: selectRecommendationMode })
function setModeVisible(option: RecommendationModeOption, visible: boolean) {
  settings.value.recommendationModeSwitcherOptions = visible
    ? [...settings.value.recommendationModeSwitcherOptions, option]
    : settings.value.recommendationModeSwitcherOptions.filter(value => value !== option)
}
const homeGridLayoutOptions = computed<{ label: string, value: GridLayoutType }[]>(() => [
  { label: t('layout_editor.layout_adaptive'), value: 'adaptive' },
  { label: t('layout_editor.layout_two_columns'), value: 'twoColumns' },
  { label: t('layout_editor.layout_one_column'), value: 'oneColumn' },
])
const followingSortOptions = computed(() => [
  { label: t('settings.following_sort_updated'), value: 'updated' },
  { label: t('settings.following_sort_group'), value: 'group' },
])

const showStandaloneSearchPage = computed({
  get: () => !settings.value.useSearchPageModeOnHomePage,
  set: (showStandalone: boolean) => {
    settings.value.useSearchPageModeOnHomePage = !showStandalone
  },
})

function moveHomeTab(page: HomeSubPage, direction: -1 | 1) {
  const items = [...settings.value.homePageTabVisibilityList]
  const index = items.findIndex(item => item.page === page)
  const target = index + direction
  if (index < 0 || target < 0 || target >= items.length)
    return
  const [item] = items.splice(index, 1)
  items.splice(target, 0, item)
  settings.value.homePageTabVisibilityList = items
}

function handleExport(filterType: 'title' | 'user') {
  const filters = filterType === 'title' ? settings.value.filterByTitle : settings.value.filterByUser
  const jsonString = JSON.stringify(filters, null, 2) // Pretty print JSON
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `filter-by-${filterType}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function handleImport(filterType: 'title' | 'user') {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file)
      return

    try {
      const fileContent = await file.text()
      const result = normalizeImportedFilterRules(JSON.parse(fileContent))

      if (!result.valid) {
        toast.error(t('settings.filter_import_failed', {
          type: t(`settings.filter_type_${filterType}`),
          message: t('settings.filter_import_invalid_format'),
        }))
        return
      }

      const ignored = result.ignored + result.duplicates
      if (result.rules.length > 0 || ignored === 0) {
        if (filterType === 'title')
          settings.value.filterByTitle = result.rules
        else
          settings.value.filterByUser = result.rules
      }

      const message = t('settings.filter_import_result', {
        imported: result.rules.length,
        ignored,
      })
      if (result.rules.length > 0 || ignored === 0)
        toast.success(message)
      else
        toast.warning(message)
    }
    catch (error) {
      console.error(`Error importing filter by ${filterType}:`, error)
      toast.error(t('settings.filter_import_failed', {
        type: t(`settings.filter_type_${filterType}`),
        message: error instanceof SyntaxError
          ? t('settings.filter_import_invalid_format')
          : t('settings.filter_import_unknown_error'),
      }))
    }
    finally {
      input.remove()
    }
  }
  input.click()
}

// Update the existing functions to use the new generic ones
function handleExportFilterByTitle() {
  handleExport('title')
}

function handleImportFilterByTitle() {
  handleImport('title')
}

function handleExportFilterByUser() {
  handleExport('user')
}

function handleImportFilterByUser() {
  handleImport('user')
}

function resetHomeTabs() {
  settings.value.homePageTabVisibilityList = mainStore.homeTabs.map((tab) => {
    return {
      page: tab.page,
      visible: tab.page !== HomeSubPage.Precious,
    }
  })
}

function handleToggleHomeTab(tab: any) {
  // Prevent disabling all tabs if there is only one
  if (settings.value.homePageTabVisibilityList.filter(tab => tab.visible === true).length > 1)
    tab.visible = !tab.visible
  else
    tab.visible = true
}
</script>

<template>
  <div>
    <SettingsItemGroup data-setting-id="settings.group_home_layout" :title="$t('settings.group_home_layout')">
      <SettingsItem
        setting-id="page.home.gridLayout"
        :title="$t('settings.home_grid_layout')"
        :desc="$t('settings.home_grid_layout_desc')"
        right-width="auto"
      >
        <SettingsSegmentedControl
          v-model="gridLayout.home"
          :label="$t('settings.home_grid_layout')"
          :options="homeGridLayoutOptions"
        />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.group_recommendation_mode" :title="$t('settings.group_recommendation_mode')">
      <SettingsItem setting-id="page.home.recommendationMode" :title="$t('settings.recommendation_mode')" right-width="auto">
        <template #desc>
          <p>{{ $t('settings.recommendation_mode_desc') }}</p>
        </template>
        <SettingsSegmentedControl
          v-model="recommendationModeOption"
          :label="$t('settings.recommendation_mode')"
          :options="recommendationModeOptions"
        />
      </SettingsItem>

      <SettingsItem
        setting-id="page.home.recommendationSwitcher"
        :title="$t('settings.show_recommendation_mode_switcher')"
        :desc="$t('settings.show_recommendation_mode_switcher_desc')" right-width="auto"
      >
        <Radio v-model="settings.showRecommendationModeSwitcher" />
      </SettingsItem>

      <SettingsItem setting-id="settings.recommendation_mode_visible_options" :title="$t('settings.recommendation_mode_visible_options')" :desc="$t('settings.recommendation_mode_visible_options_desc')" right-width="auto">
        <div flex="~ col gap-2">
          <Radio v-for="option in recommendationModeOptions" :key="option.value" :label="option.label" :model-value="settings.recommendationModeSwitcherOptions.includes(option.value)" @update:model-value="setModeVisible(option.value, $event)" />
        </div>
      </SettingsItem>

      <SettingsItem
        v-if="settings.recommendationMode === 'webNoCookie'" setting-id="settings.remember_no_cookie_recommendation_state"
        :title="$t('settings.remember_no_cookie_recommendation_state')"
        :desc="$t('settings.remember_no_cookie_recommendation_state_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.rememberNoCookieRecommendationState" />
      </SettingsItem>

      <SettingsItem setting-id="settings.auto_switch_recommendation_mode" :title="$t('settings.auto_switch_recommendation_mode')" :desc="$t('settings.auto_switch_recommendation_mode_desc')" right-width="auto">
        <Radio v-model="settings.autoSwitchRecommendationMode" />
      </SettingsItem>

      <SettingsItem setting-id="settings.preserve_for_you_state" :title="$t('settings.preserve_for_you_state')" :desc="$t('settings.preserve_for_you_state_desc')" right-width="auto">
        <Radio v-model="settings.preserveForYouState" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.immersive_mode" :title="$t('settings.immersive_mode')">
      <SettingsItem setting-id="settings.immersive_entry" :title="$t('settings.immersive_entry')" right-width="auto">
        <Radio v-model="settings.showImmersiveModeEntry" />
      </SettingsItem>
      <template v-if="settings.showImmersiveModeEntry">
        <SettingsItem setting-id="settings.immersive_wheel" :title="$t('settings.immersive_wheel')" right-width="auto">
          <Radio v-model="settings.immersiveWheelSwitch" />
        </SettingsItem>
        <SettingsItem setting-id="settings.immersive_keyboard" :title="$t('settings.immersive_keyboard')" right-width="auto">
          <Radio v-model="settings.immersiveKeyboardSwitch" />
        </SettingsItem>
        <SettingsItem setting-id="settings.immersive_autoplay" :title="$t('settings.immersive_autoplay')" right-width="auto">
          <Radio v-model="settings.immersiveAutoPlay" />
        </SettingsItem>
        <SettingsItem setting-id="settings.immersive_auto_next" :title="$t('settings.immersive_auto_next')" right-width="auto">
          <Radio v-model="settings.immersiveAutoNext" />
        </SettingsItem>
        <SettingsItem setting-id="settings.immersive_preload" :title="$t('settings.immersive_preload')" :desc="$t('settings.immersive_preload_desc')" right-width="auto">
          <Radio v-model="settings.immersivePreloadNext" />
        </SettingsItem>
      </template>
    </SettingsItemGroup>
    <SettingsItemGroup
      data-setting-id="settings.group_recommendation_filters" :title="$t('settings.group_recommendation_filters')"
      collapsible
      default-collapsed
    >
      <SettingsItem setting-id="settings.disable_filters_for_followed_users" :title="$t('settings.disable_filters_for_followed_users')" :desc="$t('settings.disable_filters_for_followed_users_desc')" right-width="auto">
        <Radio v-model="settings.disableFilterForFollowedUser" />
      </SettingsItem>
      <SettingsItem setting-id="settings.filter_out_vertical_videos" :title="$t('settings.filter_out_vertical_videos')" right-width="auto">
        <Radio v-model="settings.filterOutVerticalVideos" />
      </SettingsItem>
      <SettingsItem setting-id="settings.filter_by_view_count" :title="$t('settings.filter_by_view_count')" :desc="$t('settings.filter_by_view_count_desc')" right-width="auto">
        <div class="filter-control" :class="{ 'filter-control--enabled': settings.enableFilterByViewCount }" flex="~ justify-end">
          <Input
            v-if="settings.enableFilterByViewCount"
            v-model="settings.filterByViewCount" type="number" :min="1" :max="1000000"
            flex-1
          >
            <template #suffix>
              {{ $t('settings.filter_by_view_count_unit') }}
            </template>
          </Input>
          <Radio v-model="settings.enableFilterByViewCount" />
        </div>
      </SettingsItem>
      <SettingsItem setting-id="settings.filter_by_like_count" :title="$t('settings.filter_by_like_count')" :desc="$t('settings.filter_by_like_count_desc')" right-width="auto">
        <div class="filter-control" :class="{ 'filter-control--enabled': settings.enableFilterByLikeCount }" flex="~ justify-end">
          <Input
            v-if="settings.enableFilterByLikeCount"
            v-model="settings.filterByLikeCount" type="number" :min="1" :max="1000000"
            flex-1
          >
            <template #suffix>
              {{ $t('settings.filter_by_like_count_unit') }}
            </template>
          </Input>
          <Radio v-model="settings.enableFilterByLikeCount" />
        </div>
      </SettingsItem>
      <SettingsItem setting-id="settings.filter_by_duration" :title="$t('settings.filter_by_duration')" :desc="$t('settings.filter_by_duration_desc')" right-width="auto">
        <div class="filter-control" :class="{ 'filter-control--enabled': settings.enableFilterByDuration }" flex="~ justify-end">
          <Input
            v-if="settings.enableFilterByDuration"
            v-model="settings.filterByDuration" type="number" :min="1" :max="1000000"
            flex-1
          >
            <template #suffix>
              {{ $t('settings.filter_by_duration_unit') }}
            </template>
          </Input>
          <Radio v-model="settings.enableFilterByDuration" />
        </div>
      </SettingsItem>
      <SettingsItem setting-id="settings.filter_by_publish_time" :title="$t('settings.filter_by_publish_time')" :desc="$t('settings.filter_by_publish_time_desc')" right-width="auto">
        <div class="filter-control" :class="{ 'filter-control--enabled': settings.enableFilterByPublishTime }" flex="~ justify-end">
          <Input
            v-if="settings.enableFilterByPublishTime"
            v-model="settings.filterByPublishTime" type="number" :min="7" :max="365"
            flex-1
          >
            <template #suffix>
              {{ $t('settings.filter_by_publish_time_unit') }}
            </template>
          </Input>
          <Radio v-model="settings.enableFilterByPublishTime" />
        </div>
      </SettingsItem>

      <div grid="~ lg:gap-4 lg:cols-2 cols-1" lg:border="t-1 $bew-border-color">
        <SettingsItem
          setting-id="settings.filter_by_title" class="unrestricted-width-settings-item"
          :title="$t('settings.filter_by_title')"
          right-width="auto"
          border="lg:none t-1 $bew-border-color"
        >
          <Radio v-model="settings.enableFilterByTitle" />
          <template v-if="settings.enableFilterByTitle" #bottom>
            <i18n-t keypath="settings.filter_by_title_desc" scope="global" tag="div" text="$bew-text-2 sm" mb-2>
              <template #regex>
                <code>/abc|\d+/</code>
              </template>
              <template #slash>
                <code>/</code>
              </template>
              <template #lineBreak>
                <br>
              </template>
              <template #enter>
                <kbd>Enter</kbd>
              </template>
              <template #esc>
                <kbd>Esc</kbd>
              </template>
            </i18n-t>
            <div flex="~ gap-2" mb-2>
              <Button type="secondary" size="small" @click="handleImportFilterByTitle">
                <template #left>
                  <div i-tabler:download />
                </template>
                <input type="file" accept=".json" hidden>
                {{ $t('common.operation.import') }}
              </Button>
              <Button type="secondary" size="small" @click="handleExportFilterByTitle">
                <template #left>
                  <div i-tabler:upload />
                </template>
                {{ $t('common.operation.export') }}
              </Button>
            </div>

            <FilterByTitleTable />
          </template>
        </SettingsItem>
        <SettingsItem
          setting-id="settings.filter_by_user" class="unrestricted-width-settings-item"
          :title="$t('settings.filter_by_user')"
          right-width="auto"
          border="lg:none b-1 $bew-border-color"
        >
          <Radio v-model="settings.enableFilterByUser" />
          <template v-if="settings.enableFilterByUser" #bottom>
            <i18n-t keypath="settings.filter_by_user_desc" scope="global" tag="div" text="$bew-text-2 sm" mb-2>
              <template #regex>
                <code>/abc|\d+/</code>
              </template>
              <template #slash>
                <code>/</code>
              </template>
              <template #lineBreak>
                <br>
              </template>
              <template #enter>
                <kbd>Enter</kbd>
              </template>
              <template #esc>
                <kbd>Esc</kbd>
              </template>
            </i18n-t>
            <div flex="~ gap-2" mb-2>
              <Button type="secondary" size="small" @click="handleImportFilterByUser">
                <template #left>
                  <div i-tabler:download />
                </template>
                <input type="file" accept=".json" hidden>
                {{ $t('common.operation.import') }}
              </Button>
              <Button type="secondary" size="small" @click="handleExportFilterByUser">
                <template #left>
                  <div i-tabler:upload />
                </template>
                {{ $t('common.operation.export') }}
              </Button>
            </div>

            <FilterByUserTable />
          </template>
        </SettingsItem>
      </div>
    </SettingsItemGroup>

    <SettingsItemGroup
      data-setting-id="settings.group_home_tabs" :title="$t('settings.group_home_tabs')"
    >
      <SettingsItem
        setting-id="page.home.tabs"
        :title="$t('settings.home_tabs_adjustment')"
        :desc="$t('settings.home_tabs_adjustment_desc')"
        right-width="auto"
      >
        <template #title>
          <div flex="~ gap-4 items-center">
            {{ $t('settings.home_tabs_adjustment') }}
            <Button size="small" type="secondary" @click="resetHomeTabs">
              <template #left>
                <div i-tabler:arrow-back-up />
              </template>
              {{ $t('common.operation.reset') }}
            </Button>
          </div>
        </template>

        <template #bottom>
          <draggable
            v-model="settings.homePageTabVisibilityList"
            item-key="page"
            :component-data="{ style: 'display: flex; gap: var(--bew-space-2); flex-wrap: wrap;' }"
          >
            <template #item="{ element }">
              <button
                type="button"
                :aria-pressed="element.visible"
                :title="$t('settings.reorder_keyboard_hint')"
                aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
                class="bew-settings-option--lift"
                flex="~ gap-2 items-center" p="x-4 y-2" bg="$bew-fill-1" rounded="$bew-interactive-radius" cursor-all-scroll
                duration-300
                :style="{
                  background: element.visible ? 'var(--bew-theme-surface)' : 'var(--bew-fill-1)',
                  color: element.visible ? 'var(--bew-on-theme-surface)' : 'var(--bew-text-1)',
                }"
                @click="handleToggleHomeTab(element)"
                @keydown.alt.left.prevent="moveHomeTab(element.page, -1)"
                @keydown.alt.right.prevent="moveHomeTab(element.page, 1)"
              >
                {{ $t(mainStore.homeTabs.find(tab => tab.page === element.page)?.i18nKey ?? '') }}
              </button>
            </template>
          </draggable>
        </template>
      </SettingsItem>
      <SettingsItem setting-id="settings.fixed_home_tabs_on_home_page" :title="$t('settings.fixed_home_tabs_on_home_page')" right-width="auto">
        <Radio v-model="settings.fixedHomeTabsOnHomePage" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      data-setting-id="settings.group_following" :title="$t('settings.group_following')"
      :desc="$t('settings.group_following_desc')"
      collapsible
      default-collapsed
    >
      <SettingsItem setting-id="settings.following_sort" :title="$t('settings.following_sort')" right-width="auto">
        <SettingsSegmentedControl v-model="settings.followingUploaderSort" :label="$t('settings.following_sort')" :options="followingSortOptions" />
      </SettingsItem>
      <SettingsItem setting-id="settings.enable_following_inactive_blacklist" :title="$t('settings.enable_following_inactive_blacklist')" :desc="$t('settings.enable_following_inactive_blacklist_desc')" right-width="auto">
        <Radio v-model="settings.enableFollowingInactiveBlacklist" />
      </SettingsItem>
      <template v-if="settings.enableFollowingInactiveBlacklist">
        <SettingsItem setting-id="settings.following_inactive_days" :title="$t('settings.following_inactive_days')" :desc="$t('settings.following_inactive_days_desc')" right-width="auto">
          <Input
            v-model="settings.followingInactiveDays" type="number" :min="1" :max="365"
            w-120px
          >
            <template #suffix>
              <span text="sm $bew-text-2" whitespace-nowrap>{{ $t('common.days') }}</span>
            </template>
          </Input>
        </SettingsItem>
      </template>
      <SettingsItem setting-id="settings.following_tab_show_livestreaming_videos" :title="$t('settings.following_tab_show_livestreaming_videos')" right-width="auto">
        <Radio v-model="settings.followingTabShowLivestreamingVideos" />
      </SettingsItem>
      <SettingsItem setting-id="settings.following_filter_charging_videos" :title="$t('settings.following_filter_charging_videos')" :desc="$t('settings.following_filter_charging_videos_desc')" right-width="auto">
        <Radio v-model="settings.followingFilterChargingVideos" />
      </SettingsItem>
      <SettingsItem setting-id="settings.following_filter_dynamic_videos" :title="$t('settings.following_filter_dynamic_videos')" :desc="$t('settings.following_filter_dynamic_videos_desc')" right-width="auto">
        <Radio v-model="settings.followingFilterDynamicVideos" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup data-setting-id="settings.group_search_page_mode" :title="$t('settings.group_search_page_mode')">
      <SettingsItem
        setting-id="settings.show_standalone_search_page" :title="$t('settings.show_standalone_search_page')"
        :desc="$t('settings.show_standalone_search_page_desc')"
        right-width="auto"
      >
        <Radio v-model="showStandaloneSearchPage" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
.unrestricted-width-settings-item {
  :deep(.left-content) {
    --uno: w-full;
  }

  :deep(.right-content) {
    --uno: w-auto;
  }
}

.filter-control {
  width: auto;
}

.filter-control--enabled {
  width: 220px;
}
</style>
