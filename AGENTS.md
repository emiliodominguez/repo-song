# AGENTS.md

repo-song: a CLI that turns a git repo's history into a deterministic lofi song (see README.md, docs/).

## Commands

- `pnpm check`: the gate (prettier, oxlint type-aware, tsc, vitest, build). Must pass before committing.
- `pnpm song <repo>`: render a song from source. `pnpm analyze <repo>`: render and print tonal balance, loudness, peak, part levels.
- `pnpm assets:manifest`: regenerate `src/assets-manifest.json` after changing `src/instruments/catalog.ts` (set `GITHUB_TOKEN`).
- Recordings: `REPO_SONG_ASSETS=<dir>` points at a local copy; otherwise the cache directory is used and filled on first run.

## Invariants

- **Same repo, same song.** Never add, remove or reorder RNG draws in `src/compose` or `src/render` as a side effect. If a change is meant to alter the sound, say so, listen to before/after renders, and re-pin the hashes in `tests/unit/compose.test.ts` and `tests/unit/render.test.ts` in the same commit.
- Judge sound changes with `pnpm analyze` (band deltas within about ±4 dB of the reference, peak ≤ −1.5 dBFS) and then by ear. The audiobox-aesthetics model was tried and is not a valid judge for lofi (docs/sound.md).
- Only CC0 or CC-BY recordings. No NC or SA sources.
- User-facing text lives in `src/i18n` (English primary, Spanish checked against it). Errors are `RepoSongError(code, params)`; diagnostics stay in English.
- No native dependencies, no runtime npm dependencies unless clearly worth it: `npx` start-up time and install size matter.

## Style

Function declarations (no arrow functions assigned to variables), tabs, print width 150, JSDoc on every function with `@param`/`@returns`, conventional commits with sentence-case subjects and no co-author trailers.
