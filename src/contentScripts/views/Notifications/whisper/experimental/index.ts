/**
 * Explicit entry for private-message write protocol experiments.
 *
 * Production Notifications code must not import this module. It exists so the
 * fixture verifier and deliberately constructed experimental harnesses can keep
 * the blocked text/image transports reviewable without exposing a runtime UI.
 */
export { default as MessageComposer } from './MessageComposer.vue'
export * from './privateMessageTransactions'
export * from './privateMessageWriteProtocolGate'
export * from './usePrivateMessageWrites'
