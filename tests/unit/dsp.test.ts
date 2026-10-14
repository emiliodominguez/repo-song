import { describe, expect, it } from "vitest";

import { makeRng } from "../../src/compose/rng.ts";
import { stereo } from "../../src/dsp/buffers.ts";
import { compress, gatedRmsDb, limit } from "../../src/dsp/dynamics.ts";
import { biquad } from "../../src/dsp/filters.ts";
import { convolve } from "../../src/dsp/reverb.ts";
import { bandTarget, matchTone, toneBands } from "../../src/dsp/tone.ts";
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
	it("matching EQ brings white noise inside the reference range", () => {
		const rng = makeRng("noise");
		const buf = stereo(SR * 4);

		for (const ch of buf) {
			for (let i = 0; i < ch.length; i++) {
				ch[i] = (rng.float() * 2 - 1) * 0.3;
			}
		}

		/**
		 * Largest distance (dB) of any band outside the reference range.
		 *
		 * @returns dB.
		 */
		function outside(): number {
			return Math.max(...toneBands(buf, SR).map((v, i) => Math.abs(v - bandTarget(v, i, 0))));
		}

		const before = outside();

		matchTone(buf, SR, { passes: 6, maxDb: 12 });
		expect(before).toBeGreaterThan(10);
		expect(outside()).toBeLessThan(before * 0.35);
	});

	it("leaves a mix that is already inside the range alone", () => {
		expect(bandTarget(-8, 3)).toBe(-8);
		expect(bandTarget(-2, 3)).toBeLessThan(-5);
	});
});

describe("reverb", () => {
	it("matches direct convolution on both channels", () => {
		const rng = makeRng("conv");
		const dry: Stereo = [new Float32Array(70_000), new Float32Array(70_000)];
		const ir: Stereo = [new Float32Array(300), new Float32Array(300)];

		for (const ch of [...dry, ...ir]) {
			for (let i = 0; i < ch.length; i++) {
				ch[i] = rng.float() * 2 - 1;
			}
		}

		const wet = convolve(dry, ir);

		for (const c of [0, 1] as const) {
			for (const n of [0, 299, 65_535, 65_536, 65_800, 69_999]) {
				let direct = 0;

				for (let k = 0; k < ir[c].length && k <= n; k++) {
					direct += ir[c][k] * dry[c][n - k];
				}

				expect(wet[c][n]).toBeCloseTo(direct, 3);
			}
		}
	});
});
