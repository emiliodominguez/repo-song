# repo-song

**Every git repo has a song.** `repo-song` reads a repository's history and turns it into a lofi track played on real sampled instruments: an upright piano, a Rhodes, bass, a dusty boom-bap kit, tape and vinyl. The busy stretches play fuller, the quiet ones break down, releases land home, and new contributors join the band.

```bash
npx repo-song            # in any git repo → <repo>.wav, plus its liner notes
```

> Status: pre-release (0.1.0). Not on npm yet; run it from source (below).

```
$ repo-song ~/src/react
Composing in A# minor, 70 BPM, 1:36

Liner notes
   0:00  intro
   0:13  verse      2013 – 2016 · 6122 commits · busiest stretch · 653 new contributors
   0:27  verse      2016 – 2018 · 4209 commits · 701 new contributors · releases v15.0.0, v16.0.0
   0:41  chorus     2018 – 2021 · 3883 commits · 300 new contributors · release v17.0.0
   0:54  chorus     2021 – 2024 · 3710 commits · 190 new contributors · release v18.0.0
   1:08  verse      2024 – 2026 · 3805 commits · 203 new contributors · release v19.0.0
   1:22  outro
```

## How a history becomes a song

- **Identity from the first commit.** The root commit seeds the key, mode, tempo, swing, the two chord progressions and the two melodic themes. A repo keeps its song as it grows; two clones sound identical.
- **Form from the timeline.** The project's life is cut into equal slices, one four-bar phrase each, between an intro and an outro. A phrase's energy follows how busy its slice was (log-scaled, blended with a gentle musical arc so a project that peaked early still has a song that lands).
- **The quietest stretch becomes a breakdown:** the drums drop to a pulse, the filter closes, the melody plays a fragment.
- **Milestone releases resolve to the tonic** and the drums stop dead before the next phrase. With many tags, only major versions count.
- **New contributors add a voice:** the piano melody gains a harmony line in that phrase.

## What you get

- About 90 seconds (configurable) of 24-bit / 48 kHz stereo WAV, mastered to streaming loudness (about −14 LUFS, true peaks at −1.5 dBFS), with real dynamics (7–10 dB between the quietest and busiest moments, like the reference records).
- Liner notes on stdout: each section, when it starts, and the stretch of history it plays.
- No native dependencies. Composition, synthesis, sampling, reverb and mastering are plain TypeScript; a 90 s song renders in about 9 s on an M-series Mac, even for a repo with 20 000 commits.

## Run from source

Requires Node 22.18+ (Node 26.5 for development, see `.node-version`) and pnpm.

```bash
pnpm install
pnpm song ~/path/to/some/repo           # writes some-repo.wav in the current directory
pnpm song . -o my-song.wav -s 150       # about two and a half minutes
```

The first run downloads the instrument recordings (about 255 MB, CC0) into your cache directory (`~/Library/Caches/repo-song` on macOS, `$XDG_CACHE_HOME/repo-song` or `~/.cache/repo-song` on Linux, `%LOCALAPPDATA%\repo-song` on Windows). Set `REPO_SONG_ASSETS` to use another folder. Bare clones work too, so `git clone --bare --filter=tree:0 <url>` is enough to hear any public project.

### Options

| Flag                | Meaning                                    |
| ------------------- | ------------------------------------------ |
| `-o, --out <file>`  | Output WAV (default `<repo>.wav`)          |
| `-s, --seconds <n>` | Approximate length, 30 to 300 (default 90) |
| `--seed <text>`     | Seed to use instead of the root commit     |
| `-h, --help`        | Help                                       |
| `-v, --version`     | Version                                    |

Messages follow your locale (`LANG`); English and Spanish are included.

## How it sounds the way it does

- **Real recordings** (Versilian Community Sample Library, CC0) for the upright piano, snare, side-stick, hi-hats and shaker, with velocity layers, round robins and key-release noise.
- **Modelled** instruments where no free library is clean to use: a Rhodes (FM tine, hammer thump, pickup bark, suitcase tremolo), a modal fingered bass, a kick and a pad.
- **Writing:** extended chords (maj9, m9, 13, sus9, m11…) in curated lofi progressions, voice-led rootless voicings, Rhodes figures that anticipate the next chord, bass locked to the kick with approach notes, a swung groove with a lazy snare and ghost notes, and a motif-based piano melody that never rubs a half step against the chords under it (a test checks this).
- **Production:** an SP-1200-style drum bus, one convolution room for the whole band, filter and level automation that follows the form, tape wow and flutter, glue compression, a matching EQ that keeps the mix inside the tonal range of real lofi records, vinyl, and a look-ahead limiter.

Details, numbers and how the mix was tuned: [docs/sound.md](docs/sound.md). Code layout and the determinism contract: [docs/architecture.md](docs/architecture.md). What's next: [docs/roadmap.md](docs/roadmap.md).

## Development

```bash
pnpm check                  # format, lint (oxlint, type-aware), typecheck, tests, build
pnpm analyze repo-a repo-b  # render and print tonal balance, loudness, dynamics, part levels
pnpm reference-curve        # re-measure the reference records (needs ffmpeg)
```

The sound regression test (`tests/unit/render.test.ts`) needs the recordings and is skipped without them.

## Credits and license

Code: MIT. Instrument recordings: CC0, by Versilian Studios; see [CREDITS.md](CREDITS.md). The seeded RNG and the first composer came from [music-radio](https://github.com/emiliodominguez/music-radio).
