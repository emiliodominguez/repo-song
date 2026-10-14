# Roadmap

Ordered by what most helps the project spread: people sharing what their repo sounds like.

## 1. Let the history write the song

Today the history only provides a seed, so a 10-year monorepo and a weekend script differ only by chance. Make the shape of the song come from the shape of the history:

- commit density over time → sections and an energy curve (busy periods build, quiet stretches break down);
- contributors → instruments or voices entering as people join;
- big diffs → drops or fills; release tags → resolutions to the tonic;
- language mix or repo age → mode, tempo, swing.

Keep the root-commit seed for everything that should stay stable, so a song evolves with its repo but stays recognisable. This needs a decision on how much a song may change as a repo grows.

## 2. Composition quality

- Voicings: rootless 9ths/11ths, drop-2, voice leading between chords instead of block triads.
- Drums: ghost notes, hat velocity accents, fills at phrase ends, occasional side-stick backbeat.
- Bass: approach notes, rhythmic variation tied to the kick.
- Arrangement: intro, A/B sections, a breakdown, an outro, instead of one texture for the whole track.

## 3. Shareable output

- MP3/AAC output (pure-JS encoder) next to WAV.
- A short video (waveform or cover art from the repo) for social posts.
- A README badge ("▶ Listen to this repo") linking to a hosted render. This is the loop that spreads it.
- A gallery of famous repos rendered ahead of launch.

## 4. First-run download size

255 MB of 24-bit WAV is too heavy for `npx`. Build a compact pack: trim tails and silence, keep only the layers the renderer uses, encode losslessly (FLAC via a WASM decoder) or as high-bitrate Opus, host it as a release asset. Target: under 40 MB.

## 5. Publish

npm publish, provenance, a release workflow, `npx repo-song` in the README for real.

## Sound backlog

- Re-measure `LOFI_TONE` with the same band method `matchTone` uses (see sound.md, known limits). Changes every song; do it together with other deliberate sound changes.
- More references for the target curve (two is thin).
- A sampled Rhodes if a CC0/CC-BY one turns up (jRhodes3d is CC BY-NC and so excluded).
- Other genres (ambient, jazz, house) on the same engine. music-radio has profiles to start from.
