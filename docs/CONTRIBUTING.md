# Contribution guide

[简体中文](CONTRIBUTING-cmn_CN.md) · [繁體中文](CONTRIBUTING-cmn_TW.md)

## Development

Use the pnpm version declared in `package.json`:

```sh
pnpm install
pnpm dev
```

Enable Developer mode in Chrome/Edge and load `extension/`. Reload the extension and refresh Bilibili after code changes. Reuse an existing development watcher; do not start duplicate watchers or stop another task's process.

`pnpm start:chromium` opens a separate development window. Its `chromium-web-ext-profile/` directory contains local browser data and is not a cleanup target.

## Checks and releases

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm knip
```

Do not run production builds for development verification. For a release, use `pnpm build` and `pnpm pack:zip`; Safari uses `pnpm build-safari`.

Report source/component checks separately from browser acceptance after reloading. Verify server writes against the response and a subsequent state read.

## Branches and commits

Follow the [upstream workflow](maintenance/upstream-workflow.md) and [project conventions](../AGENTS.md). Preserve the branch requested by the task. Do not develop directly on main or mix Nocturne customizations into upstream fixes.

Use Conventional Commits with a Chinese description: `type(scope): description`. Lint and typecheck must pass before committing. Keep generated artifacts, tests files and unrelated changes out of PRs.

## Translations

Maintain the four languages in `src/_locales/`, keeping keys aligned with actual UI entries. Remove translations with retired features and avoid reformatting unrelated content.
