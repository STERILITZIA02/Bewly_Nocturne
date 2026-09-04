export interface MomentVoteOption {
  index: number
  text: string
  count: number
  imageUrl: string
}

export interface MomentVoteInfo {
  title: string
  choiceCount: number
  endTime: number
  status: number
  total: number
  options: MomentVoteOption[]
  selectedVotes: number[]
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function selectedIndices(value: unknown): number[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [value]
  return values.filter(value => typeof value === 'number' || typeof value === 'string')
    .map(Number)
    .filter(index => Number.isSafeInteger(index) && index > 0)
}

export function normalizeMomentVote(response: unknown): MomentVoteInfo {
  const result = record(response)
  const data = record(result.data)
  const raw = record(data.vote_info ?? data.info)
  const rawOptions = Array.isArray(raw.options) ? raw.options.map(record) : []
  const options = rawOptions.map((option, index) => ({
    index: Number(option.opt_idx ?? option.idx ?? index + 1),
    text: String(option.opt_desc ?? option.desc ?? ''),
    count: Math.max(0, Number(option.cnt ?? option.total) || 0),
    imageUrl: String(option.img_url ?? option.cover ?? ''),
  })).filter(option => Number.isSafeInteger(option.index) && option.index > 0 && (option.text || option.imageUrl))
  if (result.code !== 0 || !options.length)
    throw new Error(typeof result.message === 'string' ? result.message : '')
  const selected = new Set([
    ...selectedIndices(raw.my_votes ?? raw.my_vote ?? raw.votes),
    ...selectedIndices(data.my_votes ?? data.my_vote ?? data.votes),
    ...rawOptions.flatMap((option, index) => Number(option.is_vote ?? option.my_vote ?? option.checked) === 1
      ? [Number(option.opt_idx ?? option.idx ?? index + 1)]
      : []),
  ])
  return {
    title: String(raw.title || ''),
    choiceCount: Math.min(options.length, Math.max(1, Math.floor(Number(raw.choice_cnt) || 1))),
    endTime: Math.max(0, Number(raw.end_time ?? raw.endtime) || 0),
    status: Number(raw.status) || 0,
    total: Math.max(0, Number(raw.join_num ?? raw.cnt ?? raw.total) || 0),
    options,
    selectedVotes: options.filter(option => selected.has(option.index)).map(option => option.index),
  }
}

export function isMomentVoteEnded(info: MomentVoteInfo | null, endTime = 0, now = Date.now() / 1000) {
  const deadline = info?.endTime || endTime
  return info?.status === 4 || (deadline > 0 && deadline <= now)
}

export interface MomentVoteState {
  info: MomentVoteInfo | null
  selected: number[]
  accepted: boolean
  loading: boolean
  submitting: boolean
  loadError: boolean
  submitError: '' | 'login' | 'submit'
}

export function createMomentVoteState(): MomentVoteState {
  return { info: null, selected: [], accepted: false, loading: false, submitting: false, loadError: false, submitError: '' }
}

export function createMomentVoteController(options: {
  state: MomentVoteState
  getIdentity: () => string
  getEndTime: () => number
  isLoggedIn: () => boolean
  fetchVote: () => Promise<unknown>
  submitVote: (votes: number[]) => Promise<unknown>
}) {
  const { state } = options
  let generation = 0
  let loadSequence = 0
  const hasVoted = () => state.accepted || Boolean(state.info?.selectedVotes.length)
  const isLocked = () => state.loading || state.submitting || hasVoted() || isMomentVoteEnded(state.info, options.getEndTime())

  async function load() {
    const requestGeneration = generation
    const sequence = ++loadSequence
    const identity = options.getIdentity()
    const isCurrent = () => generation === requestGeneration && sequence === loadSequence && identity === options.getIdentity()
    state.loading = true
    state.loadError = false
    try {
      const response = await options.fetchVote()
      if (!isCurrent())
        return
      state.info = normalizeMomentVote(response)
      if (!state.accepted || state.info.selectedVotes.length)
        state.selected = [...state.info.selectedVotes]
    }
    catch {
      if (isCurrent())
        state.loadError = true
    }
    finally {
      if (isCurrent())
        state.loading = false
    }
  }

  function select(index: number) {
    if (isLocked() || !state.info?.options.some(option => option.index === index))
      return
    state.submitError = ''
    if (state.info.choiceCount === 1)
      state.selected = [index]
    else if (state.selected.includes(index))
      state.selected = state.selected.filter(value => value !== index)
    else if (state.selected.length < state.info.choiceCount)
      state.selected = [...state.selected, index]
  }

  async function submit() {
    if (isLocked() || !state.selected.length)
      return
    if (!options.isLoggedIn()) {
      state.submitError = 'login'
      return
    }
    const requestGeneration = generation
    const identity = options.getIdentity()
    const isCurrent = () => generation === requestGeneration && identity === options.getIdentity()
    state.submitting = true
    state.submitError = ''
    try {
      const response = await options.submitVote([...state.selected])
      if (!isCurrent())
        return
      if (record(response).code !== 0)
        throw new Error('Vote rejected')
      // A successful POST locks resubmission even if the authoritative GET fails.
      state.accepted = true
      await load()
    }
    catch {
      if (isCurrent())
        state.submitError = 'submit'
    }
    finally {
      if (isCurrent())
        state.submitting = false
    }
  }

  function invalidate() {
    generation += 1
    loadSequence += 1
    Object.assign(state, createMomentVoteState())
  }

  return { load, select, submit, invalidate, hasVoted }
}
