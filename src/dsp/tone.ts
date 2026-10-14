// Tonal balance: octave-band analysis and a matching EQ that keeps a mix inside the range real lofi records occupy.

import type { Stereo } from "../types.ts";
import { biquad, biquadCoefs } from "./filters.ts";

/**
 * Octave band centres, 31 Hz to 16 kHz.
 */
export const TONE_BANDS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/**
 * Octave-band balance of four lofi masters (whole tracks, measured with `toneBands`, dB relative to total energy):
 * "Lazy Daze" (Shane Ivers, CC BY), "Trade Controls" and "Diminishing Returns" (tcarisland, CC BY),
 * "Chill lofi inspired" (omfgdude, CC0). Regenerate with `pnpm reference-curve`; see docs/sound.md.
 */
export const LOFI_REFERENCE = {
	min: [-14.8, -7.5, -6.9, -10.4, -13.7, -16.5, -22.5, -30.7, -37.8, -44.7],
	mean: [-12.6, -6.3, -6.1, -8.0, -8.6, -12.3, -18.2, -23.7, -29.2, -35.3],
	max: [-10.0, -4.8, -4.2, -5.2, -5.9, -8.3, -15.4, -19.7, -24.7, -31.1],
};

/**
 * Measures octave-band energy relative to the total, splitting bands with a highpass/lowpass pair at f/√2 and f·√2.
 * All bands are filtered in one pass over the signal.
 *
 * @param buf - Buffer (not modified).
 * @param sampleRate - Sample rate in Hz.
 * @returns Band levels in dB.
 */
export function toneBands(buf: Stereo, sampleRate: number): number[] {
	const nb = TONE_BANDS.length;

	// per band: highpass b0 b1 b2 a1 a2, then lowpass b0 b1 b2 a1 a2
	const k = new Float64Array(
		TONE_BANDS.flatMap((f) => [
			...biquadCoefs("highpass", f / Math.SQRT2, sampleRate, { q: 0.9 }),
			...biquadCoefs("lowpass", f * Math.SQRT2, sampleRate, { q: 0.9 }),
		]),
	);

	const energies = new Float64Array(nb);
	// per band: highpass x1 x2 y1 y2, then lowpass x1 x2 y1 y2
	const state = new Float64Array(nb * 8);

	for (const ch of buf) {
		state.fill(0);

		for (let i = 0; i < ch.length; i++) {
			const x = ch[i];

			for (let b = 0; b < nb; b++) {
				const o = b * 8;
				const c = b * 10;
				const y = k[c] * x + k[c + 1] * state[o] + k[c + 2] * state[o + 1] - k[c + 3] * state[o + 2] - k[c + 4] * state[o + 3];

				state[o + 1] = state[o];
				state[o] = x;
				state[o + 3] = state[o + 2];
				state[o + 2] = y;

				const z = k[c + 5] * y + k[c + 6] * state[o + 4] + k[c + 7] * state[o + 5] - k[c + 8] * state[o + 6] - k[c + 9] * state[o + 7];

				state[o + 5] = state[o + 4];
				state[o + 4] = y;
				state[o + 7] = state[o + 6];
				state[o + 6] = z;
				energies[b] += z * z;
			}
		}
	}

	const total = energies.reduce((sum, e) => sum + e, 0);

	return [...energies].map((e) => 10 * Math.log10(e / total + 1e-12));
}

/**
 * Where a band level should move to: nowhere if it already sits inside the reference range (shrunk toward the mean
 * by `margin`), otherwise to the nearest edge of that range. Bands where the references disagree get left alone.
 *
 * @param value - Measured band level.
 * @param i - Band index.
 * @param margin - Fraction (0..1) of the range trimmed from each side.
 * @returns Target level.
 */
export function bandTarget(value: number, i: number, margin = 0.25): number {
	const { min, mean, max } = LOFI_REFERENCE;
	const lo = min[i] + (mean[i] - min[i]) * margin;
	const hi = max[i] - (max[i] - mean[i]) * margin;

	return Math.min(hi, Math.max(lo, value));
}

export interface MatchToneOptions {
	/**
	 * Fraction of the distance to the target corrected per pass.
	 */
	strength?: number;
	/**
	 * Largest boost or cut per band per pass.
	 */
	maxDb?: number;
	/**
	 * Measure-and-correct iterations.
	 */
	passes?: number;
}

/**
 * Matching EQ: measures the mix and nudges only the bands outside the reference range back in, with shelves at the
 * ends and octave-wide peaks in between.
 *
 * @param buf - Buffer, modified in place.
 * @param sampleRate - Sample rate in Hz.
 * @param opts - Strength, clamp and passes.
 * @returns Total gain applied per band across all passes.
 */
export function matchTone(buf: Stereo, sampleRate: number, opts: MatchToneOptions = {}): number[] {
	const { strength = 0.8, maxDb = 6, passes = 3 } = opts;

	const applied = TONE_BANDS.map(function zero() {
		return 0;
	});

	for (let p = 0; p < passes; p++) {
		const now = toneBands(buf, sampleRate);

		for (const [i, f] of TONE_BANDS.entries()) {
			const gainDb = Math.max(-maxDb, Math.min(maxDb, (bandTarget(now[i], i) - now[i]) * strength));

			if (Math.abs(gainDb) < 0.25) {
				continue;
			}

			applied[i] += gainDb;

			if (i === 0) {
				biquad(buf, "lowshelf", f * 1.4, sampleRate, { gainDb });
			} else if (i === TONE_BANDS.length - 1) {
				biquad(buf, "highshelf", f / 1.4, sampleRate, { gainDb });
			} else {
				biquad(buf, "peak", f, sampleRate, { gainDb, q: 1.2 });
			}
		}
	}

	return applied;
}
