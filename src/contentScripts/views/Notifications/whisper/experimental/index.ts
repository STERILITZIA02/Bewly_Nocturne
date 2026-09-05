/**
 * Explicit entry for private-message write protocol experiments.
 *
 * The production bundle does not import this aggregate entry. Fixture verification
 * and explicit DEV harnesses import the exact experimental modules they require.
 */
export type { default as MessageComposer } from './MessageComposer.vue'
export * from './privateMessageTransactions'
export * from './privateMessageWriteProtocolGate'
export type * from './privateMessageWriteTypes'
export * from './usePrivateMessageWrites'
