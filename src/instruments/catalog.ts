// Which recordings each sampled instrument uses. The pack (assets/<instrument>/) keeps VCSL's file names as FLAC; the
// source directories are what scripts/assets-pack.ts and scripts/assets-manifest.ts read.

/**
 * VCSL (Versilian Community Sample Library, CC0), pinned to a commit so the sound never changes underneath a seed.
 */
export const VCSL = { repo: "sgossner/VCSL", commit: "c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e" } as const;

const PIANO = "Chordophones/Zithers/Upright Piano, Yamaha";
const SNARE = "Membranophones/Struck Membranophones/Snare Drum, Modern 1";
const HATS = "Idiophones/Struck Idiophones/Hi-Hat Cymbal";
const SHAKER = "Idiophones/Struck Idiophones/Shaker, Small";

/**
 * Per instrument: the source directory inside VCSL and the file pattern (WAV in VCSL, FLAC in the pack); named groups
 * give note, layer and round robin.
 */
export const SAMPLED = {
	piano: { dir: `${PIANO}/Sustains`, pattern: /_Sus_(?<note>[A-G]#?\d)_vl(?<layer>\d)_rr(?<rr>\d)\.(?:wav|flac)$/u },
	pianoRelease: { dir: `${PIANO}/Releases`, pattern: /_Rel_(?<note>[A-G]#?\d)_vl(?<layer>\d)_rr(?<rr>\d)\.(?:wav|flac)$/u },
	snare: { dir: SNARE, pattern: /Snare2_HitSN_v(?<layer>\d)_rr(?<rr>\d)/u },
	sideStick: { dir: SNARE, pattern: /Snare2_stick_v(?<layer>\d)_rr(?<rr>\d)/u },
	closedHat: { dir: HATS, pattern: /HiHat_HitC_v(?<layer>\d)_rr(?<rr>\d)/u },
	openHat: { dir: HATS, pattern: /HiHat_HitO_rr(?<rr>\d)/u },
	shaker: { dir: SHAKER, pattern: /Mid_Shaker_Slap_rr(?<rr>\d)/u },
} as const;

export type SampledName = keyof typeof SAMPLED;

/**
 * Piano sustains are cut to this length in the pack. The longest note the composer writes is the closing chord, eight
 * beats at the slowest tempo (70 BPM, 6.9 s), plus 0.15 s of hold and about 0.9 s of damper decay; pitched up by at most
 * three semitones from 44.1 kHz recordings that reads 8.7 s of a sample. A test keeps that bound.
 */
export const PACK_SUSTAIN_SECONDS = 10;
