# Changelog

All notable changes to this project. Versions follow [semver](https://semver.org); any change to how a repo sounds is at least a minor version.

## 0.1.0

First release.

- `npx repo-song [path]` turns a git repository's history into a lofi song: a 24-bit / 48 kHz WAV of about 90 seconds (30 to 300 with `--seconds`), mastered to about −14 LUFS, plus liner notes mapping each section to the stretch of history it plays.
- The root commit fixes the song's identity (key, mode, tempo, swing, progressions, themes); the history writes the form: busy stretches play fuller, the quietest one breaks down, major releases resolve home, new contributors add a harmony line.
- Real recordings (VCSL upright piano, snare, hi-hats, shaker; CC0) shipped in the package as lossless FLAC, with a modelled Rhodes, bass, kick and pad. No network access, no native or runtime dependencies.
- English and Spanish messages, picked from `LANG`.
