// RBJ "Audio EQ Cookbook" biquads, run in place on stereo buffers (double-precision state, float storage).

import type { Stereo } from "../types.ts";

export type FilterType = "lowpass" | "highpass" | "lowshelf" | "highshelf" | "peak";

export interface FilterOptions {
	/**
	 * Resonance / bandwidth; defaults to 1/sqrt(2).
	 */
	q?: number;
	/**
	 * Shelf or peak gain in dB.
	 */
	gainDb?: number;
}

/**
 * Normalised biquad coefficients.
 *
 * @param type - Filter shape.
 * @param freq - Corner or centre frequency in Hz.
 * @param sampleRate - Sample rate in Hz.
 * @param opts - Q and gain.
 * @returns [b0, b1, b2, a1, a2] divided by a0.
 */
export function biquadCoefs(type: FilterType, freq: number, sampleRate: number, opts: FilterOptions = {}): [number, number, number, number, number] {
	const q = opts.q ?? Math.SQRT1_2;
	const w0 = (2 * Math.PI * freq) / sampleRate;
	const cos = Math.cos(w0);
	const sin = Math.sin(w0);
	const alpha = sin / (2 * q);
	const A = 10 ** ((opts.gainDb ?? 0) / 40);
	const sqA = 2 * Math.sqrt(A) * alpha;
	let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

	switch (type) {
		case "lowpass":
			[b0, b1, b2, a0, a1, a2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
			break;
		case "highpass":
			[b0, b1, b2, a0, a1, a2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
			break;
		case "lowshelf":
			b0 = A * (A + 1 - (A - 1) * cos + sqA);
			b1 = 2 * A * (A - 1 - (A + 1) * cos);
			b2 = A * (A + 1 - (A - 1) * cos - sqA);
			a0 = A + 1 + (A - 1) * cos + sqA;
			a1 = -2 * (A - 1 + (A + 1) * cos);
			a2 = A + 1 + (A - 1) * cos - sqA;
			break;
		case "highshelf":
			b0 = A * (A + 1 + (A - 1) * cos + sqA);
			b1 = -2 * A * (A - 1 + (A + 1) * cos);
			b2 = A * (A + 1 + (A - 1) * cos - sqA);
			a0 = A + 1 - (A - 1) * cos + sqA;
			a1 = 2 * (A - 1 - (A + 1) * cos);
			a2 = A + 1 - (A - 1) * cos - sqA;
			break;
		case "peak":
			[b0, b1, b2, a0, a1, a2] = [1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A];
			break;
	}

	return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/**
 * Runs a biquad filter over both channels in place.
 *
 * @param stereo - Buffer to filter.
 * @param type - Filter shape.
 * @param freq - Frequency in Hz.
 * @param sampleRate - Sample rate in Hz.
 * @param opts - Q and gain.
 */
export function biquad(stereo: Stereo, type: FilterType, freq: number, sampleRate: number, opts?: FilterOptions): void {
	const [b0, b1, b2, a1, a2] = biquadCoefs(type, freq, sampleRate, opts);

	for (const ch of stereo) {
		let x1 = 0,
			x2 = 0,
			y1 = 0,
			y2 = 0;

		for (let i = 0; i < ch.length; i++) {
			const x = ch[i];
			const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;

			x2 = x1;
			x1 = x;
			y2 = y1;
			y1 = y;
			ch[i] = y;
		}
	}
}
