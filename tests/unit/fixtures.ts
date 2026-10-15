// A deterministic synthetic history: two years, a busy launch, a quiet summer, a release, contributors joining.

import type { Commit, History, Tag } from "../../src/history.ts";

const DAY = 86400;
const T0 = 1_640_995_200; // 2022-01-01

/**
 * Builds the fixture history.
 *
 * @returns History with a burst, a lull, three tags and five authors.
 */
export function fixtureHistory(): Pick<History, "root" | "commits" | "tags"> {
	const commits: Commit[] = [];
	const authors = ["ada@x.dev", "ben@x.dev", "cy@x.dev", "di@x.dev", "eve@x.dev"];

	for (let d = 0; d < 730; d++) {
		// launch burst in the first two months, near-silence in the summer of year one, steady afterwards
		const perDay = d < 60 ? 6 : d > 150 && d < 260 ? (d % 20 === 0 ? 1 : 0) : d % 2;
		const team = d < 100 ? 1 : d < 400 ? 3 : 5;

		for (let k = 0; k < perDay; k++) {
			commits.push({ time: T0 + d * DAY + k * 3600, author: authors[(d + k) % team] ?? "ada@x.dev" });
		}
	}

	const tags: Tag[] = [
		{ name: "v0.1.0", time: T0 + 58 * DAY },
		{ name: "v1.0.0", time: T0 + 420 * DAY },
		{ name: "v1.1.0", time: T0 + 700 * DAY },
	];

	return { root: "df6110d5dfbd74d79e1e4aa0b9baa8167cad46e5", commits, tags };
}

/**
 * The integer test signal behind tests/fixtures/flac/*.flac: a chord of sines plus deterministic noise, different per
 * channel, so every predictor and stereo mode gets exercised. Regenerate the fixtures with `node tests/fixtures/flac/make.ts`.
 *
 * @param bits - Sample depth.
 * @param channels - 1 or 2.
 * @param frames - Length.
 * @returns Interleaved integer samples.
 */
export function flacSignal(bits: number, channels: number, frames: number): Int32Array {
	const out = new Int32Array(frames * channels);
	const full = 2 ** (bits - 1) - 1;
	let state = 0x2545f491;

	for (let i = 0; i < frames; i++) {
		for (let c = 0; c < channels; c++) {
			state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

			const t = i / 44100;
			const tone = 0.4 * Math.sin(2 * Math.PI * (220 + 110 * c) * t) + 0.2 * Math.sin(2 * Math.PI * 659.25 * t + c);
			const noise = (state / 2 ** 32 - 0.5) * 0.02;

			out[i * channels + c] = Math.round((tone + noise) * full);
		}
	}

	return out;
}
