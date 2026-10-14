// Minimal music theory so randomness stays musical: notes are constrained to a scale, chords move by diatonic steps.

export const SCALES = {
	major: [0, 2, 4, 5, 7, 9, 11],
	minor: [0, 2, 3, 5, 7, 8, 10],
	dorian: [0, 2, 3, 5, 7, 9, 10],
	phrygian: [0, 1, 3, 5, 7, 8, 10],
	lydian: [0, 2, 4, 6, 7, 9, 11],
	mixolydian: [0, 2, 4, 5, 7, 9, 10],
	harmonicMin: [0, 2, 3, 5, 7, 8, 11],
	pentaMinor: [0, 3, 5, 7, 10],
	pentaMajor: [0, 2, 4, 7, 9],
} as const satisfies Record<string, readonly number[]>;

export type ScaleName = keyof typeof SCALES;

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/**
 * Semitone offset from the root for a scale-degree index; degrees past the scale wrap into higher octaves.
 *
 * @param scale - Scale intervals.
 * @param degreeIndex - Degree index (may be negative or exceed the scale length).
 * @returns Semitones from the root.
 */
export function intervalAtDegree(scale: readonly number[], degreeIndex: number): number {
	const len = scale.length;
	const oct = Math.floor(degreeIndex / len);
	const idx = ((degreeIndex % len) + len) % len;

	return scale[idx] + 12 * oct;
}
