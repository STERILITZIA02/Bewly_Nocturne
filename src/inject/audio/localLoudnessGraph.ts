import { waitWithSignal, withRequestDeadline } from '~/utils/abort'
import type { LocalLoudnessConfig, LocalLoudnessMeasurement } from '~/utils/localLoudnessProtocol'
import { readLocalLoudnessMeasurement } from '~/utils/localLoudnessProtocol'

import processorSource from './localLoudnessProcessor.js?raw'

const modules = new WeakMap<AudioContext, Promise<void>>()
export function disposeLoudnessNode(node: AudioWorkletNode) {
  node.onprocessorerror = null
  node.port.onmessage = null
  try {
    node.port.postMessage({ type: 'dispose' })
  }
  catch { /* A terminated processor may already have closed its port. */ }
  node.port.close()
  node.disconnect()
}

export async function prepareLoudnessNode(context: AudioContext, config: LocalLoudnessConfig, volume: number, owner: AbortSignal, measure: (value: LocalLoudnessMeasurement) => void, fail: () => void) {
  let node: AudioWorkletNode | undefined
  try {
    return await withRequestDeadline<AudioWorkletNode>(async (signal) => {
      let module = modules.get(context)
      if (!module) {
        const url = URL.createObjectURL(new Blob([processorSource], { type: 'text/javascript' }))
        let revoked = false
        const release = () => {
          if (!revoked)
            URL.revokeObjectURL(url)
          revoked = true
        }
        signal.addEventListener('abort', release, { once: true })
        module = Promise.resolve().then(() => context.audioWorklet.addModule(url)).catch((error) => {
          if (modules.get(context) === module)
            modules.delete(context)
          throw error
        }).finally(() => {
          release()
          signal.removeEventListener('abort', release)
        })
        modules.set(context, module)
      }
      await waitWithSignal(module, signal)
      signal.throwIfAborted()
      node = new AudioWorkletNode(context, 'bewly-local-loudness', {
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        processorOptions: { target: config.target, strength: config.strength / 100, volume, active: true, report: false },
      })
      const ready = new Promise<void>((resolve, reject) => {
        let initialized = false
        node!.onprocessorerror = () => initialized ? fail() : reject(new Error('Audio processor failed to initialize'))
        node!.port.onmessage = ({ data }) => {
          if (data?.type === 'ready') {
            initialized = true
            resolve()
          }
          else if (data?.type === 'measurement') {
            const sample = readLocalLoudnessMeasurement(data)
            if (sample)
              measure(sample)
          }
        }
      })
      await waitWithSignal(ready, signal)
      signal.throwIfAborted()
      return node!
    }, { signal: owner }, 10_000)
  }
  catch (error) {
    if (node)
      disposeLoudnessNode(node)
    throw error
  }
}
