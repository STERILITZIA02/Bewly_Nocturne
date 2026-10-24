import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import { settings } from '~/logic'
import { compileFilterRules } from '~/utils/filterRules'
import { createRegexBatchRunner } from '~/utils/regexBatchRunner'
import { isVerticalVideo } from '~/utils/uriParse'

const get = (obj: any, path: string[]) => path.reduce((acc, part) => acc && acc[part], obj)

export enum FilterType {
  filterOutVerticalVideos,
  viewCount,
  likeCount,
  viewCountStr,
  duration,
  title,
  user,
  publishTime,
}

type FuncMap = { [key in FilterType]: {
  func: (item: any, keyPath: string[], filterValue: any) => boolean
  enabledKey: string
  valueKey: string
} }

type KeyPath = Array<string>[]

export function useFilter(isFollowedKeyPath: string[], filterOpt: FilterType[], keyList: KeyPath) {
  const { t } = useI18n()
  const toast = useToast()
  const regexRunner = createRegexBatchRunner()
  onScopeDispose(regexRunner.dispose)
  const compiledTitleRules = computed(() => compileFilterRules(settings.value.filterByTitle))
  const compiledUserRules = computed(() => compileFilterRules(settings.value.filterByUser))
  const userNames = computed(() => new Set(compiledUserRules.value.stringValues))
  function filterOutVerticalVideos(item: any, keyPath: string[], _filterValue: number) {
    const value = get(item, keyPath)
    return typeof value === 'boolean' ? !value : !isVerticalVideo(value)
  }

  /**
   * Compares a number value in an object with a filter value.
   * Return `true` if the number value is greater than the filter value, `false` otherwise.
   *
   * @param item - The object containing the number value.
   * @param keyPath - The path to the number value in the object.
   * @param filterValue - The filter value to compare with.
   * @returns `true` if the number value is greater than the filter value, `false` otherwise.
   */
  function compareNumber(item: any, keyPath: string[], filterValue: number) {
    return get(item, keyPath) > filterValue
  }

  /**
   * Compares a number or number string with a filter value.
   * @param item - The object to compare.
   * @param keyPath - The path to the property in the object.
   * @param filterValue - The value to compare against.
   * @returns `true` if the value is greater than the filter value, `false` otherwise.
   */
  function compareNumberString(item: any, keyPath: string[], filterValue: number) {
    const value = get(item, keyPath)

    // for example: `1.2万`, `1.2萬`, `-` (indicates no data)
    if (typeof value === 'string' && (value.includes('万') || value.includes('萬'))) {
      const processedValue = value.replace(/万|萬/g, '')
      return Number(processedValue) * 10000 > filterValue
    }

    const numericValue = Number(value)
    return !Number.isNaN(numericValue) && numericValue > filterValue
  }

  // #region filter by title
  let filterByTitleStringValues: string[] = []
  let filterByTitleRegExpValues: RegExp[] = []

  /**
   * Compares the title of an item with the given key path.
   * @param item - The item to compare.
   * @param keyPath - The key path to access the title of the item.
   * @returns `true` if the title does not contain any of the filter keywords, `false` otherwise.
   */
  function compareTitle(item: any, keyPath: string[], _filterValue: string) {
    const value = get(item, keyPath)

    const normalized = `${value}`.toUpperCase()
    return !filterByTitleStringValues.some(keyword => normalized.includes(keyword))
  }
  // #endregion

  // #region filter by user
  let filterByUserStringValues = new Set<string>()
  let filterByUserRegExpValues: RegExp[] = []

  /**
   * Compares a given item with a key path and determines if it does not meets the filter criteria.
   * @param item - The item to compare.
   * @param keyPath - The key path to access the value in the item.
   * @returns `true` if the item does not meet the filter criteria, `false` otherwise.
   */
  function compareUser(item: any, keyPath: string[], _filterValue: string) {
    const value = get(item, keyPath)

    return !filterByUserStringValues.has(`${value}`.toUpperCase())
  }
  // #endregion

  /**
   * Compares the publish time of an item with the filter value.
   * Return `true` if the video was published within the specified number of days, `false` otherwise.
   * @param item - The item to compare.
   * @param keyPath - The path to the publish timestamp in the object.
   * @param filterValue - The number of days to filter by.
   * @returns `true` if the video was published within the specified days, `false` otherwise.
   */
  function comparePublishTime(item: any, keyPath: string[], filterValue: number) {
    const publishTimestamp = get(item, keyPath)
    if (!publishTimestamp)
      return false

    const now = Math.floor(Date.now() / 1000) // 当前时间戳（秒）
    const dayInSeconds = 24 * 60 * 60
    const filterTimeInSeconds = filterValue * dayInSeconds
    const timeDiff = now - publishTimestamp

    return timeDiff >= 0 && timeDiff <= filterTimeInSeconds
  }

  const funcMap: FuncMap = {
    [FilterType.filterOutVerticalVideos]: {
      func: filterOutVerticalVideos,
      enabledKey: 'filterOutVerticalVideos',
      valueKey: '',
    },
    [FilterType.viewCount]: {
      func: compareNumber,
      enabledKey: 'enableFilterByViewCount',
      valueKey: 'filterByViewCount',
    },
    [FilterType.likeCount]: {
      func: compareNumber,
      enabledKey: 'enableFilterByLikeCount',
      valueKey: 'filterByLikeCount',
    },
    [FilterType.duration]: {
      func: compareNumber,
      enabledKey: 'enableFilterByDuration',
      valueKey: 'filterByDuration',
    },
    [FilterType.viewCountStr]: {
      func: compareNumberString,
      enabledKey: 'enableFilterByViewCount',
      valueKey: 'filterByViewCount',
    },
    [FilterType.title]: {
      func: compareTitle,
      enabledKey: 'enableFilterByTitle',
      valueKey: '',
    },
    [FilterType.user]: {
      func: compareUser,
      enabledKey: 'enableFilterByUser',
      valueKey: '',
    },
    [FilterType.publishTime]: {
      func: comparePublishTime,
      enabledKey: 'enableFilterByPublishTime',
      valueKey: 'filterByPublishTime',
    },
  }

  const filter = shallowRef<((items: any[]) => Promise<boolean[]>) | null>(null)

  watch(() => [
    settings.value.filterOutVerticalVideos,
    settings.value.enableFilterByDuration,
    settings.value.enableFilterByViewCount,
    settings.value.enableFilterByLikeCount,
    settings.value.enableFilterByTitle,
    settings.value.enableFilterByUser,
    settings.value.enableFilterByPublishTime,
    settings.value.filterByDuration,
    settings.value.filterByViewCount,
    settings.value.filterByLikeCount,
    compiledTitleRules.value,
    compiledUserRules.value,
    settings.value.filterByPublishTime,
    settings.value.recommendationMode,
    settings.value.disableFilterForFollowedUser,
  ], ([filterOutVerticalVideos, durationFilter, viewCountFilter, likeCountFilter, titleFilter, userFilter, publishTimeFilter]) => {
    regexRunner.dispose()
    const titleRules = compiledTitleRules.value
    const userRules = compiledUserRules.value
    filterByTitleStringValues = titleRules.stringValues
    filterByTitleRegExpValues = titleRules.regExpValues
    filterByUserStringValues = userNames.value
    filterByUserRegExpValues = userRules.regExpValues

    if (!filterOutVerticalVideos && !durationFilter && !viewCountFilter && !likeCountFilter && !titleFilter && !userFilter && !publishTimeFilter) {
      filter.value = null
      return
    }
    filter.value = factoryFilter(funcMap, filterOpt, keyList)
  }, { immediate: true })

  function factoryFilter(funcMap: FuncMap, filterOpt: FilterType[], keyList: KeyPath) {
    interface FuncParams {
      keyPath: string[]
      func: (item: any, keyPath: string[], filterValue: any) => boolean
      value?: number | string
    }

    const funcs: FuncParams[] = []

    filterOpt.forEach((type, index) => {
      const { func, enabledKey, valueKey } = funcMap[type]
      if (Reflect.get(settings.value, enabledKey)) {
        const settingValue = valueKey ? Reflect.get(settings.value, valueKey) : ''
        const funcParams: FuncParams = {
          keyPath: keyList[index],
          func,
          value: typeof settingValue === 'number' || typeof settingValue === 'string' ? settingValue : '',
        }
        funcs.push(funcParams)
      }
    })

    const regexGroups = [FilterType.title, FilterType.user].map(type => ({
      rules: (type === FilterType.title ? filterByTitleRegExpValues : filterByUserRegExpValues).map(regex => regex.source),
      paths: filterOpt.flatMap((entry, index) => entry === type && Reflect.get(settings.value, funcMap[type].enabledKey) ? [keyList[index]] : []),
    })).filter(group => group.rules.length && group.paths.length)

    return async (items: any[]): Promise<boolean[]> => {
      const allowed = items.map(item => item === null || isAllowedContent(item))
      const accepted = items.map((item, index) => allowed[index] || funcs.every(({ keyPath, func, value }) => func(item, keyPath, value)))
      if (!regexGroups.length)
        return accepted
      const candidates = items.flatMap((item, index) => accepted[index] && !allowed[index] ? [{ item, index }] : [])
      if (!candidates.length)
        return accepted
      let matches: boolean[][]
      try {
        matches = await regexRunner.run(regexGroups.map(({ rules, paths }) => ({ rules, values: candidates.map(({ item }) => paths.map(path => String(get(item, path)))) })))
      }
      catch (error) {
        if ((error as Error).name !== 'AbortError')
          toast.error(t('filter_rule_execution_failed'))
        throw error
      }
      candidates.forEach(({ index }, position) => {
        accepted[index] = !matches.some(group => group[position])
      })
      return accepted
    }
  }

  function isAllowedContent(item: any): boolean {
    if (!settings.value.disableFilterForFollowedUser)
      return false
    const followed = get(item, isFollowedKeyPath)
    return Boolean(followed)
  }
  return filter
}
