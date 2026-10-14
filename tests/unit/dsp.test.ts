import { describe, expect, it } from "vitest";

import { makeRng } from "../../src/compose/rng.ts";
import { stereo } from "../../src/dsp/buffers.ts";
import { compress, gatedRmsDb, limit } from "../../src/dsp/dynamics.ts";
import { biquad } from "../../src/dsp/filters.ts";
import { convolve } from "../../src/dsp/reverb.ts";
import { LOFI_TONE, matchTone, toneBands } from "../../src/dsp/tone.ts";
import type { Stereo } from "../../src/types.ts";

const SR = 48_000;

/**
 * A stereo sine.
 *
 * @param freq - Frequency in Hz.
 * @param seconds - Length.
 * @param amp - Peak amplitude.
 * @returns Buffer.
 */
function sine(freq: number, seconds: number, amp = 0.5): Stereo {
	const buf = stereo(Math.round(seconds * SR));

	for (const ch of buf) {
		for (let i = 0; i < ch.length; i++) {
			ch[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
		}
	}

	return buf;
}

describe("filters", () => {
	it("lowpass passes lows and cuts highs", () => {
		const low = sine(100, 1);
		const high = sine(10_000, 1);

		biquad(low, "lowpass", 1000, SR);
		biquad(high, "lowpass", 1000, SR);
		expect(gatedRmsDb(low, SR)).toBeCloseTo(-9.03, 0);
		expect(gatedRmsDb(high, SR)).toBeLessThan(-45);
	});

	it("peak boosts by its gain at the centre", () => {
		const buf = sine(1000, 1);
		const before = gatedRmsDb(buf, SR);

		biquad(buf, "peak", 1000, SR, { gainDb: 6, q: 1 });
		expect(gatedRmsDb(buf, SR) - before).toBeCloseTo(6, 1);
	});
});

describe("dynamics", () => {
	it("limiter holds every sample under the ceiling", () => {
		const buf = sine(220, 1, 1.8);

		limit(buf, SR, { ceilingDb: -1.5 });

		const ceiling = 10 ** (-1.5 / 20);

		for (const ch of buf) {
			for (const x of ch) {
				expect(Math.abs(x)).toBeLessThanOrEqual(ceiling + 1e-6);
			}
		}
	});

	it("compressor reduces level above threshold", () => {
		const buf = sine(220, 1, 0.9);
		const before = gatedRmsDb(buf, SR);

		compress(buf, SR, { thresholdDb: -20, ratio: 4 });
		expect(gatedRmsDb(buf, SR)).toBeLessThan(before - 6);
	});
});

describe("tone", () => {
	it("matching EQ moves a mix toward the reference curve", () => {
		const rng = makeRng("noise");
		const buf = stereo(SR * 4);

		for (const ch of buf) {
			for (let i = 0; i < ch.length; i++) {
				ch[i] = (rng.float() * 2 - 1) * 0.3;
			}
		}

		/**
		 * Mean absolute distance from the target curve.
		 *
		 * @returns dB.
		 */
		function distance(): number {
			const bands = toneBands(buf, SR);

			return (
				bands.reduce(function sum(s, v, i) {
					return s + Math.abs(v - LOFI_TONE[i]);
				}, 0) / bands.length
			);
		}

		const before = distance();

		matchTone(buf, SR, LOFI_TONE, { strength: 0.75, maxDb: 7, passes: 3 });
		expect(distance()).toBeLessThan(before * 0.6);
	});
});

describe("reverb", () => {
	it("convolving with a unit impulse returns the input", () => {
		const dry = sine(440, 0.5);
		const ir = stereo(64);

		ir[0][0] = 1;
		ir[1][0] = 1;

		const wet = convolve(dry, ir);

		for (let i = 0; i < dry[0].length; i += 997) {
			expect(wet[0][i]).toBeCloseTo(dry[0][i], 5);
		}
	});
});
