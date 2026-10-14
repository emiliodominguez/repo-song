// Level and dynamics: loudness measurement, compression, sidechain pumping, look-ahead limiting.

import type { Stereo } from "../types.ts";

/**
 * Gated RMS level in dBFS, ignoring near-silent 400 ms blocks (a rough stand-in for integrated loudness).
 *
 * @param buf - Buffer.
 * @param sampleRate - Sample rate in Hz.
 * @returns Level in dB (-120 for silence).
 */
export function gatedRmsDb(buf: Stereo, sampleRate: number): number {
	const [l, r] = buf;
	const block = Math.round(0.4 * sampleRate);

	let sum = 0,
		count = 0;

	for (let s = 0; s + block <= l.length; s += block) {
		let e = 0;

		for (let i = s; i < s + block; i++) {
			e += (l[i] ** 2 + r[i] ** 2) / 2;
		}

		e /= block;

		if (e > 1e-6) {
			sum += e;
			count++;
		}
	}

	return count ? 10 * Math.log10(sum / count) : -120;
}

export interface CompressorOptions {
	thresholdDb?: number;
	ratio?: number;
	attackMs?: number;
	releaseMs?: number;
}

/**
 * Stereo-linked feed-forward compressor (peak detector in the log domain).
 *
 * @param buf - Buffer, modified in place.
 * @param sampleRate - Sample rate in Hz.
 * @param opts - Threshold, ratio and timing.
 */
export function compress(buf: Stereo, sampleRate: number, opts: CompressorOptions = {}): void {
	const { thresholdDb = -18, ratio = 3, attackMs = 15, releaseMs = 250 } = opts;
	const [l, r] = buf;
	const att = Math.exp(-1 / ((attackMs / 1000) * sampleRate));
	const rel = Math.exp(-1 / ((releaseMs / 1000) * sampleRate));
	let env = -120;

	for (let i = 0; i < l.length; i++) {
		const level = 20 * Math.log10(Math.max(Math.abs(l[i]), Math.abs(r[i]), 1e-9));

		env = level > env ? att * env + (1 - att) * level : rel * env + (1 - rel) * level;

		const over = env - thresholdDb;

		if (over > 0) {
			const gain = 10 ** ((-over * (1 - 1 / ratio)) / 20);

			l[i] *= gain;
			r[i] *= gain;
		}
	}
}

export interface SidechainOptions {
	/**
	 * How far the signal ducks, 0 to 1.
	 */
	depth?: number;
	/**
	 * Recovery time constant.
	 */
	releaseMs?: number;
}

/**
 * Sidechain pump: ducks the signal after each kick and lets it breathe back, like a compressor keyed off the kick.
 *
 * @param buf - Buffer, modified in place.
 * @param sampleRate - Sample rate in Hz.
 * @param kickTimes - Kick onsets in seconds.
 * @param opts - Duck depth (0..1) and recovery time.
 */
export function sidechain(buf: Stereo, sampleRate: number, kickTimes: number[], opts: SidechainOptions = {}): void {
	const { depth = 0.5, releaseMs = 180 } = opts;
	const [l, r] = buf;
	const env = new Float32Array(l.length).fill(1);
	const attack = Math.round(0.004 * sampleRate);
	const tau = (releaseMs / 1000) * sampleRate;

	for (const t of kickTimes) {
		const start = Math.round(t * sampleRate);
		const end = Math.min(l.length, start + Math.round(tau * 5));

		for (let i = Math.max(0, start - attack); i < end; i++) {
			const k = i < start ? (start - i) / attack : 0;
			const duck = i < start ? depth * (1 - k) : depth * Math.exp(-(i - start) / tau);

			env[i] = Math.min(env[i], 1 - duck);
		}
	}

	for (let i = 0; i < l.length; i++) {
		l[i] *= env[i];
		r[i] *= env[i];
	}
}

export interface LimiterOptions {
	/**
	 * Maximum sample peak in dBFS.
	 */
	ceilingDb?: number;
	/**
	 * How early the gain starts dropping before a peak.
	 */
	lookaheadMs?: number;
	/**
	 * Recovery time constant.
	 */
	releaseMs?: number;
}

/**
 * Look-ahead brickwall limiter: gain ramps down before each peak instead of clipping it, then recovers smoothly.
 *
 * @param buf - Buffer, modified in place.
 * @param sampleRate - Sample rate in Hz.
 * @param opts - Ceiling and timing.
 */
export function limit(buf: Stereo, sampleRate: number, opts: LimiterOptions = {}): void {
	const { ceilingDb = -1, lookaheadMs = 5, releaseMs = 80 } = opts;
	const [l, r] = buf;
	const len = l.length;
	const ceiling = 10 ** (ceilingDb / 20);
	const look = Math.max(1, Math.round((lookaheadMs / 1000) * sampleRate));
	const need = new Float32Array(len);

	for (let i = 0; i < len; i++) {
		need[i] = Math.min(1, ceiling / Math.max(Math.abs(l[i]), Math.abs(r[i]), 1e-9));
	}

	const gain = new Float32Array(len);
	let g = 1;

	for (let i = len - 1; i >= 0; i--) {
		g = Math.min(need[i], g + (1 - g) / look);
		gain[i] = g;
	}

	const rel = Math.exp(-1 / ((releaseMs / 1000) * sampleRate));

	g = 1;

	for (let i = 0; i < len; i++) {
		const target = gain[i];

		g = target < g ? target : rel * g + (1 - rel) * target;
		l[i] *= g;
		r[i] *= g;
	}
}
