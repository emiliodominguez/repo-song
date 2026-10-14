// Stereo buffer helpers.

import type { Stereo } from "../types.ts";

/**
 * Allocates a silent stereo buffer.
 *
 * @param length - Samples per channel.
 * @returns The buffer.
 */
export function stereo(length: number): Stereo {
	return [new Float32Array(length), new Float32Array(length)];
}

/**
 * Adds `src * gain` into `dst`.
 *
 * @param dst - Destination, modified in place.
 * @param src - Source.
 * @param gain - Linear gain.
 */
export function addInto(dst: Stereo, src: Stereo, gain: number): void {
	for (let c = 0; c < 2; c++) {
		const d = dst[c] as Float32Array;
		const s = src[c] as Float32Array;

		for (let i = 0; i < d.length; i++) {
			d[i] += s[i] * gain;
		}
	}
}

/**
 * Multiplies both channels by a linear gain.
 *
 * @param buf - Buffer, modified in place.
 * @param gain - Linear gain.
 */
export function applyGain(buf: Stereo, gain: number): void {
	for (const ch of buf) {
		for (let i = 0; i < ch.length; i++) {
			ch[i] *= gain;
		}
	}
}

/**
 * Linear fade in at the start and an equal-power fade out at the end.
 *
 * @param buf - Buffer, modified in place.
 * @param sampleRate - Sample rate in Hz.
 * @param inSec - Fade-in length.
 * @param outSec - Fade-out length.
 */
export function fade(buf: Stereo, sampleRate: number, inSec: number, outSec: number): void {
	const len = buf[0].length;
	const fi = Math.round(inSec * sampleRate);
	const fo = Math.round(outSec * sampleRate);

	for (const ch of buf) {
		for (let i = 0; i < fi && i < len; i++) {
			ch[i] *= i / fi;
		}

		for (let i = 0; i < fo && i < len; i++) {
			ch[len - 1 - i] *= Math.sin(((i / fo) * Math.PI) / 2);
		}
	}
}
