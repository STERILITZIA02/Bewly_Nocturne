import assert from 'node:assert/strict'

import { nextTick } from 'vue'

import { loadSourceFunctions } from './sourceFunctionHarness'

async function verifySettingsRevealLifecycle() {
  const frames = new Map<number, () => void>()
  let nextFrame = 0
  let reveals = 0
  let highlights = 0
  const target = { isConnected: true, scrollIntoView: () => reveals++ }
  const context = await loadSourceFunctions('../src/components/Settings/Settings.vue', [
    'cancelSettingNavigation',
    'revealSearchTarget',
    'deactivateSettingsModal',
  ], {
    settingsModalActive: true,
    searchNavigationId: 1,
    settingNavigationTimer: undefined,
    settingNavigationFrame: undefined,
    inertSiblingStates: new Map(),
    previouslyFocusedElement: null,
    nextTick,
    clearTimeout: () => {},
    clearSearchTargetHighlight: () => {},
    expandSearchTarget: () => {},
    highlightSearchTarget: () => highlights++,
    cancelAnimationFrame: (id: number) => frames.delete(id),
    window: { requestAnimationFrame: (callback: () => void) => {
      const id = ++nextFrame
      frames.set(id, callback)
      return id
    } },
  })
  const flushFrames = () => {
    for (const [id, callback] of [...frames]) {
      frames.delete(id)
      callback()
    }
  }
  context.revealSearchTarget(target, 1)
  await nextTick()
  flushFrames()
  assert.equal(reveals, 1)
  assert.equal(highlights, 1)

  context.revealSearchTarget(target, 1)
  context.cancelSettingNavigation()
  await nextTick()
  assert.equal(frames.size, 0, 'a superseded nextTick cannot register a new RAF')
  context.revealSearchTarget(target, 2)
  await nextTick()
  assert.equal(frames.size, 1)
  context.deactivateSettingsModal()
  assert.equal(frames.size, 0, 'KeepAlive deactivation cancels the pending frame')
  flushFrames()
  assert.equal(reveals, 1)
  assert.equal(highlights, 1)
}

async function verifySearchSuggestionLifecycle() {
  let requests = 0
  const suggestions: unknown[] = []
  const context = await loadSourceFunctions('../src/components/SearchBar/SearchBar.vue', ['handleKeywordInput'], {
    useDebounceFn: (callback: unknown) => callback,
    searchBarDisposed: false,
    suggestionRequestId: 2,
    suggestions,
    reportSearchBarFailure: () => {},
    api: { search: { getSearchSuggestion: async () => {
      requests++
      return { code: 0, result: { tag: [{ value: 'current' }, { value: 'current' }] } }
    } } },
  })
  await context.handleKeywordInput('old', 1)
  assert.equal(requests, 0)
  await context.handleKeywordInput('current', 2)
  assert.equal(requests, 1)
  assert.equal(suggestions.length, 1)
  context.searchBarDisposed = true
  await context.handleKeywordInput('closed', 2)
  assert.equal(requests, 1, 'unmounted debounce callback does not send a new API request')
}

async function verifySelectOptionChanges() {
  const selections: string[] = []
  const context = await loadSourceFunctions('../src/components/Select.vue', ['handleOptionKeyDown'], {
    props: { options: [] },
    activeOptionIndex: { value: 2 },
    selectOption: (option: { value: string }) => selections.push(option.value),
  })
  const event = { key: 'Enter', preventDefault: () => {} }
  context.handleOptionKeyDown(event)
  assert.equal(selections.length, 0, 'removing the focused option must not throw or emit undefined')
  context.props.options = [{ value: 'one' }]
  context.activeOptionIndex.value = 0
  context.handleOptionKeyDown(event)
  assert.deepEqual(selections, ['one'])
}

async function verifyRankingLoadingEvents() {
  const events: string[] = []
  const completions: Array<(value: unknown) => void> = []
  const context = await loadSourceFunctions('../src/contentScripts/views/Home/components/Ranking.vue', ['getRankingPgc'], {
    requestGeneration: 1,
    isLoading: { value: false },
    PgcList: [],
    emit: (event: string) => events.push(event),
    api: { ranking: { getRankingPgc: () => new Promise(resolve => completions.push(resolve)) } },
  })
  const first = context.getRankingPgc(1, 1)
  context.requestGeneration = 2
  const second = context.getRankingPgc(2, 4)
  completions[0]({ code: 0, data: { list: ['stale'] } })
  await first
  assert.equal(context.isLoading.value, true)
  completions[1]({ code: 0, data: { list: ['current'] } })
  await second
  assert.equal(context.isLoading.value, false)
  assert.deepEqual(events, ['beforeLoading', 'beforeLoading', 'afterLoading'])
  assert.equal(context.PgcList[0], 'current')
}

export async function verifyFunctionalAuditFixes() {
  await verifySettingsRevealLifecycle()
  await verifySearchSuggestionLifecycle()
  await verifySelectOptionChanges()
  await verifyRankingLoadingEvents()
  console.log('Functional audit fix verification passed.')
}
