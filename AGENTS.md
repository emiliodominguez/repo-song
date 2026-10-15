# AGENTS.md

repo-song: a CLI that turns a git repo's history into a deterministic lofi song (see README.md, docs/).

## Commands

- `pnpm check`: the gate (prettier, oxlint type-aware, tsc, vitest, build). Must pass before committing.
- `pnpm song <repo>`: render a song from source. `pnpm analyze <repos…>`: render and print tonal balance, loudness, dynamics, part levels. `pnpm reference-curve`: re-measure the reference records (ffmpeg).
- `pnpm assets:manifest`: regenerate `scripts/vcsl-manifest.json` after changing `src/instruments/catalog.ts` (set `GITHUB_TOKEN`), then `pnpm assets:pack` to rebuild `assets/` (ffmpeg; verifies every file against its source).
- Recordings: `assets/` (committed, shipped in the npm package). `REPO_SONG_ASSETS=<dir>` points at another copy.
- Releases: docs/releasing.md. Never publish by hand without being asked.

## Invariants

- **Same repo, same song.** The root commit fixes the identity (key, mode, tempo, progressions, themes); the history shapes the form. Never add, remove or reorder RNG draws in `src/compose` or `src/render` as a side effect; each concern has its own stream (docs/architecture.md). If a change is meant to alter the sound, say so, listen to before/after renders, and re-pin the hashes in `tests/unit/compose.test.ts` and `tests/unit/render.test.ts` in the same commit.
- The musical invariants in `tests/unit/compose.test.ts` (no half-step rubs, registers, voice leading, form) are requirements, not snapshots: fix the writing, never loosen the test.
- Judge sound changes with `pnpm analyze` (tonal balance inside the reference range, peak ≤ −1.5 dBFS, loudness spread around 7–11 dB) and then by ear. The audiobox-aesthetics model was tried and is not a valid judge for lofi (docs/sound.md).
- Only CC0 or CC-BY recordings. No NC or SA sources.
- User-facing text lives in `src/i18n` (English primary, Spanish checked against it). Errors are `RepoSongError(code, params)`; diagnostics stay in English.
- No native dependencies, no runtime npm dependencies unless clearly worth it: `npx` start-up time and install size matter. The package stays offline: no network access at runtime.

## Style

Function declarations (no arrow functions assigned to variables), tabs, print width 150, JSDoc on every function with `@param`/`@returns`, conventional commits with sentence-case subjects and no co-author trailers.
