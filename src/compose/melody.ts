// Piano melody: a two-bar motif stated as a call, answered with a resolving response, landing on chord tones on
// strong beats and moving by step through each chord's own scale.

import type { Note } from "../types.ts";
import { swingOffset } from "./groove.ts";
import { type Chord, chordPcs, chordScale, type ParentScale } from "./harmony.ts";
import type { Rng } from "./rng.ts";

/**
 * Two-bar rhythms as [start beat, length in beats]; each leaves air at the end so the phrase breathes.
 */
const RHYTHMS: [number, number][][] = [
	[
		[0, 1.5],
		[1.5, 0.5],
		[2, 1],
		[3, 1],
		[4, 3],
	],
	[
		[0.5, 0.5],
		[1, 0.5],
		[1.5, 1],
		[2.5, 1.5],
		[4.5, 0.5],
		[5, 2],
	],
	[
		[0, 0.5],
		[0.5, 0.5],
		[1, 1],
		[2, 2],
		[5, 0.5],
		[5.5, 0.5],
		[6, 1.5],
	],
	[
		[1, 0.5],
		[1.5, 0.5],
		[2, 0.5],
		[2.5, 1.5],
		[4, 1],
		[5, 2],
	],
	[
		[0, 2],
		[2, 0.5],
		[2.5, 0.5],
		[3, 1],
		[4, 1],
		[5, 1],
		[6, 1.5],
	],
	[
		[0, 1],
		[1, 1],
		[2, 1],
		[3, 0.5],
		[3.5, 2.5],
	],
	[
		[0.5, 1],
		[1.5, 0.5],
		[2, 1.5],
		[4, 0.5],
		[4.5, 0.5],
		[5, 0.5],
		[5.5, 2],
	],
	[
		[0, 0.75],
		[0.75, 0.75],
		[1.5, 1],
		[2.5, 1.5],
		[4.5, 1],
		[5.5, 2],
	],
];

export interface Motif {
	rhythm: [number, number][];
	/**
	 * Scale-step movement into each note after the first.
	 */
	steps: number[];
}

/**
 * Invents a motif.
 *
 * @param rng - Melody RNG.
 * @param avoid - A rhythm index not to reuse (so A and B themes differ).
 * @returns The motif and its rhythm index.
 */
export function makeMotif(rng: Rng, avoid = -1): { motif: Motif; index: number } {
	let index = rng.int(0, RHYTHMS.length - 1);

	if (index === avoid) {
		index = (index + 1 + rng.int(0, RHYTHMS.length - 2)) % RHYTHMS.length;
	}

	const rhythm = RHYTHMS[index];

	const steps = rhythm.map(function step(_, i) {
		return i === 0 ? 0 : rng.weighted([-3, -2, -1, 1, 2, 3], [1, 2, 4, 4, 2, 1]);
	});

	return { motif: { rhythm, steps }, index };
}

const LO = 64;
const HI = 86;

/**
 * All pitches of a pitch-class set within the melody range.
 *
 * @param pcs - Pitch classes relative to the tonic.
 * @param tonic - Key tonic pitch class.
 * @returns Ascending MIDI notes.
 */
function pitchesOf(pcs: number[], tonic: number): number[] {
	const out: number[] = [];

	for (let n = LO; n <= HI; n++) {
		if (pcs.includes((((n - tonic) % 12) + 12) % 12)) {
			out.push(n);
		}
	}

	return out;
}

/**
 * Nearest member of a sorted list.
 *
 * @param list - Ascending notes.
 * @param n - Target.
 * @returns Closest note.
 */
function nearest(list: number[], n: number): number {
	let best = list[0] ?? n;

	for (const x of list) {
		if (Math.abs(x - n) < Math.abs(best - n)) {
			best = x;
		}
	}

	return best;
}

