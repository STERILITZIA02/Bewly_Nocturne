# Dock Collapse Orb Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 为现有 Dock 增加手动收起、关闭收起功能和离开后自动收起三档模式，收起后显示保持原 Dock 中心的毛玻璃正圆。

**Architecture:** 三档语义收敛在一个小型 Dock 常量模块，设置仅持久化模式，当前收起状态由 `Dock.vue` 本地管理。完整 Dock 和圆球在同一定位容器中通过 Vue Transition 切换，并缓存展开尺寸以保持中心。

**Tech Stack:** Vue 3、TypeScript、SCSS、Vue I18n、Vite。

---

### Task 1: 锁定三档状态语义

**Files:**
- Create: `/private/tmp/bewly-dock-collapse-state.test.ts`
- Create: `src/constants/dock.ts`

- [x] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict'

import {
  getDockCollapsedStateForMode,
  shouldAutoCollapseDock,
  shouldShowDockCollapseButton,
} from '/Users/young/个人项目/bewlyCat/.worktrees/Stage_2_fix/src/constants/dock'

assert.equal(shouldShowDockCollapseButton('button'), true)
assert.equal(shouldShowDockCollapseButton('hidden'), false)
assert.equal(shouldAutoCollapseDock('automatic'), true)
assert.equal(getDockCollapsedStateForMode('automatic', false), true)
assert.equal(getDockCollapsedStateForMode('automatic', true), false)
assert.equal(getDockCollapsedStateForMode('hidden', false), false)
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm exec esno /private/tmp/bewly-dock-collapse-state.test.ts`

Expected: FAIL because `src/constants/dock.ts` does not exist.

- [x] **Step 3: Write minimal implementation**

```ts
export type DockCollapseMode = 'button' | 'hidden' | 'automatic'

export function shouldShowDockCollapseButton(mode: DockCollapseMode): boolean {
  return mode === 'button'
}

export function shouldAutoCollapseDock(mode: DockCollapseMode): boolean {
  return mode === 'automatic'
}

