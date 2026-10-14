// Lofi harmony: extended chords, curated progressions, chord-scales and voice-led rootless voicings.

import type { Rng } from "./rng.ts";

/**
 * Chord qualities as semitones above the chord root.
 */
export const QUALITIES = {
	maj7: [0, 4, 7, 11],
	maj9: [0, 4, 7, 11, 14],
	six9: [0, 4, 7, 9, 14],
	m7: [0, 3, 7, 10],
	m9: [0, 3, 7, 10, 14],
	m11: [0, 3, 7, 10, 14, 17],
	m6: [0, 3, 7, 9],
	dom9: [0, 4, 7, 10, 14],
	dom13: [0, 4, 10, 14, 21],
	sus9: [0, 5, 7, 10, 14],
	m7b5: [0, 3, 6, 10],
	dom7b9: [0, 4, 7, 10, 13],
} as const;

export type Quality = keyof typeof QUALITIES;

export interface Chord {
	/**
	 * Root as semitones above the key's tonic (0..11).
	 */
	root: number;
	quality: Quality;
}

export type Family = "major" | "minor";

/**
 * Parent scales (semitones above the tonic) used for melody notes.
 */
export const PARENT_SCALES = {
	major: [0, 2, 4, 5, 7, 9, 11],
	dorian: [0, 2, 3, 5, 7, 9, 10],
	aeolian: [0, 2, 3, 5, 7, 8, 10],
} as const;

export type ParentScale = keyof typeof PARENT_SCALES;

export interface Progression {
	family: Family;
	scale: ParentScale;
	chords: Chord[];
}

/**
 * Builds a chord from a roman-numeral-ish shorthand: root semitones and quality.
 *
 * @param root - Semitones above the tonic.
 * @param quality - Chord quality.
 * @returns The chord.
 */
function c(root: number, quality: Quality): Chord {
	return { root, quality };
}

/**
 * Four-bar progressions that sit in the lofi / neo-soul vocabulary. One chord per bar.
 */
export const PROGRESSIONS: Progression[] = [
	// major
	{ family: "major", scale: "major", chords: [c(0, "maj9"), c(9, "m9"), c(2, "m9"), c(7, "sus9")] }, // I vi ii V
	{ family: "major", scale: "major", chords: [c(5, "maj9"), c(4, "m7"), c(9, "m9"), c(0, "maj9")] }, // IV iii vi I
	{ family: "major", scale: "major", chords: [c(2, "m9"), c(7, "dom13"), c(0, "maj9"), c(9, "m9")] }, // ii V I vi
	{ family: "major", scale: "major", chords: [c(0, "maj7"), c(4, "m7"), c(5, "maj9"), c(5, "m6")] }, // I iii IV iv
	{ family: "major", scale: "major", chords: [c(5, "maj9"), c(7, "sus9"), c(4, "m7"), c(9, "m9")] }, // IV V iii vi
	{ family: "major", scale: "major", chords: [c(0, "six9"), c(10, "dom9"), c(5, "maj9"), c(5, "m6")] }, // I bVII IV iv
	// minor
	{ family: "minor", scale: "aeolian", chords: [c(0, "m9"), c(5, "m9"), c(10, "dom9"), c(3, "maj7")] }, // i iv bVII bIII
	{ family: "minor", scale: "aeolian", chords: [c(0, "m9"), c(8, "maj7"), c(5, "m9"), c(7, "m7")] }, // i bVI iv v
	{ family: "minor", scale: "aeolian", chords: [c(2, "m7b5"), c(7, "dom7b9"), c(0, "m9"), c(0, "m11")] }, // ii° V i
	{ family: "minor", scale: "dorian", chords: [c(0, "m9"), c(5, "dom9"), c(0, "m11"), c(5, "dom9")] }, // i IV (dorian vamp)
	{ family: "minor", scale: "aeolian", chords: [c(8, "maj9"), c(7, "m7"), c(5, "m9"), c(0, "m9")] }, // bVI v iv i
	{ family: "minor", scale: "dorian", chords: [c(0, "m11"), c(3, "maj7"), c(5, "dom9"), c(10, "six9")] }, // i bIII IV bVII
];

/**
 * Pitch classes (0..11, relative to the tonic) of a chord.
 *
 * @param chord - Chord.
 * @returns Pitch classes in chord-tone order (root first).
 */
export function chordPcs(chord: Chord): number[] {
	return QUALITIES[chord.quality].map(function pc(i) {
		return (chord.root + i) % 12;
	});
}

