# 上游协作流程

## 远端与工作区

| 远端 | URL | 职责 |
| --- | --- | --- |
| origin | https://github.com/STERILITZIA02/Bewly_Nocturne.git | Nocturne 定制与发布 |
| upstream | https://github.com/keleus/BewlyCat.git | 只读上游参考，永不推送 |
| contrib | https://github.com/STERILITZIA02/BewlyCat.git | 独立贡献给 BewlyCat 的修复 |

开始写入前检查 `git status --short --branch`、`git remote -v`、`git branch -vv`、`git rev-parse HEAD` 和 `git stash list`。核对当前任务的分支要求与其他写入者，保留已有修改和 stash。

当前连续开发沿用用户指定的 `message_feature` → `origin/message_feature`。不要因通用流程自动切分支或创建 worktree。以下规则用于用户授权的新协作任务。

## 分支与来源

| 工作类型 | 基线 | 分支 | 推送目标 |
| --- | --- | --- | --- |
| Nocturne 功能、外观与个人定制 | origin/main | 任务指定 | origin |
| 可独立贡献的上游修复 | upstream/main | fix/* | contrib |
| 将独立修复移回 Nocturne | origin/main | port/* | origin |
| 同步上游 | origin/main | sync/* | origin |

- 上游修复使用 `git merge-base --is-ancestor upstream/main HEAD`、`git log --oneline upstream/main..HEAD` 和 `git diff --stat upstream/main...HEAD` 检查来源与范围，排除 Nocturne 品牌、维护文档和无关格式化。
- 移植使用 `git cherry-pick -x <sha>`，不合并整个修复分支。
- 同步在 `sync/*` 使用 `git merge --no-ff upstream/main`；逐块解决冲突，保留本地产品行为。行为无法明确判定时先说明差异。
- 推送与创建、合并 PR 需要本次任务授权；本流程本身不授权执行这些操作。

## 验证与收尾

开发验证使用现有 `pnpm dev`。按改动范围运行测试；实际提交前 `pnpm lint` 与 `pnpm typecheck` 必须通过。提交遵循 `type(scope): 中文说明`，不把构建产物或无关文件加入提交。

完成后报告实际检查结果、未验证范围和工作区状态。清理临时 worktree 前检查其未提交内容；不使用强制删除、reset、clean 或整文件 ours/theirs 掩盖冲突。
