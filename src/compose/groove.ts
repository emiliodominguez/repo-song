// Boom-bap drums for one bar: swung 16ths, a lazy late snare, ghost notes, accented hats, fills and stops.

import type { Rng } from "./rng.ts";

/**
 * General MIDI drum notes the renderer maps to sounds.
 */
export const DRUM = { kick: 36, sideStick: 37, snare: 38, closedHat: 42, openHat: 46, shaker: 70 } as const;

export interface Hit {
	note: number;
	vel: number;
	/**
	 * Onset in seconds.
	 */
	time: number;
}

/**
 * Swing offset for a position on the 16th grid: off-beat 8ths sit late by `swing` of a 16th, off-beat 16ths by 1.5×
 * that, which keeps them in order and gives the lazy, slightly triplet-leaning lofi pocket.
 *
 * @param step - Position in 16ths from the beat grid (fractional positions get no swing).
 * @param s16 - Length of a 16th in seconds.
 * @param swing - Swing amount (0 straight, ~0.2 heavy).
 * @returns Delay in seconds.
 */
export function swingOffset(step: number, s16: number, swing: number): number {
	if (!Number.isInteger(step)) {
		return 0;
	}

	const m = ((step % 4) + 4) % 4;

	return m === 2 ? swing * s16 : m % 2 === 1 ? 1.5 * swing * s16 : 0;
}

/**
 * Kick patterns on a 16-step bar, from sparse to busy.
 */
const KICKS: number[][] = [
	[0, 10],
	[0, 7, 10],
	[0, 3, 10],
	[0, 8, 11],
	[0, 6, 10, 13],
];

export interface BarGroove {
	/**
	 * Index into the kick pattern table, fixed for a phrase so the groove is consistent.
	 */
	kickPattern: number;
	energy: number;
	/**
	 * What the bar does at the end: nothing special, a ghost-note pickup, or stop dead after beat 3.
	 */
	fill: "none" | "ghosts" | "stop";
}

/**
 * Picks a phrase's kick pattern: busier phrases get busier kicks.
 *
 * @param rng - Groove RNG.
 * @param energy - Phrase energy.
 * @returns Kick pattern index.
 */
export function pickKickPattern(rng: Rng, energy: number): number {
	const top = energy > 0.8 ? KICKS.length : energy > 0.55 ? 4 : 2;

	return rng.int(0, top - 1);
}

/**
 * Generates one bar of drums.
 *
 * @param rng - Groove RNG.
 * @param barStart - Bar onset in seconds.
 * @param secPerBeat - Beat length.
 * @param swing - Fraction of a 16th that off-beat 16ths are delayed by.
 * @param groove - Pattern, energy and fill for this bar.
 * @returns Hits and the 16th steps where the kick plays (the bass locks to them).
 */
export function drumBar(rng: Rng, barStart: number, secPerBeat: number, swing: number, groove: BarGroove): { hits: Hit[]; kickSteps: number[] } {
	const s16 = secPerBeat / 4;
	const hits: Hit[] = [];
	const { energy, fill } = groove;
	const lastStep = fill === "stop" ? 8 : 16;

	/**
	 * Places a hit on a 16th step, swung and humanised.
	 *
	 * @param note - Drum note.
	 * @param step - 16th step (0..15).
	 * @param vel - Velocity.
	 * @param offsetMs - Player feel: positive is behind the beat.
	 * @param jitterMs - Random timing spread.
	 */
	function hit(note: number, step: number, vel: number, offsetMs: number, jitterMs: number): void {
		if (step > lastStep) {
			return;
		}

		const time = barStart + step * s16 + swingOffset(step, s16, swing) + (offsetMs + rng.gauss() * jitterMs) / 1000;

		hits.push({ note, vel: Math.max(1, Math.min(127, Math.round(vel))), time: Math.max(0, time) });
	}

	const kickSteps = (KICKS[groove.kickPattern] ?? KICKS[0]).filter(function playable(s) {
		return s <= lastStep;
	});

	for (const [i, step] of kickSteps.entries()) {
		hit(DRUM.kick, step, i === 0 ? rng.int(98, 110) : rng.int(80, 94), 0, 3);
	}

	// backbeat: a soft side-stick in sparse phrases, a lazy snare otherwise
	const backbeat = energy < 0.45 ? DRUM.sideStick : DRUM.snare;

	for (const step of [4, 12]) {
		hit(backbeat, step, backbeat === DRUM.snare ? rng.int(86, 100) : rng.int(70, 86), backbeat === DRUM.snare ? 14 : 9, 4);
	}

	if (energy >= 0.5) {
		for (const step of [6, 9, 15]) {
			if (rng.chance(0.3 + (energy - 0.5) * 0.4)) {
				hit(DRUM.snare, step, rng.int(22, 36), 10, 6);
			}
		}
	}

	// hats: 8ths with the beat accented, 16th pickups when it's busy, an open hat on the "and" of 4 now and then
	const openOnFour = energy > 0.55 && rng.chance(0.35);

	for (let step = 0; step < 16; step += 2) {
		if (openOnFour && step === 14) {
			hit(DRUM.openHat, 14, rng.int(52, 66), -2, 4);
			continue;
		}

		hit(DRUM.closedHat, step, step % 4 === 0 ? rng.int(56, 68) : rng.int(40, 52), -2, 5);
	}

	if (energy > 0.6) {
		for (const step of [3, 7, 11, 15]) {
			if (rng.chance((energy - 0.55) * 0.9)) {
				hit(DRUM.closedHat, step, rng.int(28, 40), -2, 5);
			}
		}
	}

	if (energy > 0.78) {
		for (let step = 0; step < 16; step++) {
			hit(DRUM.shaker, step, step % 2 === 1 ? rng.int(34, 44) : rng.int(22, 30), 0, 6);
		}
	}

	if (fill === "ghosts") {
		for (const step of [13, 14, 15]) {
			hit(DRUM.snare, step, 26 + (step - 13) * 9 + rng.int(0, 6), 10, 5);
		}
	}

	return { hits, kickSteps };
}

/**
 * The softest pulse: hats on quarter notes, for breakdowns.
 *
 * @param rng - Groove RNG.
 * @param barStart - Bar onset in seconds.
 * @param secPerBeat - Beat length.
 * @returns Hits.
 */
export function pulseBar(rng: Rng, barStart: number, secPerBeat: number): Hit[] {
	const hits: Hit[] = [];

	for (let beat = 0; beat < 4; beat++) {
		hits.push({ note: DRUM.closedHat, vel: rng.int(30, 42), time: barStart + beat * secPerBeat + rng.gauss() * 0.004 });
	}

	return hits;
}
