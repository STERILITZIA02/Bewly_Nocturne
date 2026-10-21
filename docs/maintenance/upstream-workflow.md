# 上游协作流程

## 远端

| 远端 | URL | 职责 |
| --- | --- | --- |
| origin | https://github.com/STERILITZIA02/Bewly_Nocturne.git | Nocturne 开发与发布 |
| upstream | https://github.com/keleus/BewlyCat.git | 只读参考，永不推送 |
| contrib | https://github.com/STERILITZIA02/BewlyCat.git | 贡献给 BewlyCat 的修复 |

日常开发沿用用户指定的 `message_feature` → `origin/message_feature`，不自动切分支或建 worktree。下面的分支规则只用于用户发起的上游协作任务。

## 分支

| 工作类型 | 基线 | 分支 | 推送目标 |
| --- | --- | --- | --- |
| Nocturne 功能、外观与个人定制 | origin/main | 任务指定 | origin |
| 可独立贡献的上游修复 | upstream/main | fix/* | contrib |
| 把独立修复移回 Nocturne | origin/main | port/* | origin |
| 同步上游 | origin/main | sync/* | origin |

- 上游修复只含最小改动：用 `git log --oneline upstream/main..HEAD` 和 `git diff --stat upstream/main...HEAD` 看一眼范围，排除 Nocturne 品牌、`AGENTS.md`、维护文档、产物和无关格式化。
- 移植用 `git cherry-pick -x <sha>`，不 merge 整个修复分支。
- 同步在 `sync/*` 上 `git merge --no-ff upstream/main`，逐块解决冲突并保留 Nocturne 的产品行为（以 `AGENTS.md` 为准）；行为无法判定时列出差异请用户决定。
- push 与创建、合并 PR 需要用户在本次任务中同意。

## 提交

只在用户要求时提交；提交前 `pnpm lint` 与 `pnpm typecheck` 通过。标头 `type(scope): 中文说明`，不提交构建产物或无关文件。
