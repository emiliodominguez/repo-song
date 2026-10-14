// Which recordings each sampled instrument uses. Shared by the loader and by scripts/assets-manifest.ts.

/**
 * VCSL (Versilian Community Sample Library, CC0), pinned to a commit so the sound never changes underneath a seed.
 */
export const VCSL = { repo: "sgossner/VCSL", commit: "c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e" } as const;

const PIANO = "Chordophones/Zithers/Upright Piano, Yamaha";
const SNARE = "Membranophones/Struck Membranophones/Snare Drum, Modern 1";
const HATS = "Idiophones/Struck Idiophones/Hi-Hat Cymbal";
const SHAKER = "Idiophones/Struck Idiophones/Shaker, Small";

/**
 * Per instrument: the directory inside VCSL and the file pattern; named groups give note, layer and round robin.
 */
export const SAMPLED = {
	piano: { dir: `${PIANO}/Sustains`, pattern: /_Sus_(?<note>[A-G]#?\d)_vl(?<layer>\d)_rr(?<rr>\d)\.wav$/u },
	pianoRelease: { dir: `${PIANO}/Releases`, pattern: /_Rel_(?<note>[A-G]#?\d)_vl(?<layer>\d)_rr(?<rr>\d)\.wav$/u },
	snare: { dir: SNARE, pattern: /Snare2_HitSN_v(?<layer>\d)_rr(?<rr>\d)/u },
	sideStick: { dir: SNARE, pattern: /Snare2_stick_v(?<layer>\d)_rr(?<rr>\d)/u },
	closedHat: { dir: HATS, pattern: /HiHat_HitC_v(?<layer>\d)_rr(?<rr>\d)/u },
	openHat: { dir: HATS, pattern: /HiHat_HitO_rr(?<rr>\d)/u },
	shaker: { dir: SHAKER, pattern: /Mid_Shaker_Slap_rr(?<rr>\d)/u },
} as const;

export type SampledName = keyof typeof SAMPLED;
