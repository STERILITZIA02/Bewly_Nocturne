# BewlyMac Brand Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the personal fork to BewlyMac, keep compatibility-sensitive internal identifiers stable, reduce the README to essential project and license information, and preserve a controlled upstream merge path.

**Architecture:** `package.json` remains the source of truth for the extension display name and repository homepage. User-visible translations and release/about links adopt BewlyMac, while storage keys, event names, DOM IDs, CSS identifiers, and extension IDs retain their existing values. Git remotes keep `origin` as the BewlyCat upstream and `fork` as the renamed BewlyMac repository.

**Tech Stack:** Vue 3, TypeScript, Vite, YAML locale files, pnpm, Git, GitHub CLI

---

### Task 1: Rename project metadata and CI artifacts

**Files:**
- Modify: `package.json:2-8`
- Modify: `.github/workflows/ci.yml:81-96`
- Modify: `.github/ISSUE_TEMPLATE/bug_issue_template.yaml:11`

- [ ] **Step 1: Update package metadata**

Set the metadata to:

```json
{
  "name": "bewly-mac",
  "displayName": "BewlyMac",
  "type": "module",
  "version": "1.7.3",
  "packageManager": "pnpm@11.17.0",
  "description": "A personal browser extension for a customized Bilibili experience.",
  "homepage": "https://github.com/STERILITZIA02/BewlyMac"
}
```

Do not restore the removed `private` flag.

- [ ] **Step 2: Rename the CI artifact**

Change the artifact name without changing workflow behavior:

```yaml
name: BewlyMac-chrome-extension
```

- [ ] **Step 3: Point the issue template to the personal repository**

Replace the issue creation URL with:

```text
https://github.com/STERILITZIA02/BewlyMac/issues/new
```

- [ ] **Step 4: Check the metadata diff**

Run:

```bash
git diff -- package.json .github/workflows/ci.yml .github/ISSUE_TEMPLATE/bug_issue_template.yaml
```

Expected: only names, description, homepage, artifact labels, and the issue URL change.

### Task 2: Replace the README with the approved minimal document

**Files:**
- Modify: `README.md:1-123`
- Preserve: `LICENSE`

- [ ] **Step 1: Replace README content**

Use this complete document:

```markdown
# BewlyMac

BewlyMac 是一个面向个人使用习惯定制的 Bilibili 浏览器扩展。它仍是浏览器扩展，不是 macOS、桌面或移动客户端。

## 来源与维护

BewlyMac 基于 [BewlyCat](https://github.com/keleus/BewlyCat) 开发；BewlyCat 基于 [BewlyBewly](https://github.com/BewlyBewly/BewlyBewly)。本仓库保留原项目历史和贡献者信息。

本项目会继续选择性合并 BewlyCat 上游更新。无冲突的更新正常接收；与 BewlyMac 定制行为冲突时，经人工审查后保留本地定制。

## 本地构建

```sh
pnpm install
pnpm dev
```

Chrome 生产版及 ZIP：

```sh
pnpm build
pnpm pack:zip
```

构建目录为 `extension/`，压缩包为 `extension.zip`。

## 许可

本项目使用[基于 MIT 并附加使用限制的自定义许可](LICENSE)。额外限制包括禁止将项目封装、转换或发布为独立客户端。复制、修改或分发本项目时，必须保留适用的版权声明与许可文本。
```

- [ ] **Step 2: Confirm obsolete promotional content is gone**

Run:

```bash
rg -n 'shields.io|Chrome应用商店|Edge应用商店|Star History|主要功能异同' README.md
```

Expected: no matches.

- [ ] **Step 3: Confirm the license was not changed**

Run:

```bash
git diff --exit-code -- LICENSE
```

Expected: exit code 0.

### Task 3: Rename user-visible extension branding

**Files:**
- Modify: `src/_locales/cmn-CN.yml`
- Modify: `src/_locales/cmn-TW.yml`
- Modify: `src/_locales/en.yml`
- Modify: `src/_locales/jyut.yml`
- Modify: `src/background/contentScriptRefreshPrompt.ts:26-90`

- [ ] **Step 1: Replace direct BewlyCat product references in locale values**

In the four locale files, replace user-visible `BewlyCat` text with `BewlyMac`. Do not rename YAML keys, generic `Bewly` page-mode terms, or `BewlyBewly` when it is explicitly an upstream attribution.

Examples:

```yaml
menu_plugin_components_and_pages: BewlyMac界面
page_mode_bewly: BewlyMac
bewly_page_unavailable: 当前页面暂无 BewlyMac 版本
```

```yaml
menu_plugin_components_and_pages: BewlyMac Interface
bewly_page_unavailable: No BewlyMac version is available for this page
```

- [ ] **Step 2: Rename refresh prompt titles only**

In `getRefreshPromptCopy`, replace the hard-coded user-visible title prefix `BewlyCat` with `BewlyMac` for Traditional Chinese, Simplified Chinese, Japanese, Korean, and English.

Keep the internal prompt ID `bewlycat-refresh-required` and console log prefixes unchanged.

- [ ] **Step 3: Verify compatibility identifiers remain stable**

Run:

```bash
rg -n "bewlycat:settings|bewlycat_|bewly-cat:|data-bewlycat|bewlycat-refresh-required" src
```

