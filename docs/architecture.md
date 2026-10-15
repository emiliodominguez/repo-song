# Architecture

```
git history ──► story (form) ─┐
     │                         ├─► composer ──► notes per part + timed sections ──► renderer ──► mastered PCM ──► 24-bit WAV
     └► root commit (identity) ┘   harmony · groove · melody                       (render/lofi.ts)    (audio/wav.ts)
                                                                                         ▲
                                                           instrument pack (assets/ → audio/flac.ts → instruments/vcsl.ts)
```

## Modules

| Path                     | Role                                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli.ts`             | Argument parsing, progress (stderr), liner notes (stdout), error reporting. All text comes from `src/i18n`.                                                                                         |
| `src/history.ts`         | Root commit, every commit's time and author, tags with dates. Works in bare clones.                                                                                                                 |
| `src/compose/story.ts`   | The form: `songShape` (bars for a length and tempo), `planSections` (one phrase per history slice: energy, kind, releases, new contributors), `milestones` (which tags count).                      |
| `src/compose/harmony.ts` | Chord qualities, curated progressions, chord-scales with avoid notes removed, voice-led rootless voicings.                                                                                          |
| `src/compose/groove.ts`  | Swing, kick patterns, one bar of boom-bap with ghost notes, fills and stops; breakdown pulses.                                                                                                      |
| `src/compose/melody.ts`  | Two-bar motifs, call-and-response phrases, chord-tone landings, clash avoidance, harmony notes.                                                                                                     |
| `src/compose/lofi.ts`    | The composer: picks the identity from the root commit, lays out bars and chords, writes drums, Rhodes, pad, bass and piano.                                                                         |
| `src/compose/rng.ts`     | Seeded RNG (FNV-1a + Mulberry32), identical to music-radio's.                                                                                                                                       |
| `src/audio/*`            | FLAC decoder (verbatim, fixed, LPC, every stereo mode; bit-exact against the source WAVs), WAV reader and 24-bit writer.                                                                            |
| `src/instruments/*`      | VCSL catalog and loader (zones decode on first use), the offline multisample player, the modelled Rhodes/bass/kick/pad.                                                                             |
| `src/dsp/*`              | Filters (biquads, automated lowpass), dynamics, character (saturation, tape, vinyl, crunch, tremolo), FFT convolution and room IR, tone analysis and matching EQ, buffer helpers (gain automation). |
| `src/render/lofi.ts`     | Renders each part, levels and sums them, adds the shared room, automates filter and level by section, masters.                                                                                      |
| `src/assets.ts`          | Where the instrument pack is: `assets/` next to `src/` or `dist/`, or `REPO_SONG_ASSETS`.                                                                                                           |

## The determinism contract

1. **Identity is fixed by the root commit.** Key, mode, tempo, swing, progressions and themes depend only on it, so a repo keeps its song as it grows.
2. **Form follows the history.** New commits shift the slices, so a song evolves with its repo: same tune, a different story. The tests check that adding a commit keeps key, mode and tempo.
3. **Each concern has its own seeded stream** (`identity:`, `harmony:`, `groove:`, `comp:`, `bass:`, `melody:`, `render:`, `room:`, `vinyl:` + seed). Changing how the bass is written doesn't reshuffle the drums.
4. **The recordings are pinned** to one VCSL commit and shipped losslessly in `assets/`; `scripts/assets-pack.ts` rebuilds the pack and refuses any file that does not decode to its source.

Two golden hashes guard the sound: `tests/unit/compose.test.ts` (the composed song for a fixture history) and `tests/unit/render.test.ts` (the rendered PCM). Change them only on purpose, after listening. `Math.sin`/`exp`/`tanh` are deterministic within a V8 version, so a Node upgrade can legitimately move the render hash.

## Musical invariants under test

- Every progression voices in range for every key, with average voice movement under 4.5 semitones.
- Chord-scales never contain a note a half step above a chord tone (unless it is itself a chord tone).
- The piano never sounds a half step or minor ninth against any Rhodes or pad note under it (16 seeds).
- Every part stays in its register; the intro has no drums or bass; the form covers every bar; the fixture's burst, lull, releases and newcomers show up where they should.
- The render's intro and breakdown sit at least 4 and 3 dB below the busiest phrase.

## Performance

A 90 s song takes about 9 s on an M-series Mac. The FFT uses cached twiddle tables and packs left and right into one complex transform; the band analysis filters all ten bands in a single pass; the Rhodes and bass use rotating oscillators and multiplicative envelopes instead of per-sample `sin`/`exp`.

## Conventions

TypeScript run directly by Node (type stripping) in development and compiled by `tsc` for publishing. Function declarations, tabs, 150 columns, JSDoc on every function, conventional commits; see `AGENTS.md`. `noUncheckedIndexedAccess` is off on purpose: DSP code indexes typed arrays in every inner loop.