/**
 * Notes that sound good over a chord: its tones plus parent-scale tones that are not a half step above a chord tone
 * (the classic "avoid notes").
 *
 * @param chord - Chord.
 * @param scale - Parent scale.
 * @returns Pitch classes relative to the tonic.
 */
export function chordScale(chord: Chord, scale: ParentScale): number[] {
	const tones = new Set(chordPcs(chord));
	const out = new Set(tones);

	for (const pc of PARENT_SCALES[scale]) {
		if (!tones.has((pc + 11) % 12)) {
			out.add(pc);
		}
	}

	return [...out].sort(function asc(a, b) {
		return a - b;
	});
}

/**
 * Picks two contrasting progressions of the same family: one for A sections, one for B.
 *
 * @param rng - Harmony RNG.
 * @returns A and B progressions.
 */
export function pickProgressions(rng: Rng): { a: Progression; b: Progression } {
	const family: Family = rng.chance(0.5) ? "major" : "minor";

	const pool = PROGRESSIONS.filter(function sameFamily(p) {
		return p.family === family;
	});

	const a = rng.pick(pool);

	const rest = pool.filter(function other(p) {
		return p !== a;
	});

	return { a, b: rng.pick(rest) };
}

/**
 * The tones a keyboard player would voice without the root (the bass has it): drop the root, and the fifth too when
 * that still leaves four notes.
 *
 * @param chord - Chord.
 * @returns Pitch classes to voice.
 */
function rootlessPcs(chord: Chord): number[] {
	const intervals = QUALITIES[chord.quality];

	let keep = intervals.filter(function notRoot(i) {
		return i !== 0;
	});

	if (keep.length > 4) {
		keep = keep.filter(function notFifth(i) {
			return i !== 7;
		});
	}

	return keep.slice(0, 4).map(function pc(i) {
		return (chord.root + i) % 12;
	});
}

/**
 * Every close-position and drop-2 voicing of the pitch classes whose notes fit in [lo, hi].
 *
 * @param pcs - Pitch classes (absolute, 0..11).
 * @param lo - Lowest allowed MIDI note.
 * @param hi - Highest allowed MIDI note.
 * @returns Voicings as ascending MIDI notes.
 */
function candidateVoicings(pcs: number[], lo: number, hi: number): number[][] {
	const out: number[][] = [];

	for (let rot = 0; rot < pcs.length; rot++) {
		const order = [...pcs.slice(rot), ...pcs.slice(0, rot)];

		for (let base = lo - 12; base <= hi; base++) {
			if (((base % 12) + 12) % 12 !== order[0]) {
				continue;
			}

			const close = [base];

			for (const pc of order.slice(1)) {
				let n = close[close.length - 1] + 1;

				while (((n % 12) + 12) % 12 !== pc) {
					n++;
				}

				close.push(n);
			}

			const drop2 = [...close];

			if (drop2.length >= 4) {
				drop2[drop2.length - 2] -= 12;
				drop2.sort(function asc(a, b) {
					return a - b;
				});
			}

			for (const v of [close, drop2]) {
				if (v[0] >= lo && v[v.length - 1] <= hi) {
					out.push(v);
				}
			}
		}
	}

	return out;
}

/**
 * Voices a chord rootless near a register centre, moving as little as possible from the previous voicing.
 *
 * @param chord - Chord.
 * @param tonic - MIDI pitch class offset of the key (0..11).
 * @param prev - Previous voicing, if any.
 * @param range - Allowed MIDI range and preferred centre.
 * @param range.lo - Lowest note.
 * @param range.hi - Highest note.
 * @param range.center - Preferred average pitch.
 * @returns Ascending MIDI notes.
 */
export function voiceChord(chord: Chord, tonic: number, prev: number[] | undefined, range: { lo: number; hi: number; center: number }): number[] {
	const pcs = rootlessPcs(chord).map(function abs(pc) {
		return (pc + tonic) % 12;
	});

	const candidates = candidateVoicings(pcs, range.lo, range.hi);
	let best: number[] = candidates[0] ?? [];
	let bestCost = Infinity;

	for (const v of candidates) {
		const mean = v.reduce((s, n) => s + n, 0) / v.length;
		let cost = Math.abs(mean - range.center) * 0.35;

		if (prev?.length) {
			// voice leading: each voice to the nearest note of the previous chord
			for (const n of v) {
				cost += Math.min(...prev.map((p) => Math.abs(p - n)));
			}
		}

		if (cost < bestCost) {
			bestCost = cost;
			best = v;
		}
	}

	return best;
}
