# repo-song

**Every git repo has a song.** `repo-song` reads a repository's history and turns it into a lofi track played on real sampled instruments: an upright piano, a Rhodes, bass, a dusty boom-bap kit, tape and vinyl. The same repo always gets the same song.

```bash
npx repo-song            # in any git repo → <repo>.wav
```

> Status: pre-release (0.1.0). Not on npm yet; run it from source (below).

## What you get

- A 45-second (configurable) stereo track, 24-bit / 48 kHz WAV, mastered to streaming loudness (about −15.5 LUFS, peaks at −1.5 dBFS).
- Deterministic: the seed is the repo's **root commit**, so a repo keeps its song as it grows, and two clones of the same project sound identical.
- No native dependencies. Synthesis, sampling, reverb and mastering are plain TypeScript; it renders a 45 s song in about 7 s on an M-series Mac.

## Run from source

Requires Node 22.18+ (Node 26.5 for development, see `.node-version`) and pnpm.

```bash
pnpm install
pnpm song ~/path/to/some/repo           # writes some-repo.wav in the current directory
pnpm song . -o my-song.wav -s 90        # 90 seconds
```

The first run downloads the instrument recordings (about 255 MB, CC0) into your cache directory (`~/Library/Caches/repo-song` on macOS, `$XDG_CACHE_HOME/repo-song` or `~/.cache/repo-song` on Linux, `%LOCALAPPDATA%\repo-song` on Windows). Set `REPO_SONG_ASSETS` to use another folder.

### Options

| Flag                | Meaning                                |
| ------------------- | -------------------------------------- |
| `-o, --out <file>`  | Output WAV (default `<repo>.wav`)      |
| `-s, --seconds <n>` | Length, 15 to 300 (default 45)         |
| `--seed <text>`     | Seed to use instead of the root commit |
| `-h, --help`        | Help                                   |
| `-v, --version`     | Version                                |

Messages follow your locale (`LANG`); English and Spanish are included.

## How it sounds the way it does

The composition picks a key, mode and tempo from the seed, walks a diatonic chord progression, comps it on Rhodes, lays a bass line and a phrased piano melody on top, and grooves on a swung boom-bap pattern. The renderer then:

- plays the **piano, snare, side-stick, hi-hats and shaker from real multisampled recordings** (Versilian Community Sample Library, CC0), with velocity layers, round robins and key-release noise;
- **models** the instruments no free library covers well: a Rhodes (FM tine, pickup bark, suitcase tremolo), a modal fingered bass, a kick and a warm pad;
- runs the drums through an **SP-1200-style bus** (26 kHz, 12-bit), puts everything in **one convolution room**, and masters with tape wow and flutter, glue compression, a **matching EQ toward the tonal balance of real lofi records**, vinyl surface noise and a look-ahead limiter.

Details, numbers and how the mix was tuned: [docs/sound.md](docs/sound.md). Code layout and the determinism contract: [docs/architecture.md](docs/architecture.md). What's next: [docs/roadmap.md](docs/roadmap.md).

## Development

```bash
pnpm check        # format, lint (oxlint, type-aware), typecheck, tests, build
pnpm analyze ~/some/repo   # render and print tonal balance, loudness, peak, part levels
```

The sound regression test (`tests/unit/render.test.ts`) needs the recordings and is skipped without them.

## Credits and license

Code: MIT. Instrument recordings: CC0, by Versilian Studios; see [CREDITS.md](CREDITS.md). The composer began life in [music-radio](https://github.com/emiliodominguez/music-radio).