Expected: the existing storage, event, DOM, and prompt identifiers still exist.

### Task 4: Update About and release links without duplicating project metadata

**Files:**
- Modify: `src/components/Settings/About/About.vue:8-47,58-84,126-170`
- Modify: `src/contentScripts/views/Home/components/VersionReminder.vue:6-9`

- [ ] **Step 1: Import package homepage and derive repository URLs in About**

Replace the package import and URL constants with:

```ts
import { displayName, homepage, version } from '../../../../package.json'

const repositoryPath = new URL(homepage).pathname.replace(/^\//, '')
const releasesUrl = `${homepage}/releases`
const latestReleaseApiUrl = `https://api.github.com/repos/${repositoryPath}/releases/latest`
const contributorsUrl = `${homepage}/graphs/contributors`
const contributorsImageUrl = `https://contrib.rocks/image?repo=${repositoryPath}`
```

Use `latestReleaseApiUrl` in `checkGitHubRelease()`.

- [ ] **Step 2: Bind About user-visible name and links**

Use these bindings:

```vue
<a v-if="hasNewVersion" :href="releasesUrl" ...>
<span>{{ displayName }}</span>
<a :href="releasesUrl" ...>
<a :href="homepage" ...>
<a v-else :href="contributorsUrl" ...>
<img :src="contributorsImageUrl" ...>
```

Do not change settings behavior, version comparison, styling, or unrelated social links.

- [ ] **Step 3: Derive the version reminder release URL from package metadata**

Use:

```ts
import { homepage, version } from '../../../../../package.json'

const GITHUB_RELEASES_URL = `${homepage}/releases`
```

Keep the Bilibili dynamic link unchanged because no replacement account was provided.

- [ ] **Step 4: Check repository link scope**

Run:

```bash
rg -n 'keleus/BewlyCat' src/components/Settings/About/About.vue src/contentScripts/views/Home/components/VersionReminder.vue package.json
```

Expected: no matches. Historical issue references elsewhere remain unchanged.

### Task 5: Verify branding, compatibility, and production output

**Files:**
- Verify: `package.json`
- Verify: `README.md`
- Verify: `src/**`
- Generate (ignored): `extension/**`
- Generate (ignored): `extension.zip`

- [ ] **Step 1: Review remaining old-brand occurrences**

Run:

```bash
rg -n 'BewlyCat|bewly-cat|bewlycat' package.json README.md src .github
```

Expected: remaining matches are limited to upstream attribution, historical issue links, internal logs/comments, compatibility identifiers, and the design/plan documents.

- [ ] **Step 2: Run static checks**

Run:

```bash
pnpm lint
pnpm typecheck
```

Expected: both commands exit 0.

- [ ] **Step 3: Build and package Chrome**

Run:

```bash
pnpm build
pnpm pack:zip
```

Expected: production build exits 0 and creates `extension.zip`.

- [ ] **Step 4: Verify generated manifest and archive**

Run:

```bash
rg -n '"name": "BewlyMac"|"homepage_url": "https://github.com/STERILITZIA02/BewlyMac"' extension/manifest.json
unzip -t extension.zip
```

Expected: both manifest fields match and unzip reports no errors.

- [ ] **Step 5: Review diff quality**

Run:

```bash
git diff --check
git diff --stat
git status --short
```

Expected: no whitespace errors; only the planned tracked files are modified, while build outputs remain ignored.

### Task 6: Commit, rename the GitHub repository, and publish the branch

**Files:**
- Add: the exact tracked files modified in Tasks 1-5
- Do not add: `extension/`, `extension.zip`, tests, or unrelated files

- [ ] **Step 1: Stage exact paths**

Run `git add --` with the explicit list of metadata, README, locale, About, refresh prompt, version reminder, design, and plan files. Never use `git add .` or `git add -A`.

- [ ] **Step 2: Inspect the staged scope**

Run:

```bash
git diff --cached --stat
git diff --cached --check
```

Expected: only approved branding and documentation changes are staged.

- [ ] **Step 3: Commit the implementation**

Run:

```bash
git commit -m "chore(brand): 将项目更名为 BewlyMac"
```

Expected: commit succeeds after the project hooks.

- [ ] **Step 4: Rename the fork repository**

Run:

```bash
gh repo rename BewlyMac --repo STERILITZIA02/BewlyCat --yes
```

Expected: GitHub reports the repository is now `STERILITZIA02/BewlyMac`.

- [ ] **Step 5: Update and verify the local fork remote**

Run:

```bash
git remote set-url fork https://github.com/STERILITZIA02/BewlyMac.git
git remote -v
```

Expected: `fork` uses the BewlyMac URL and `origin` still uses `keleus/BewlyCat`.

- [ ] **Step 6: Push the current branch**

Run:

```bash
git push -u fork codex/chrome-package
```

Expected: the branch is published to the renamed personal repository.

- [ ] **Step 7: Final repository verification**

Run:

```bash
gh repo view STERILITZIA02/BewlyMac --json nameWithOwner,url,isFork,parent
git status --short --branch
```

Expected: GitHub identifies the renamed fork and its parent; the local tracked worktree is clean and tracks `fork/codex/chrome-package`.
