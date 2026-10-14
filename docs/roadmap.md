# Roadmap

Ordered by what most helps the project spread: people sharing what their repo sounds like.

## Done

- History writes the form: phrases per slice of the timeline, energy from activity, breakdowns at lulls, milestone releases resolving home, new contributors adding a harmony line, liner notes.
- Composition: extended-chord progressions, voice-led rootless voicings, anticipations, kick-locked bass with approaches, swung groove with ghost notes and stops, motif-based melody with call and response, no half-step rubs.
- Arrangement dynamics through the mix (filter and level automation), matching EQ against the range of four reference records.

## 1. First-run download size

255 MB of 24-bit WAV is too heavy for `npx`. Build a compact pack: trim tails, keep only what the renderer plays, encode losslessly (FLAC through a small WASM decoder) or as high-bitrate Opus, host it as a release asset. Target: under 40 MB. Needs a decision on where the pack is hosted (GitHub releases on this repo is the obvious choice).

## 2. Shareable output

- MP3/AAC next to WAV (a pure-JS encoder; check the licence before adding one).
- A short video (waveform plus the liner notes) for social posts.
- A README badge ("▶ Listen to this repo") linking to a hosted render. This is the loop that spreads it.
- A gallery of famous repos rendered ahead of launch (React, Express and friends already render well from bare clones).

## 3. Publish

npm publish with provenance, a release workflow, `npx repo-song` in the README for real.

## Sound backlog

- More reference records for the tonal range.
- A sampled Rhodes if a CC0/CC-BY one turns up.
- More progressions and drum patterns; occasional key change for long histories.
- Other genres (jazz, ambient, house) on the same engine.