export interface PhraseContext {
	/**
	 * Phrase onset in seconds.
	 */
	start: number;
	secPerBeat: number;
	swing: number;
	tonic: number;
	scale: ParentScale;
	/**
	 * Chord sounding at a beat offset from the phrase start.
	 */
	chordAt: (beat: number) => Chord;
	energy: number;
	/**
	 * Add a lower harmony note to longer notes (new contributors joined).
	 */
	harmonize: boolean;
	/**
	 * Play only the call, with longer notes (breakdowns, outros).
	 */
	callOnly: boolean;
	/**
	 * End the response on the tonic (a release landed in this slice).
	 */
	resolveToTonic: boolean;
	/**
	 * Skip the call and come in with the response (the melody's first entrance, after the groove settles).
	 */
	responseOnly: boolean;
	/**
	 * How many times this theme has already played; repeats get small variations.
	 */
	repeat: number;
	/**
	 * Whether a pitch held over a time span would rub a half step (or a minor ninth) against any chord note in it.
	 */
	clashes: (pitch: number, from: number, to: number) => boolean;
}

/**
 * Plays a four-bar phrase of the motif: call in bars 1-2, response in bars 3-4.
 *
 * @param rng - Melody RNG.
 * @param motif - Theme.
 * @param ctx - Where and over what it plays.
 * @param startPitch - Pitch to begin near (the previous phrase's last note, for continuity).
 * @returns Notes and the last pitch played.
 */
export function playPhrase(rng: Rng, motif: Motif, ctx: PhraseContext, startPitch: number): { notes: Note[]; last: number } {
	const notes: Note[] = [];
	let cur = startPitch;
	const halves = ctx.callOnly ? [0] : ctx.responseOnly ? [8] : [0, 8];

	for (const half of halves) {
		const response = half === 8;

		for (const [i, [at, len]] of motif.rhythm.entries()) {
			const beat = half + at;
			const chord = ctx.chordAt(beat);
			const scalePitches = pitchesOf(chordScale(chord, ctx.scale), ctx.tonic);
			const tonePcs = chordPcs(chord);
			const colourTones = pitchesOf(tonePcs.slice(1), ctx.tonic);
			const isLast = i === motif.rhythm.length - 1;

			// repeats breathe differently: now and then a note becomes a rest
			if (ctx.repeat > 0 && i > 0 && !isLast && rng.chance(0.14)) {
				continue;
			}

			if (i === 0 && (!response || ctx.responseOnly)) {
				cur = nearest(colourTones, cur);
			} else {
				const idx = scalePitches.indexOf(nearest(scalePitches, cur));
				const step = (motif.steps[i] ?? 0) * (response && i > motif.rhythm.length / 2 ? -1 : 1);

				cur = scalePitches[Math.max(0, Math.min(scalePitches.length - 1, idx + step))] ?? cur;
			}

			// strong beats sit on chord tones; the very last note resolves
			if (beat % 2 === 0) {
				cur = nearest(colourTones, cur);
			}

			if (response && isLast) {
				const home = ctx.resolveToTonic ? [0] : [tonePcs[0] ?? 0, tonePcs[1] ?? 0];

				cur = nearest(pitchesOf(home, ctx.tonic), cur);
			}

			const start = ctx.start + beat * ctx.secPerBeat + swingOffset(beat * 4, ctx.secPerBeat / 4, ctx.swing) + rng.gauss() * 0.006;
			const hold = (isLast && response ? len + 1 : len) * (ctx.callOnly ? 1.4 : 1);
			const end = start + hold * ctx.secPerBeat * 0.95;

			// never rub against the chords under the note, including an anticipation of the next one arriving mid-note
			if (ctx.clashes(cur, start, end)) {
				const clean = scalePitches.filter((p) => !ctx.clashes(p, start, end));

				cur = clean.length ? nearest(clean, cur) : cur;
			}

			const accent = beat % 4 === 0 ? 8 : beat % 1 === 0 ? 3 : -2;
			const vel = Math.round(60 + accent + ctx.energy * 10 + rng.int(-4, 4) - (isLast ? 5 : 0));

			notes.push({ note: cur, vel, start, end });

			if (ctx.harmonize && len >= 1) {
				const below = pitchesOf(tonePcs, ctx.tonic).filter(function under(n) {
					return n <= cur - 3 && n >= cur - 9;
				});

				const harmony = below[below.length - 1];

				if (harmony !== undefined && harmony >= LO - 5 && !ctx.clashes(harmony, start, end)) {
					notes.push({ note: harmony, vel: vel - 12, start: start + 0.012, end });
				}
			}
		}
	}

	return { notes, last: cur };
}