export function getDockCollapsedStateForMode(mode: DockCollapseMode, isHovered: boolean): boolean {
  return shouldAutoCollapseDock(mode) && !isHovered
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm exec esno /private/tmp/bewly-dock-collapse-state.test.ts`

Expected: PASS with exit code 0.

### Task 2: 持久化设置与设置入口

**Files:**
- Modify: `src/logic/storage.ts`
- Modify: `src/components/Settings/PluginComponentsAndPages/DockAndSidebar/DockAndSidebar.vue`
- Modify: `src/_locales/cmn-CN.yml`
- Modify: `src/_locales/cmn-TW.yml`
- Modify: `src/_locales/jyut.yml`
- Modify: `src/_locales/en.yml`

- [x] **Step 1: Add the typed setting and default**

Import `DockCollapseMode`, add `dockCollapseMode: DockCollapseMode` beside the existing Dock settings, and set `dockCollapseMode: 'button'` in `originalSettings`.

- [x] **Step 2: Add the three-option Select**

```ts
const dockCollapseModeOptions = computed(() => [
  { label: t('settings.dock_collapse_mode_button'), value: 'button' },
  { label: t('settings.dock_collapse_mode_hidden'), value: 'hidden' },
  { label: t('settings.dock_collapse_mode_automatic'), value: 'automatic' },
])
```

Render it in the Dock group with `v-model="settings.dockCollapseMode"`, a 160px Select, and localized title/description.

- [x] **Step 3: Add all four locale sets**

Add keys for the setting title, description, three option labels, collapse Tooltip, and expand orb accessible label. Do not add migration or compatibility aliases.

### Task 3: Dock runtime, center preservation, and animation

**Files:**
- Modify: `src/components/Dock/Dock.vue`

- [x] **Step 1: Add local state and mode watchers**

Use `isDockCollapsed`, `isDockTransitioning`, cached expanded width/height, and the Task 1 helpers. On automatic mode, collapse only after the first real Dock measurement; on other modes, expand immediately.

- [x] **Step 2: Integrate existing delayed hover**

Use `beforeEnter` to expand an automatic-mode orb immediately. Keep the existing 100ms enter and 600ms leave timing for hover state; on leave, automatic mode collapses while other modes continue through `toggleHideDock(true)`.

- [x] **Step 3: Preserve the geometric center**

Before collapsing, copy the current `useElementSize` width and height. While collapsed or transitioning, return these dimensions from `dockTransformStyle`; place the orb at `left: 50%`, `top: 50%`, `translate(-50%, -50%)` inside that stage.

- [x] **Step 4: Render the button and orb**

After the settings button, render the collapse button only when `shouldShowDockCollapseButton(settings.dockCollapseMode)` is true. Wrap `.dock-content-inner` and the round `IconButton` orb in one `Transition`; clicking the orb expands in both manual and automatic modes.

- [x] **Step 5: Protect existing Dock behavior**

Exclude the collapsed class from existing hide/half-hide transforms, suppress inline and detached action buttons while collapsed, and leave navigation, settings, theme, page-mode and refresh handlers unchanged.

- [x] **Step 6: Add scoped visuals**

Reuse Dock sizes, glass filter, semantic surface, border and shadow. Animate only opacity/transform using existing duration/easing tokens and add a reduced-motion override.

### Task 4: Documentation and verification

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-08-09-dock-collapse-orb.md`

- [x] **Step 1: Record the protected design**

Add one concise README clause and one AGENTS protection bullet covering the three modes, centered glass orb, and prohibition against replacing it with a separate Teleport/duplicate Dock state.

- [x] **Step 2: Run focused and project checks**

Run:

```sh
pnpm exec esno /private/tmp/bewly-dock-collapse-state.test.ts
pnpm lint
pnpm typecheck
git diff --check
```

Expected: all exit with code 0 and no new warnings.

- [x] **Step 3: Compile the Chrome development extension**

Run `pnpm dev`, wait for the initial content script, inject script and background builds to succeed, then stop watch mode. Confirm `extension/manifest.json` and `extension/dist/contentScripts/index.global.js` exist.

- [x] **Step 4: Leave Git state explicit**

Do not stage, commit, push, merge, or create a PR for implementation files unless the user separately authorizes it. Preserve all pre-existing unstaged and untracked work.

### Task 5: 主轴伸缩过渡

**Files:**
- Modify: `src/components/Dock/Dock.vue`
- Test: `/private/tmp/bewly-dock-axis-transition.test.mjs`

- [x] **Step 1: Write the failing structure test**

Assert that the Dock transition has explicit vertical and horizontal direction classes, uses `scaleY` for side Dock and `scaleX` for bottom Dock, and no longer uses the generic `scale(0.78)` collapse keyframe.

- [x] **Step 2: Run the test and verify it fails**

Run `node /private/tmp/bewly-dock-axis-transition.test.mjs` and expect a missing axis-transition assertion.

- [x] **Step 3: Implement the minimal axis transition**

Bind the current Dock orientation to the transition stage. Keep the orb centered, but animate the expanded pill from the center with `scaleY` on left/right positions and `scaleX` on bottom position. Preserve opacity, easing, reduced-motion handling, glass, shadow, and all runtime state.

- [x] **Step 4: Run focused and project verification**

Run the structure test, `pnpm lint`, `pnpm typecheck`, `git diff --check`, and one initial `pnpm dev` compilation. Do not commit or push.

### Task 6: 持久外壳与克制导轨时序

**Files:**
- Modify: `src/components/Dock/Dock.vue`
- Modify: `docs/superpowers/specs/2026-08-09-dock-collapse-orb-design.md`
- Test: `/private/tmp/bewly-dock-continuous-shell.test.mjs`

- [x] **Step 1: Write the failing structure test**

Assert that `Dock.vue` renders one persistent `dock-content-inner` surface without `mode="out-in"`, contains separate `dock-expanded-content` and `dock-collapsed-trigger` layers, measures the shell with `dockShellRef`, and sequences content through `isDockContentVisible` plus a shell `transitionend` handler.

- [x] **Step 2: Run the test and verify it fails**

Run `node /private/tmp/bewly-dock-continuous-shell.test.mjs`. Expected failure: the current template still swaps the expanded surface and collapsed orb through Vue `Transition`.

- [x] **Step 3: Add persistent shell measurements and timing state**

Keep the existing outer-stage width/height cache and add `dockShellRef`, expanded shell width/height, `isDockContentVisible`, `isDockCollapsedTriggerVisible`, a 150ms content-exit timer, and one pending animation-frame handle. Collapse hides content first, locks measured shell dimensions, then starts the shell contraction. Expand hides the trigger and reverses the same shell. A primary-axis `transitionend` reveals the next content layer and releases the fixed expanded dimensions.

- [x] **Step 4: Replace the swapped surfaces with one shell**

Remove the outer `Transition mode="out-in"`. Render one `.dock-content-inner` with its measured style and collapsed class. Keep all existing Dock controls inside `.dock-expanded-content`; render a transparent circular `.dock-collapsed-trigger` inside the same shell. Use `inert`, `aria-hidden`, opacity, and pointer-event states so hidden controls cannot receive focus or clicks.

- [x] **Step 5: Implement the calm-rail visual sequence**

Animate the shell's real `width`, `height`, `padding`, and geometric radius with `--bew-duration-moderate` and `--bew-ease-standard`. After shell growth ends, fade/translate the entire content group in with `--bew-duration-fast`; reverse the order for collapse. Side Dock content moves vertically, bottom Dock content horizontally. Keep the existing glass filter, border, shadow, focus feedback, center preservation, and reduced-motion override.

- [x] **Step 6: Verify implementation and development output**

Run the focused structure test, existing Dock state test, `pnpm lint`, `pnpm typecheck`, `git diff --check`, and one initial `pnpm dev` compilation. Confirm `extension/manifest.json` and `extension/dist/contentScripts/index.global.js` exist. Do not commit or push.
