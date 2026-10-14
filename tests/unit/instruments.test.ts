import { describe, expect, it } from "vitest";

import { stereo } from "../../src/dsp/buffers.ts";
import { type Instrument, playNote } from "../../src/instruments/sampler.ts";
import { bass, rhodes } from "../../src/instruments/synths.ts";
import { vcslNote } from "../../src/instruments/vcsl.ts";
import type { Stereo } from "../../src/types.ts";

const SR = 48_000;

/**
 * Estimates the fundamental of a buffer by autocorrelation over a window.
 *
 * @param buf - Audio.
 * @param from - Start sample.
 * @returns Hz.
 */
function pitch(buf: Stereo, from: number): number {
	const x = buf[0].subarray(from, from + 9600);

	let best = 0,
		bestLag = 0;

	for (let lag = 40; lag < 1200; lag++) {
		let s = 0;

		for (let i = 0; i + lag < x.length; i++) {
			s += x[i] * x[i + lag];
		}

		if (s > best) {
			best = s;
			bestLag = lag;
		}
	}

	return SR / bestLag;
}

/**
 * MIDI note to frequency.
 *
 * @param n - Note.
 * @returns Hz.
 */
function hz(n: number): number {
	return 440 * 2 ** ((n - 69) / 12);
}

describe("sampler", () => {
	it("repitches a zone to the requested note, across sample rates", () => {
		const data = stereo(44_100 * 2);

		for (const ch of data) {
			for (let i = 0; i < ch.length; i++) {
				ch[i] = 0.5 * Math.sin((2 * Math.PI * hz(60) * i) / 44_100);
			}
		}

		const inst: Instrument = { zones: [{ root: 60, layer: 1, rr: 1, sampleRate: 44_100, data }], layers: 1 };
		const out = stereo(SR * 2);

		playNote(out, SR, inst, new Map(), { note: 64, vel: 100, start: 0, end: 1.5 });
		expect(pitch(out, 4800)).toBeCloseTo(hz(64), -0.5);
	});

	it("maps VCSL note names with C0 at MIDI 24", () => {
		expect(vcslNote("C4")).toBe(72);
		expect(vcslNote("G2")).toBe(55);
		expect(vcslNote("C#0")).toBe(25);
	});
});

describe("synths", () => {
	it("Rhodes and bass sound at the played pitch", () => {
		const keys = stereo(SR);
		const low = stereo(SR);

		rhodes(keys, SR, { note: 57, vel: 80, start: 0, end: 0.9 });
		bass(low, SR, { note: 45, vel: 90, start: 0, end: 0.9 });
		expect(pitch(keys, 2400)).toBeCloseTo(hz(57), -0.5);
		expect(pitch(low, 2400)).toBeCloseTo(hz(45), -0.5);
	});
});
