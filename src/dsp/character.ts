// Analogue and vintage character: saturation, tape wow/flutter, vinyl surface, sampler crunch, Rhodes tremolo.

import type { Rng } from "../compose/rng.ts";
import type { Stereo } from "../types.ts";
import { biquad } from "./filters.ts";

/**
 * Tanh saturation, normalised so unity-level peaks stay near unity.
 *
 * @param buf - Buffer, modified in place.
 * @param drive - 1 is gentle warmth, 3+ is obvious grit.
 */
export function saturate(buf: Stereo, drive: number): void {
	const norm = 1 / Math.tanh(drive);

	for (const ch of buf) {
		for (let i = 0; i < ch.length; i++) {
			ch[i] = Math.tanh(ch[i] * drive) * norm;
		}
	}
}

export interface WobbleOptions {
	/**
	 * Slow pitch drift rate.
	 */
	wowHz?: number;
	/**
	 * Slow drift depth as delay modulation.
	 */
	wowMs?: number;
	/**
	 * Fast flutter rate.
	 */
	flutterHz?: number;
	/**
	 * Fast flutter depth.
	 */
	flutterMs?: number;
}

/**
 * Tape wow and flutter: a slowly modulated fractional delay that bends pitch the way a worn cassette does.
 *
 * @param buf - Buffer, modified in place.
 * @param sampleRate - Sample rate in Hz.
 * @param opts - Modulation rates and depths.
 */
export function tapeWobble(buf: Stereo, sampleRate: number, opts: WobbleOptions = {}): void {
	const { wowHz = 0.45, wowMs = 1.6, flutterHz = 6.5, flutterMs = 0.12 } = opts;
	const base = Math.ceil(((wowMs + flutterMs) * 2 * sampleRate) / 1000) + 4;

	for (const ch of buf) {
		const src = Float32Array.from(ch);

		for (let i = 0; i < ch.length; i++) {
			const t = i / sampleRate;
			const mod = wowMs * Math.sin(2 * Math.PI * wowHz * t) + flutterMs * Math.sin(2 * Math.PI * flutterHz * t);
			const pos = i - base / 2 - (mod * sampleRate) / 1000;
			const j = Math.floor(pos);
			const frac = pos - j;
			const a = j >= 0 && j < src.length ? src[j] : 0;
			const b = j + 1 >= 0 && j + 1 < src.length ? src[j + 1] : 0;

			ch[i] = a + (b - a) * frac;
		}
	}
}

export interface VinylOptions {
	/**
	 * Surface noise level in dBFS.
	 */
	hissDb?: number;
	/**
	 * Average crackle density.
	 */
	cracklesPerSec?: number;
}

/**
 * Adds vinyl surface noise (band-limited pink hiss) and sparse crackles.
 *
 * @param buf - Buffer, modified in place.
 * @param sampleRate - Sample rate in Hz.
 * @param rng - Seeded RNG, so the crackle pattern is reproducible.
 * @param opts - Noise floor and crackle density.
 */
export function vinyl(buf: Stereo, sampleRate: number, rng: Rng, opts: VinylOptions = {}): void {
	const { hissDb = -42, cracklesPerSec = 4 } = opts;
	const len = buf[0].length;
	const noise: Stereo = [new Float32Array(len), new Float32Array(len)];

	for (const ch of noise) {
		// Paul Kellet's economy pink noise
		let b0 = 0,
			b1 = 0,
			b2 = 0;

		for (let i = 0; i < len; i++) {
			const white = rng.float() * 2 - 1;

			b0 = 0.99765 * b0 + white * 0.099046;
			b1 = 0.963 * b1 + white * 0.2965164;
			b2 = 0.57 * b2 + white * 1.0526913;
			ch[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
		}
	}

	biquad(noise, "highpass", 900, sampleRate);
	biquad(noise, "lowpass", 7000, sampleRate);

	const hiss = 10 ** (hissDb / 20);
	const pCrackle = cracklesPerSec / sampleRate;
	const decay = Math.exp(-1 / (0.0006 * sampleRate));
	let crackle = 0;

	for (let i = 0; i < len; i++) {
		if (rng.float() < pCrackle) {
			crackle = (rng.float() * 2 - 1) * (0.02 + rng.float() * 0.06);
		}

		crackle *= decay;
		buf[0][i] += noise[0][i] * hiss + crackle;
		buf[1][i] += noise[1][i] * hiss + crackle * 0.8;
	}
}

export interface CrunchOptions {
	/**
	 * Hold rate in Hz (the SP-1200 ran at 26.04 kHz).
	 */
	rate?: number;
	/**
	 * Bit depth.
	 */
	bits?: number;
}

/**
 * Vintage sampler character (SP-1200 / MPC-60 style): sample-and-hold to a lower rate and reduce bit depth.
 * Band-limit before calling it, or the aliasing gets harsh.
 *
 * @param buf - Buffer, modified in place.
 * @param sampleRate - Sample rate in Hz.
 * @param opts - Target rate and bit depth.
 */
export function crunch(buf: Stereo, sampleRate: number, opts: CrunchOptions = {}): void {
	const { rate = 26040, bits = 12 } = opts;
	const step = sampleRate / rate;
	const q = 2 ** (bits - 1);

	for (const ch of buf) {
		let acc = step;
		let held = 0;

		for (let i = 0; i < ch.length; i++) {
			acc += 1;

			if (acc >= step) {
				acc -= step;
				held = Math.round(ch[i] * q) / q;
			}

			ch[i] = held;
		}
	}
}

export interface TremoloOptions {
	/**
	 * Modulation speed.
	 */
	rateHz?: number;
	/**
	 * Modulation depth, 0 to 1.
	 */
	depth?: number;
}

/**
 * Stereo tremolo (Rhodes Suitcase style): opposing amplitude modulation on left and right.
 *
 * @param buf - Buffer, modified in place.
 * @param sampleRate - Sample rate in Hz.
 * @param opts - Speed and depth (0..1).
 */
export function tremolo(buf: Stereo, sampleRate: number, opts: TremoloOptions = {}): void {
	const { rateHz = 4.2, depth = 0.3 } = opts;
	const [l, r] = buf;

	for (let i = 0; i < l.length; i++) {
		const m = Math.sin((2 * Math.PI * rateHz * i) / sampleRate) * depth;

		l[i] *= 1 + m;
		r[i] *= 1 - m;
	}
}
