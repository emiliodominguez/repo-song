// Tonal balance: octave-band analysis and a matching EQ that nudges a mix toward a reference curve.

import type { Stereo } from "../types.ts";
import { biquad } from "./filters.ts";
import { fft } from "./reverb.ts";

/**
 * Octave-band balance (dB relative to total energy, 31 Hz..16 kHz) averaged from two CC-BY lofi masters:
 * "Lazy Daze" by Shane Ivers and "Trade Controls" by tcarisland. See docs/sound.md.
 */
export const LOFI_TONE = [-19.8, -4.3, -5.7, -11.1, -9.7, -14.4, -17.1, -22.8, -29.7, -40.9];

const TONE_BANDS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/**
 * Measures octave-band energy relative to the total.
 *
 * @param buf - Buffer (not modified).
 * @param sampleRate - Sample rate in Hz.
 * @returns Band levels in dB.
 */
export function toneBands(buf: Stereo, sampleRate: number): number[] {
	const energies = TONE_BANDS.map(function bandEnergy(f) {
		const c: Stereo = [Float32Array.from(buf[0]), Float32Array.from(buf[1])];

		biquad(c, "highpass", f / Math.SQRT2, sampleRate, { q: 0.9 });
		biquad(c, "lowpass", f * Math.SQRT2, sampleRate, { q: 0.9 });

		let e = 0;

		for (const ch of c) {
			for (let i = 0; i < ch.length; i++) {
				e += ch[i] * ch[i];
			}
		}

		return e;
	});

	const total = energies.reduce(function sum(s, e) {
		return s + e;
	}, 0);

	return energies.map(function toDb(e) {
		return 10 * Math.log10(e / total + 1e-12);
	});
}

export interface MatchToneOptions {
	/**
	 * Fraction of the band difference corrected per pass.
	 */
	strength?: number;
	/**
	 * Largest boost or cut per band.
	 */
	maxDb?: number;
	/**
	 * Measure-and-correct iterations.
	 */
	passes?: number;
}

/**
 * Matching EQ: nudges each octave band toward a target balance with shelves at the ends and peaks in between.
 *
 * @param buf - Buffer, modified in place.
 * @param sampleRate - Sample rate in Hz.
 * @param target - Target band levels (dB relative to total).
 * @param opts - Fraction of the difference corrected per pass, gain clamp, number of passes.
 * @returns Gains applied on the last pass, per band.
 */
export function matchTone(buf: Stereo, sampleRate: number, target: number[], opts: MatchToneOptions = {}): number[] {
	const { strength = 0.6, maxDb = 6, passes = 2 } = opts;
	let gains: number[] = [];

	for (let p = 0; p < passes; p++) {
		const now = toneBands(buf, sampleRate);

		gains = now.map(function correction(v, i) {
			return Math.max(-maxDb, Math.min(maxDb, (target[i] - v) * strength));
		});

		for (const [i, f] of TONE_BANDS.entries()) {
			const gainDb = gains[i];

			if (Math.abs(gainDb) < 0.25) {
				continue;
			}

			if (i === 0) {
				biquad(buf, "lowshelf", f * 1.4, sampleRate, { gainDb });
			} else if (i === TONE_BANDS.length - 1) {
				biquad(buf, "highshelf", f / 1.4, sampleRate, { gainDb });
			} else {
				biquad(buf, "peak", f, sampleRate, { gainDb, q: 1.2 });
			}
		}
	}

	return gains;
}

/**
 * Octave-band balance by FFT (8192-point Hann, 50% overlap, mono), relative to total energy. This is the method the
 * reference curve was measured with; `toneBands` (biquad band split) reads differently, notably at 31 Hz.
 *
 * @param buf - Buffer (not modified).
 * @param sampleRate - Sample rate in Hz.
 * @returns Band levels in dB.
 */
export function spectrumBands(buf: Stereo, sampleRate: number): number[] {
	const n = 8192;
	const acc = new Float64Array(n / 2 + 1);
	const re = new Float64Array(n);
	const im = new Float64Array(n);

	for (let s = 0; s + n < buf[0].length; s += n / 2) {
		for (let i = 0; i < n; i++) {
			re[i] = ((buf[0][s + i] + buf[1][s + i]) / 2) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
			im[i] = 0;
		}

		fft(re, im, false);

		for (let k = 0; k <= n / 2; k++) {
			acc[k] += re[k] * re[k] + im[k] * im[k];
		}
	}

	const total = acc.reduce(function sum(s, e) {
		return s + e;
	}, 0);

	return TONE_BANDS.map(function band(f) {
		let e = 0;

		for (let k = 0; k <= n / 2; k++) {
			const hz = (k * sampleRate) / n;

			if (hz >= f / Math.SQRT2 && hz < f * Math.SQRT2) {
				e += acc[k];
			}
		}

		return 10 * Math.log10(e / total + 1e-12);
	});
}
