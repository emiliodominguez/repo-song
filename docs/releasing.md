# Releasing

Releases go out from CI (`.github/workflows/release.yml`), so every version is built from a clean checkout and carries an npm provenance statement linking it to the commit it came from.

## Every release

1. `pnpm check` passes on `main`, and CI is green (it installs the packed tarball on Linux, macOS and Windows with Node 22, 24 and 26 and renders a song).
2. Listen to a couple of renders if anything under `src/compose`, `src/render`, `src/instruments` or `assets/` changed.
3. Bump the version and add a section to `CHANGELOG.md`:
    ```bash
    npm version minor --no-git-tag-version   # or patch / major
    git commit -am "chore: Release v0.2.0"
    git tag v0.2.0
    git push origin main v0.2.0
    ```
4. The workflow checks that the tag matches `package.json`, runs `pnpm check`, publishes with `--provenance`, and creates the GitHub release.

Any change to how a repo sounds is a minor version at least: people will have shared their song, and `npx repo-song` always runs the latest.

## One-time setup

1. Create the GitHub repository `emiliodominguez/repo-song` (the `repository` field in `package.json` points there; npm uses it for provenance and to resolve the README banner) and push `main`.
2. In the repository settings, add an environment named `npm`.
3. The first version has to be published with a token, because npm can only trust a workflow for a package that already exists: create a granular access token on npmjs.com (read and write, bypass 2FA, scoped to `repo-song` once it exists, otherwise to all packages), store it as the `NPM_TOKEN` secret of the `npm` environment, and push the `v0.1.0` tag.
4. Then, on npmjs.com → `repo-song` → Settings → Trusted publishing, add GitHub Actions with repository `emiliodominguez/repo-song`, workflow `release.yml` and environment `npm`. Delete the `NPM_TOKEN` secret and the token, and set "Require two-factor authentication and disallow tokens".

## What the package contains

`dist/` (compiled CLI), `assets/` (the instrument pack, 29 MB of FLAC), `README.md`, `LICENSE`, `CREDITS.md`. Check with `pnpm pack --dry-run`. The pack only changes through `pnpm assets:pack`, which verifies every file against its source recording.
