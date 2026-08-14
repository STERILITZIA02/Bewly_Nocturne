# Notifications Runtime Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TopBar shared refreshes, Reply/At/Love, hybrid whisper reads, and original fallbacks resilient while disabling unverified private-message writes.

**Architecture:** Keep the current background API and Notifications page structure. Add a small pure shared-refresh policy layer so network retry and lease completion can be fixture-verified, normalize private-message responses at the background boundary, and drive whisper rendering from explicit session capabilities. Preserve the existing iframe fallback and Native Feed controllers.

**Tech Stack:** Vue 3, TypeScript, Pinia, WebExtension messaging, `esno` fixture verification, ESLint, `vue-tsc`.

---

### Task 1: TopBar shared refresh and original iframe activity

**Files:**
- Create: `src/stores/topBarSharedRefresh.ts`
- Modify: `src/stores/topBarStore.ts`
- Modify: `src/contentScripts/views/Notifications/components/OriginalNotificationsFrame.vue`
- Modify: `src/contentScripts/views/Notifications/notificationSections.ts`
- Test: `scripts/verify-private-message.ts`

- [ ] Add failing assertions proving settings cannot mutate unread state, unread leaves settle independently, transient network errors retry exactly once, and a failed refresh lease releases without publishing.
- [ ] Run `pnpm verify:private-message` and confirm those new assertions fail for missing behavior.
- [ ] Implement `runSharedRefreshRequest()` with one bounded retry and sanitized DEV diagnostics, then return `Promise<boolean>` from every authoritative shared refresh leaf.
- [ ] Use `Promise.allSettled()` for unread message and DM requests; update each successful result independently and require both to succeed before publishing.
- [ ] Route the claimed lease through `completeSharedRefreshLease()` so failed or account-stale refreshes release and never publish.
- [ ] Gate iframe unread activity with `canOriginalNotificationMutateUnread(view)` so settings only loads, receives theme messages, and releases resources.
- [ ] Run the four required checks and commit `fix(topbar): 收敛共享状态网络失败与刷新租约`.

### Task 2: Tolerant private-message protocol and profile enrichment

**Files:**
- Modify: `src/background/privateMessage/types.ts`
- Modify: `src/background/privateMessage/protocol.ts`
- Modify: `src/background/privateMessage/losslessJson.ts`
- Modify: `src/contentScripts/views/Notifications/whisper/privateSession.ts`
- Modify: `src/contentScripts/views/Notifications/whisper/usePrivateSessions.ts`
- Test: `scripts/verify-private-message.ts`
- Create: `tests/fixtures/private-message/runtime/sessions-mixed.json`
- Create: `tests/fixtures/private-message/runtime/messages-mixed.json`

- [ ] Add failing fixtures for nullable `at_uids`, omitted optional message fields, null collections, malformed single rows, assistant account info, and invalid `last_msg`.
- [ ] Run `pnpm verify:private-message` and confirm parsing and best-effort card assertions fail.
- [ ] Normalize optional message/session fields while keeping only documented core fields mandatory and all ID/seqno values as strings.
- [ ] Parse arrays row-by-row, retain valid rows, reject only malformed containers or a non-empty all-invalid result, and emit only aggregate DEV diagnostics.
- [ ] Fetch ordinary-user cards in batches of 30 with `Promise.allSettled()`, accept all documented response containers, and never turn enrichment failure into the primary list error.
- [ ] Run the four required checks and commit `fix(private-message): 容错解析真实私信响应`.

### Task 3: Hybrid registration, session capabilities, and read-only UI

**Files:**
- Modify: `src/contentScripts/views/Notifications/notificationSections.ts`
- Modify: `src/contentScripts/views/Notifications/Notifications.vue`
- Modify: `src/contentScripts/views/Notifications/whisper/privateSession.ts`
- Modify: `src/contentScripts/views/Notifications/whisper/ConversationListItem.vue`
- Modify: `src/contentScripts/views/Notifications/whisper/WhisperWorkspace.vue`
- Modify: `src/contentScripts/views/Notifications/whisper/ConversationView.vue`
- Modify: `src/_locales/cmn-CN.yml`
- Modify: `src/_locales/cmn-TW.yml`
- Modify: `src/_locales/en.yml`
- Modify: `src/_locales/jyut.yml`
- Modify: `AGENTS.md`
- Test: `scripts/verify-private-message.ts`

- [ ] Add failing assertions for hybrid/workspace registration and capability matrices for regular users, assistants, unfollowed/intercepted users, fan groups, and unsupported sessions.
- [ ] Add `implementation: 'hybrid'` and explicit document/workspace layout metadata; separate original-only from frame-capable and hybrid guards.
- [ ] Classify sessions and generate immutable capabilities, with all send and management capabilities disabled and assistant profile navigation disabled.
- [ ] Remove send/upload dependencies from Notifications and show only the localized read-only footer plus original fallback action.
- [ ] Use whisper-specific error keys in list and conversation views and update all four locales plus the protected architecture baseline.
- [ ] Run the four required checks and commit `fix(private-message): 校正会话能力并关闭未验证写入`.

### Task 4: Rich notification and recall parsing

**Files:**
- Modify: `src/contentScripts/views/Notifications/whisper/privateMessageRenderers.ts`
- Create: `tests/fixtures/private-message/renderers/notify-msg-null-modules.json`
- Create: `tests/fixtures/private-message/renderers/recalled-status.json`
- Test: `scripts/verify-private-message.ts`

- [ ] Add failing assertions for `modules: null`, invalid individual modules/actions, configured fallback URLs, empty direct actions, `msg_status === 1`, and empty type-5 content.
- [ ] Normalize null modules to an empty list, skip malformed modules/actions independently, and only render actions with both safe URL and text.
- [ ] Prefer `jump_uri*_config.all_uri` when the direct URL is empty or invalid.
- [ ] Return recalled content before JSON parsing for status-recalled or type-5 messages.
- [ ] Run the four required checks and commit `fix(private-message): 完善真实富通知与撤回解析`.

### Task 5: Consolidated fixtures, verification, development smoke, and push

**Files:**
- Modify: `scripts/verify-private-message.ts`
- Modify: `AGENTS.md`
- Test: all runtime fixtures under `tests/fixtures/private-message/`

- [ ] Verify all twenty requested regression categories, including source-level guards against raw `console.error(error)` in shared refresh paths.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm verify:notifications`, and `pnpm verify:private-message`.
- [ ] Commit the final fixture/verification-only delta as `test(private-message): 增加真实响应形态回归验证` after a fresh full gate.
- [ ] Run final `pnpm knip`.
- [ ] Start `pnpm dev`, wait for content/inject/background initial compilation, perform only the available non-visual smoke checks, and stop the watcher cleanly.
- [ ] Review `git diff`, five commit SHAs, and ahead/behind state; push with `git push origin message_feature` without force.
