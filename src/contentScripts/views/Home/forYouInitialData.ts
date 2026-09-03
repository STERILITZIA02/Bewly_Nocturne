export interface ForYouInitialDataTask {
  generation: number
  promise: Promise<void>
}

interface ForYouInitialDataCoordinatorOptions {
  hasInitializedData: () => boolean
  runInitialData: (generation: number) => Promise<void>
}

export function createForYouInitialDataCoordinator(
  options: ForYouInitialDataCoordinatorOptions,
) {
  let active = false
  let activationGeneration = 0
  let task: ForYouInitialDataTask | null = null

  function activate() {
    if (!active) {
      active = true
      activationGeneration += 1
    }
    return activationGeneration
  }

  function deactivate() {
    if (!active)
      return
    active = false
    activationGeneration += 1
  }

  function isCurrent(generation: number) {
    return active && generation === activationGeneration
  }

  function ensure() {
    if (!active || options.hasInitializedData())
      return Promise.resolve()

    const generation = activationGeneration
    if (task?.generation === generation)
      return task.promise

    const nextTask: ForYouInitialDataTask = {
      generation,
      promise: options.runInitialData(generation),
    }
    nextTask.promise = nextTask.promise.finally(() => {
      if (task === nextTask)
        task = null
    })
    task = nextTask
    return nextTask.promise
  }

  return {
    activate,
    deactivate,
    ensure,
    isCurrent,
  }
}
